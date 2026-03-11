<?php

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use App\Services\SponsorshipLinksService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function __construct(
        private readonly RegistrationSettingsService $registrationSettings,
        private readonly SponsorshipLinksService $sponsorshipLinks
    ) {}

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
            array_merge(['user' => $user], $this->publicSettingsPayload()),
            201
        );
    }

    public function publicConfig(): JsonResponse
    {
        return response()->json($this->publicSettingsPayload());
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);
        $credentials['email'] = Str::lower(trim((string) $credentials['email']));

        if (! Auth::attempt($credentials, (bool) $request->boolean('remember'))) {
            return response()->json([
                'message' => 'The provided credentials are invalid.',
            ], 422);
        }

        $user = $request->user();

        if (! $user || ! $user->is_approved) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'message' => 'Your account is pending administrator approval.',
            ], 403);
        }

        $request->session()->regenerate();

        return response()->json(
            array_merge(['user' => $user], $this->publicSettingsPayload())
        );
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(
            array_merge(['user' => $request->user()], $this->publicSettingsPayload())
        );
    }

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

    private function publicSettingsPayload(): array
    {
        return [
            'registration_enabled' => $this->registrationSettings->isPublicRegistrationEnabled(),
            'registration_approval_required' => $this->registrationSettings->isPublicRegistrationApprovalRequired(),
            'owner_share_management_enabled' => $this->registrationSettings->isOwnerShareManagementEnabled(),
            'dav_compatibility_mode_enabled' => $this->registrationSettings->isDavCompatibilityModeEnabled(),
            'contact_management_enabled' => $this->registrationSettings->isContactManagementEnabled(),
            'contact_change_moderation_enabled' => $this->registrationSettings->isContactChangeModerationEnabled(),
            'sponsorship' => $this->sponsorshipLinks->publicConfig(),
        ];
    }
}
