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
use App\Services\Backups\BackupService;
use App\Services\Backups\BackupSettingsService;
use App\Services\Contacts\ContactMilestoneCalendarService;
use App\Services\RegistrationSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AdminController extends Controller
{
    public function __construct(
        private readonly RegistrationSettingsService $registrationSettings,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
        private readonly BackupSettingsService $backupSettings,
        private readonly BackupService $backupService,
    ) {}

    public function users(): JsonResponse
    {
        $users = User::query()
            ->withCount(['calendars', 'addressBooks'])
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $users]);
    }

    public function createUser(Request $request): JsonResponse
    {
        $email = Str::lower(trim((string) $request->input('email', '')));
        if ($email !== '') {
            $request->merge(['email' => $email]);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', Password::min(8)],
            'role' => ['required', 'in:admin,regular'],
        ]);

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role' => Role::from($data['role']),
        ]);

        return response()->json($user, 201);
    }

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
        ]);
    }

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

    public function contactChangeRequestRetentionSetting(): JsonResponse
    {
        return response()->json([
            'days' => $this->registrationSettings->contactChangeRequestRetentionDays(),
        ]);
    }

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

    public function purgeGeneratedMilestoneCalendars(): JsonResponse
    {
        $summary = $this->milestoneCalendarService->purgeGeneratedCalendarsAndDisableSettings();

        return response()->json($summary);
    }

    public function backupSettings(): JsonResponse
    {
        return response()->json($this->backupSettings->current());
    }

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

    public function runBackupNow(): JsonResponse
    {
        $result = $this->backupService->run(force: true, trigger: 'manual');

        if ($result['status'] === 'failed') {
            return response()->json($result, 500);
        }

        if ($result['status'] === 'skipped') {
            return response()->json($result, 422);
        }

        return response()->json($result);
    }
}
