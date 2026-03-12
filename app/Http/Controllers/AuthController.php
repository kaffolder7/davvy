<?php

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Models\User;
use App\Models\UserAppPassword;
use App\Services\RegistrationSettingsService;
use App\Services\Security\AppPasswordService;
use App\Services\Security\PendingTwoFactorLoginService;
use App\Services\Security\TwoFactorService;
use App\Services\Security\TwoFactorSettingsService;
use App\Services\SponsorshipLinksService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    private const TWO_FACTOR_PENDING_SETUP_SESSION_KEY = 'auth.pending_two_factor_secret';

    public function __construct(
        private readonly RegistrationSettingsService $registrationSettings,
        private readonly SponsorshipLinksService $sponsorshipLinks,
        private readonly TwoFactorService $twoFactor,
        private readonly TwoFactorSettingsService $twoFactorSettings,
        private readonly PendingTwoFactorLoginService $pendingTwoFactorLogin,
        private readonly AppPasswordService $appPasswords,
    ) {}

    /**
     * Registers a new user account.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function register(Request $request): JsonResponse
    {
        if (! $this->registrationSettings->isPublicRegistrationEnabled()) {
            abort(403, 'Public registration is currently disabled.');
        }

        $email = Str::lower(trim((string) $request->input('email', '')));
        if ($email !== '') {
            $request->merge(['email' => $email]);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        $approvalRequired = $this->registrationSettings->isPublicRegistrationApprovalRequired();

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role' => Role::Regular,
            'is_approved' => ! $approvalRequired,
            'approved_at' => $approvalRequired ? null : now(),
            'approved_by' => null,
        ]);

        if ($approvalRequired) {
            return response()->json(
                array_merge([
                    'registration_pending_approval' => true,
                    'message' => 'Registration submitted. An administrator must approve your account before you can sign in.',
                ], $this->publicSettingsPayload()),
                202
            );
        }

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json(
            array_merge(['user' => $user], $this->authenticatedSettingsPayload($user)),
            201,
        );
    }

    /**
     * Returns public configuration.
     *
     * @return JsonResponse
     */
    public function publicConfig(): JsonResponse
    {
        return response()->json($this->publicSettingsPayload());
    }

    /**
     * Authenticates the user.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $email = Str::lower(trim((string) $data['email']));

        $user = User::query()->where('email', $email)->first();

        if (! $user || ! Hash::check((string) $data['password'], $user->password)) {
            return response()->json([
                'message' => 'The provided credentials are invalid.',
            ], 422);
        }

        if (! $user->is_approved) {
            return response()->json([
                'message' => 'Your account is pending administrator approval.',
            ], 403);
        }

        if ($user->hasTwoFactorEnabled()) {
            $this->pendingTwoFactorLogin->start(
                request: $request,
                user: $user,
                remember: (bool) ($data['remember'] ?? false),
            );

            return response()->json([
                'two_factor_required' => true,
                'message' => 'Two-factor code required to complete sign in.',
                'challenge_expires_at' => now()->addMinutes(10)->toISOString(),
            ], 202);
        }

        Auth::login($user, (bool) ($data['remember'] ?? false));
        $request->session()->regenerate();

        return response()->json(
            array_merge(['user' => $request->user()], $this->authenticatedSettingsPayload($request->user())),
        );
    }

    /**
     * Returns the pending two-factor challenge status.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function loginTwoFactorStatus(Request $request): JsonResponse
    {
        return response()->json($this->pendingTwoFactorLogin->status($request));
    }

    /**
     * Completes two factor login.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function completeTwoFactorLogin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
        ]);

        $user = $this->pendingTwoFactorLogin->pendingUser($request);
        if (! $user) {
            return response()->json([
                'message' => 'No pending two-factor challenge. Start a new sign in attempt.',
            ], 422);
        }

        $verified = $this->twoFactor->verifyTotpOrBackupCode($user, $data['code']);
        if (! $verified) {
            $this->pendingTwoFactorLogin->registerFailedAttempt($request);

            return response()->json([
                'message' => 'Invalid authentication code.',
            ], 422);
        }

        $remember = $this->pendingTwoFactorLogin->remember($request);
        $this->pendingTwoFactorLogin->clear($request);

        Auth::login($user, $remember);
        $request->session()->regenerate();

        return response()->json(
            array_merge(['user' => $request->user()], $this->authenticatedSettingsPayload($request->user())),
        );
    }

    /**
     * Signs out the current user.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function logout(Request $request): JsonResponse
    {
        $this->pendingTwoFactorLogin->clear($request);
        $request->session()->forget(self::TWO_FACTOR_PENDING_SETUP_SESSION_KEY);

        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    /**
     * Returns the authenticated user.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json(
            array_merge(['user' => $request->user()], $this->authenticatedSettingsPayload($request->user())),
        );
    }

    /**
     * Changes the user's password.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'confirmed', 'different:current_password', Password::min(8)],
        ]);

        $request->user()->update([
            'password' => $data['password'],
        ]);

        return response()->json([
            'ok' => true,
        ]);
    }

    /**
     * Returns the current two-factor authentication status.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function twoFactorStatus(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();
        $graceDeadline = $this->twoFactorSettings->graceDeadlineFor($user);

        return response()->json([
            'enabled' => $user->hasTwoFactorEnabled(),
            'mandated' => $this->twoFactorSettings->isEnforced(),
            'setup_required' => $this->twoFactorSettings->isSetupRequired($user),
            'grace_expires_at' => $graceDeadline?->toISOString(),
            'backup_codes_remaining' => is_array($user->two_factor_backup_codes)
                ? count($user->two_factor_backup_codes)
                : 0,
        ]);
    }

    /**
     * Starts two factor setup.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function startTwoFactorSetup(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->hasTwoFactorEnabled()) {
            abort(409, 'Two-factor authentication is already enabled.');
        }

        $setup = $this->twoFactor->beginSetup($user);
        $request->session()->put(self::TWO_FACTOR_PENDING_SETUP_SESSION_KEY, $setup['secret']);

        return response()->json([
            'secret' => $setup['secret'],
            'manual_key' => $setup['manual_key'],
            'otpauth_uri' => $setup['otpauth_uri'],
        ]);
    }

    /**
     * Enables two-factor authentication.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function enableTwoFactor(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
        ]);

        $user = $request->user();

        if ($user->hasTwoFactorEnabled()) {
            abort(409, 'Two-factor authentication is already enabled.');
        }

        $secret = (string) $request->session()->get(self::TWO_FACTOR_PENDING_SETUP_SESSION_KEY, '');
        if ($secret === '') {
            abort(422, 'Two-factor setup has expired. Start setup again.');
        }

        if (! $this->twoFactor->verifyEnrollmentCode($secret, $data['code'])) {
            abort(422, 'The two-factor code is invalid.');
        }

        $backupCodes = $this->twoFactor->enable($user, $secret);
        $request->session()->forget(self::TWO_FACTOR_PENDING_SETUP_SESSION_KEY);

        $fresh = $user->fresh();

        return response()->json([
            'enabled' => true,
            'backup_codes' => $backupCodes,
            'two_factor_setup_required' => $this->twoFactorSettings->isSetupRequired($fresh),
        ]);
    }

    /**
     * Disables two-factor authentication.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function disableTwoFactor(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
        ]);

        $user = $request->user()->fresh();

        if (! $user->hasTwoFactorEnabled()) {
            abort(422, 'Two-factor authentication is not enabled.');
        }

        if (! $this->twoFactor->verifyTotpOrBackupCode($user, $data['code'])) {
            abort(422, 'Invalid authentication code.');
        }

        $this->twoFactor->disable($user, revokeAppPasswords: true);

        return response()->json([
            'enabled' => false,
            'app_passwords_revoked' => true,
        ]);
    }

    /**
     * Regenerates backup codes.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function regenerateBackupCodes(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
        ]);

        $user = $request->user()->fresh();

        if (! $user->hasTwoFactorEnabled()) {
            abort(422, 'Two-factor authentication is not enabled.');
        }

        if (! $this->twoFactor->verifyTotpOrBackupCode($user, $data['code'])) {
            abort(422, 'Invalid authentication code.');
        }

        $backupCodes = $this->twoFactor->regenerateBackupCodes($user);

        return response()->json([
            'backup_codes' => $backupCodes,
        ]);
    }

    /**
     * Returns app passwords.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function listAppPasswords(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();

        if (! $user->hasTwoFactorEnabled()) {
            abort(422, 'Enable two-factor authentication before managing app passwords.');
        }

        $data = $this->appPasswords->activeFor($user)
            ->map(fn (UserAppPassword $password): array => [
                'id' => $password->id,
                'name' => $password->name,
                'token_prefix' => $password->token_prefix,
                'last_used_at' => $password->last_used_at?->toISOString(),
                'created_at' => $password->created_at?->toISOString(),
            ])
            ->values()
            ->all();

        return response()->json([
            'data' => $data,
        ]);
    }

    /**
     * Creates app password.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function createAppPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['required', 'string', 'max:64'],
        ]);

        $user = $request->user()->fresh();

        if (! $user->hasTwoFactorEnabled()) {
            abort(422, 'Enable two-factor authentication before creating app passwords.');
        }

        if (! $this->twoFactor->verifyTotpOrBackupCode($user, $data['code'])) {
            abort(422, 'Invalid authentication code.');
        }

        $created = $this->appPasswords->create($user, $data['name']);
        /** @var UserAppPassword $record */
        $record = $created['record'];

        return response()->json([
            'id' => $record->id,
            'name' => $record->name,
            'token' => $created['token'],
            'token_prefix' => $record->token_prefix,
            'last_used_at' => $record->last_used_at?->toISOString(),
            'created_at' => $record->created_at?->toISOString(),
        ], 201);
    }

    /**
     * Revokes app password.
     *
     * @param  Request  $request
     * @param  UserAppPassword  $appPassword
     * @return JsonResponse
     */
    public function revokeAppPassword(Request $request, UserAppPassword $appPassword): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
        ]);

        $user = $request->user()->fresh();

        if (! $user->hasTwoFactorEnabled()) {
            abort(422, 'Enable two-factor authentication before managing app passwords.');
        }

        if ((int) $appPassword->user_id !== (int) $user->id) {
            abort(404);
        }

        if (! $this->twoFactor->verifyTotpOrBackupCode($user, $data['code'])) {
            abort(422, 'Invalid authentication code.');
        }

        $revoked = $this->appPasswords->revoke($user, (int) $appPassword->id);

        if (! $revoked) {
            abort(404);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Returns public settings payload.
     *
     * @return array
     */
    private function publicSettingsPayload(): array
    {
        return [
            'registration_enabled' => $this->registrationSettings->isPublicRegistrationEnabled(),
            'registration_approval_required' => $this->registrationSettings->isPublicRegistrationApprovalRequired(),
            'owner_share_management_enabled' => $this->registrationSettings->isOwnerShareManagementEnabled(),
            'dav_compatibility_mode_enabled' => $this->registrationSettings->isDavCompatibilityModeEnabled(),
            'contact_management_enabled' => $this->registrationSettings->isContactManagementEnabled(),
            'contact_change_moderation_enabled' => $this->registrationSettings->isContactChangeModerationEnabled(),
            'two_factor_enforcement_enabled' => $this->twoFactorSettings->isEnforced(),
            'two_factor_grace_period_days' => $this->twoFactorSettings->gracePeriodDays(),
            'sponsorship' => $this->sponsorshipLinks->publicConfig(),
        ];
    }

    /**
     * Returns authenticated settings payload.
     *
     * @param  User  $user
     * @return array
     */
    private function authenticatedSettingsPayload(User $user): array
    {
        $graceDeadline = $this->twoFactorSettings->graceDeadlineFor($user);

        return array_merge($this->publicSettingsPayload(), [
            'two_factor_enabled' => $user->hasTwoFactorEnabled(),
            'two_factor_setup_required' => $this->twoFactorSettings->isSetupRequired($user),
            'two_factor_mandated' => $this->twoFactorSettings->isEnforced(),
            'two_factor_grace_expires_at' => $graceDeadline?->toISOString(),
        ]);
    }
}
