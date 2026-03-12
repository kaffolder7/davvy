<?php

namespace App\Http\Controllers;

use App\Enums\ContactChangeStatus;
use App\Enums\Role;
use App\Models\AddressBook;
use App\Models\AddressBookContactMilestoneCalendar;
use App\Models\AppSetting;
use App\Models\Calendar;
use App\Models\ContactChangeRequest;
use App\Models\User;
use App\Services\Analytics\OpenPanelAnalyticsService;
use App\Services\Backups\BackupRestoreService;
use App\Services\Backups\BackupService;
use App\Services\Backups\BackupSettingsService;
use App\Services\Contacts\ContactMilestoneCalendarService;
use App\Services\RegistrationSettingsService;
use App\Services\Security\TwoFactorService;
use App\Services\Security\TwoFactorSettingsService;
use App\Services\UserDeletionService;
use App\Services\UserOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class AdminController extends Controller
{
    /**
     * Creates a new admin controller instance.
     *
     * @param  RegistrationSettingsService  $registrationSettings
     * @param  OpenPanelAnalyticsService  $analytics
     * @param  ContactMilestoneCalendarService  $milestoneCalendarService
     * @param  BackupSettingsService  $backupSettings
     * @param  BackupService  $backupService
     * @param  BackupRestoreService  $backupRestoreService
     * @param  TwoFactorSettingsService  $twoFactorSettings
     * @param  TwoFactorService  $twoFactor
     * @param  UserOnboardingService  $onboarding
     * @param  UserDeletionService  $userDeletionService
     * @return void
     */
    public function __construct(
        private readonly RegistrationSettingsService $registrationSettings,
        private readonly OpenPanelAnalyticsService $analytics,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
        private readonly BackupSettingsService $backupSettings,
        private readonly BackupService $backupService,
        private readonly BackupRestoreService $backupRestoreService,
        private readonly TwoFactorSettingsService $twoFactorSettings,
        private readonly TwoFactorService $twoFactor,
        private readonly UserOnboardingService $onboarding,
        private readonly UserDeletionService $userDeletionService,
    ) {}

    /**
     * Returns users for the admin dashboard.
     *
     * @return JsonResponse
     */
    public function users(): JsonResponse
    {
        $users = User::query()
            ->withCount(['calendars', 'addressBooks'])
            ->orderBy('id')
            ->get()
            ->map(function (User $user): array {
                $payload = $user->toArray();
                $payload['two_factor_enabled'] = $user->hasTwoFactorEnabled();

                return $payload;
            })
            ->values()
            ->all();

        return response()->json(['data' => $users]);
    }

    /**
     * Creates an approved user account and issues a one-time invitation link.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function createUser(Request $request): JsonResponse
    {
        $email = Str::lower(trim((string) $request->input('email', '')));
        if ($email !== '') {
            $request->merge(['email' => $email]);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'role' => ['required', 'in:admin,regular'],
        ]);

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Str::random(48),
            'role' => Role::from($data['role']),
            'email_verified_at' => null,
            'is_approved' => true,
            'approved_at' => now(),
            'approved_by' => $request->user()?->id,
        ]);

        $invitation = $this->onboarding->issueInvite($user);
        $invitationSent = $this->onboarding->sendInviteEmail(
            user: $user,
            inviteUrl: $invitation['url'],
            expiresAt: $invitation['expires_at'],
        );

        $payload = $user->toArray();
        $payload['invitation_sent'] = $invitationSent;
        $payload['invitation_expires_at'] = $invitation['expires_at']->toISOString();

        if (! $invitationSent && $this->onboarding->shouldExposeLinksWithoutMailer()) {
            $payload['invitation_url'] = $invitation['url'];
        }

        return response()->json($payload, 201);
    }

    /**
     * Deletes a user account and related data.
     *
     * @param  Request  $request
     * @param  User  $user
     * @return JsonResponse
     */
    public function destroyUser(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();

        $data = $request->validate([
            'confirmation_email' => ['required', 'string', 'email', 'max:255'],
            'transfer_owner_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $actorEmail = Str::lower(trim((string) ($actor?->email ?? '')));
        $confirmationEmail = Str::lower(trim((string) $data['confirmation_email']));
        if ($confirmationEmail !== $actorEmail) {
            abort(422, 'Type your account email to confirm this deletion.');
        }

        if ($actor && (int) $actor->id === (int) $user->id) {
            abort(422, 'You cannot delete your own account.');
        }

        if ($user->isAdmin()) {
            $remainingAdminCount = User::query()
                ->where('role', Role::Admin->value)
                ->whereKeyNot($user->id)
                ->count();

            if ($remainingAdminCount === 0) {
                abort(422, 'You cannot delete the last admin account.');
            }
        }

        $transferOwnerId = array_key_exists('transfer_owner_id', $data) && $data['transfer_owner_id'] !== null
            ? (int) $data['transfer_owner_id']
            : null;

        if ($transferOwnerId !== null && $transferOwnerId === (int) $user->id) {
            abort(422, 'Select a different account for ownership transfer.');
        }

        $result = $this->userDeletionService->deleteUser(
            user: $user,
            transferOwnerId: $transferOwnerId,
        );

        return response()->json([
            'ok' => true,
            'deleted_user_id' => (int) $result['deleted_user_id'],
            'transferred_to_user_id' => $result['transferred_to_user_id'],
            'transferred' => $result['transferred'],
        ]);
    }

    /**
     * Approves a pending user account.
     *
     * @param  Request  $request
     * @param  User  $user
     * @return JsonResponse
     */
    public function approveUser(Request $request, User $user): JsonResponse
    {
        if (! $user->is_approved) {
            $user->update([
                'is_approved' => true,
                'approved_at' => now(),
                'approved_by' => $request->user()?->id,
            ]);
        }

        return response()->json($user->fresh());
    }

    /**
     * Approves all pending user accounts.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function approvePendingUsers(Request $request): JsonResponse
    {
        $actorId = $request->user()?->id;
        $approvedCount = 0;

        User::query()
            ->where('is_approved', false)
            ->orderBy('id')
            ->get()
            ->each(function (User $pendingUser) use (&$approvedCount, $actorId): void {
                $pendingUser->update([
                    'is_approved' => true,
                    'approved_at' => now(),
                    'approved_by' => $actorId,
                ]);

                $approvedCount++;
            });

        return response()->json([
            'approved_count' => $approvedCount,
        ]);
    }

    /**
     * Returns resources the selected user can share.
     *
     * @return JsonResponse
     */
    public function sharableResources(): JsonResponse
    {
        $calendars = Calendar::query()
            ->with('owner:id,name,email')
            ->where('is_sharable', true)
            ->orderBy('display_name')
            ->get();

        $addressBooks = AddressBook::query()
            ->with('owner:id,name,email')
            ->where('is_sharable', true)
            ->orderBy('display_name')
            ->get();

        $milestonePurgeVisible = AppSetting::milestonePurgeControlVisible();
        $milestonePurgeAvailable = false;

        if (Schema::hasTable('address_book_contact_milestone_calendars')) {
            if (! $milestonePurgeVisible) {
                $milestonePurgeVisible = AddressBookContactMilestoneCalendar::query()
                    ->exists();

                if ($milestonePurgeVisible) {
                    AppSetting::query()->updateOrCreate(
                        ['key' => 'milestone_purge_control_visible'],
                        ['value' => 'true'],
                    );
                }
            }

            $milestonePurgeAvailable = AddressBookContactMilestoneCalendar::query()
                ->where(function ($query): void {
                    $query->where('enabled', true)
                        ->orWhereNotNull('calendar_id');
                })
                ->exists();
        }

        return response()->json([
            'calendars' => $calendars,
            'address_books' => $addressBooks,
            'milestone_purge_visible' => $milestonePurgeVisible,
            'milestone_purge_available' => $milestonePurgeAvailable,
        ]);
    }

    /**
     * Enables or disables public registration.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setRegistrationSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $this->registrationSettings->setPublicRegistrationEnabled(
            enabled: (bool) $data['enabled'],
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isPublicRegistrationEnabled(),
            'require_approval' => $this->registrationSettings->isPublicRegistrationApprovalRequired(),
        ]);
    }

    /**
     * Enables or disables registration approval requirements.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setRegistrationApprovalSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $this->registrationSettings->setPublicRegistrationApprovalRequired(
            enabled: (bool) $data['enabled'],
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isPublicRegistrationApprovalRequired(),
        ]);
    }

    /**
     * Enables or disables owner-managed sharing.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setOwnerShareManagementSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $this->registrationSettings->setOwnerShareManagementEnabled(
            enabled: (bool) $data['enabled'],
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isOwnerShareManagementEnabled(),
        ]);
    }

    /**
     * Enables or disables DAV compatibility mode.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setDavCompatibilityModeSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $this->registrationSettings->setDavCompatibilityModeEnabled(
            enabled: (bool) $data['enabled'],
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isDavCompatibilityModeEnabled(),
        ]);
    }

    /**
     * Enables or disables contact management features.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setContactManagementSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        if (
            (bool) $data['enabled']
            && (
                ! Schema::hasTable('contacts')
                || ! Schema::hasTable('contact_address_book_assignments')
            )
        ) {
            abort(422, 'Contact management schema is not available. Run migrations before enabling.');
        }

        $this->registrationSettings->setContactManagementEnabled(
            enabled: (bool) $data['enabled'],
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isContactManagementEnabled(),
        ]);
    }

    /**
     * Enables or disables contact change moderation.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setContactChangeModerationSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $enabled = (bool) $data['enabled'];

        if (
            $enabled
            && ! Schema::hasTable('contact_change_requests')
        ) {
            abort(422, 'Contact change moderation schema is not available. Run migrations before enabling.');
        }

        if (! $enabled && Schema::hasTable('contact_change_requests')) {
            $unresolvedCount = ContactChangeRequest::query()
                ->whereIn('status', [
                    ContactChangeStatus::Pending->value,
                    ContactChangeStatus::Approved->value,
                    ContactChangeStatus::ManualMergeNeeded->value,
                ])
                ->count();

            if ($unresolvedCount > 0) {
                abort(
                    422,
                    "Resolve or deny {$unresolvedCount} unresolved review queue request(s) before disabling moderation."
                );
            }
        }

        $this->registrationSettings->setContactChangeModerationEnabled(
            enabled: $enabled,
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isContactChangeModerationEnabled(),
        ]);
    }

    /**
     * Updates two-factor enforcement settings.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setTwoFactorEnforcementSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $this->twoFactorSettings->setEnforced(
            enabled: (bool) $data['enabled'],
            actor: $request->user(),
        );

        return response()->json([
            'enabled' => $this->twoFactorSettings->isEnforced(),
            'grace_period_days' => $this->twoFactorSettings->gracePeriodDays(),
        ]);
    }

    /**
     * Clears two-factor enrollment and backup codes for a user.
     *
     * @param  Request  $request
     * @param  User  $user
     * @return JsonResponse
     */
    public function resetUserTwoFactor(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'revoke_app_passwords' => ['sometimes', 'boolean'],
        ]);

        $revokeAppPasswords = (bool) ($data['revoke_app_passwords'] ?? true);

        $this->twoFactor->disable($user, revokeAppPasswords: $revokeAppPasswords);

        return response()->json([
            'ok' => true,
            'two_factor_enabled' => false,
            'app_passwords_revoked' => $revokeAppPasswords,
        ]);
    }

    /**
     * Returns contact-change request retention settings.
     *
     * @return JsonResponse
     */
    public function contactChangeRequestRetentionSetting(): JsonResponse
    {
        return response()->json([
            'days' => $this->registrationSettings->contactChangeRequestRetentionDays(),
        ]);
    }

    /**
     * Updates contact-change request retention settings.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setContactChangeRequestRetentionSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'days' => ['required', 'integer', 'min:1', 'max:3650'],
        ]);

        $this->registrationSettings->setContactChangeRequestRetentionDays(
            days: (int) $data['days'],
            actor: $request->user(),
        );

        return response()->json([
            'days' => $this->registrationSettings->contactChangeRequestRetentionDays(),
        ]);
    }

    /**
     * Returns milestone calendar generation-year settings.
     *
     * @return JsonResponse
     */
    public function milestoneGenerationYearsSetting(): JsonResponse
    {
        return response()->json([
            'years' => $this->registrationSettings->milestoneCalendarGenerationYears(),
        ]);
    }

    /**
     * Updates milestone calendar generation-year settings.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setMilestoneGenerationYearsSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'years' => ['required', 'integer', 'min:1', 'max:25'],
        ]);

        $this->registrationSettings->setMilestoneCalendarGenerationYears(
            years: (int) $data['years'],
            actor: $request->user(),
        );

        if (Schema::hasTable('address_book_contact_milestone_calendars')) {
            $addressBookIds = AddressBookContactMilestoneCalendar::query()
                ->where('enabled', true)
                ->pluck('address_book_id')
                ->map(fn (mixed $id): int => (int) $id)
                ->filter(fn (int $id): bool => $id > 0)
                ->unique()
                ->values()
                ->all();

            $this->milestoneCalendarService->syncAddressBooksByIds($addressBookIds);
        }

        return response()->json([
            'years' => $this->registrationSettings->milestoneCalendarGenerationYears(),
        ]);
    }

    /**
     * Purges generated milestone calendars for selected address books.
     *
     * @return JsonResponse
     */
    public function purgeGeneratedMilestoneCalendars(): JsonResponse
    {
        $summary = $this->milestoneCalendarService->purgeGeneratedCalendarsAndDisableSettings();

        return response()->json($summary);
    }

    /**
     * Returns backup configuration and last-run status.
     *
     * @return JsonResponse
     */
    public function backupSettings(): JsonResponse
    {
        return response()->json($this->backupSettings->current());
    }

    /**
     * Updates backup configuration settings.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function setBackupSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'local_enabled' => ['required', 'boolean'],
            'local_path' => ['required', 'string', 'max:1024'],
            's3_enabled' => ['required', 'boolean'],
            's3_disk' => ['required', 'string', 'max:255'],
            's3_prefix' => ['nullable', 'string', 'max:1024'],
            'schedule_times' => ['required', 'array', 'min:1'],
            'schedule_times.*' => ['required', 'string', 'regex:/^(?:[01]\d|2[0-3]):[0-5]\d$/'],
            'timezone' => ['required', 'timezone'],
            'weekly_day' => ['required', 'integer', 'min:0', 'max:6'],
            'monthly_day' => ['required', 'integer', 'min:1', 'max:31'],
            'yearly_month' => ['required', 'integer', 'min:1', 'max:12'],
            'yearly_day' => ['required', 'integer', 'min:1', 'max:31'],
            'retention_daily' => ['required', 'integer', 'min:0', 'max:3650'],
            'retention_weekly' => ['required', 'integer', 'min:0', 'max:520'],
            'retention_monthly' => ['required', 'integer', 'min:0', 'max:240'],
            'retention_yearly' => ['required', 'integer', 'min:0', 'max:50'],
        ]);

        if ((bool) $data['enabled'] && ! (bool) $data['local_enabled'] && ! (bool) $data['s3_enabled']) {
            abort(422, 'Enable at least one destination (local or S3) when backups are enabled.');
        }

        if (
            (int) $data['retention_daily'] === 0
            && (int) $data['retention_weekly'] === 0
            && (int) $data['retention_monthly'] === 0
            && (int) $data['retention_yearly'] === 0
        ) {
            abort(422, 'At least one retention tier must be greater than zero.');
        }

        return response()->json($this->backupSettings->update($data, $request->user()));
    }

    /**
     * Runs a backup immediately from the admin panel.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function runBackupNow(Request $request): JsonResponse
    {
        $result = $this->backupService->run(force: true, trigger: 'manual');
        $this->analytics->track('backups.run', [
            'status' => (string) ($result['status'] ?? 'unknown'),
            'trigger' => (string) ($result['trigger'] ?? 'manual'),
            'artifact_count' => (int) ($result['artifact_count'] ?? 0),
            'tier_count' => is_array($result['tiers'] ?? null) ? count($result['tiers']) : 0,
        ], $request->user());

        if ($result['status'] === 'failed') {
            return response()->json($result, 500);
        }

        if ($result['status'] === 'skipped') {
            return response()->json($result, 422);
        }

        return response()->json($result);
    }

    /**
     * Restores data from an uploaded backup archive.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function restoreBackup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'backup' => ['required', 'file', 'max:102400'],
            'mode' => ['nullable', 'in:merge,replace'],
            'dry_run' => ['nullable', 'boolean'],
            'fallback_owner_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $archive = $request->file('backup');
        if (! $archive || ! $archive->isValid()) {
            abort(422, 'Backup archive upload is missing or invalid.');
        }

        $archivePath = $archive->getRealPath();
        if (! is_string($archivePath) || $archivePath === '') {
            abort(422, 'Unable to access uploaded backup archive.');
        }

        $mode = (string) ($data['mode'] ?? 'merge');
        $dryRun = filter_var($request->input('dry_run', false), FILTER_VALIDATE_BOOLEAN);
        $fallbackOwnerId = array_key_exists('fallback_owner_id', $data)
            && $data['fallback_owner_id'] !== null
            ? (int) $data['fallback_owner_id']
            : (int) $request->user()->id;

        try {
            $result = $this->backupRestoreService->restoreFromArchive(
                archivePath: $archivePath,
                mode: $mode,
                dryRun: (bool) $dryRun,
                fallbackOwnerId: $fallbackOwnerId,
                trigger: 'manual-admin',
            );
        } catch (Throwable $throwable) {
            $this->analytics->track('backups.restore', [
                'status' => 'failed',
                'mode' => $mode,
                'dry_run' => (bool) $dryRun,
            ], $request->user());
            report($throwable);

            return response()->json([
                'status' => 'failed',
                'reason' => 'Backup restore failed: '.$throwable->getMessage(),
            ], 422);
        }

        $this->analytics->track('backups.restore', [
            'status' => (string) ($result['status'] ?? 'unknown'),
            'mode' => $mode,
            'dry_run' => (bool) $dryRun,
            'resource_count' => is_array($result['resources'] ?? null) ? count($result['resources']) : 0,
        ], $request->user());

        return response()->json($result);
    }
}
