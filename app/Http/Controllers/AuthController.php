<?php

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function __construct(private readonly RegistrationSettingsService $registrationSettings) {}

    public function register(Request $request): JsonResponse
    {
        if (! $this->registrationSettings->isPublicRegistrationEnabled()) {
            abort(403, 'Public registration is currently disabled.');
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role' => Role::Regular,
        ]);

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json([
            'user' => $user,
            'registration_enabled' => $this->registrationSettings->isPublicRegistrationEnabled(),
            'owner_share_management_enabled' => $this->registrationSettings->isOwnerShareManagementEnabled(),
            'dav_compatibility_mode_enabled' => $this->registrationSettings->isDavCompatibilityModeEnabled(),
            'contact_management_enabled' => $this->registrationSettings->isContactManagementEnabled(),
        ], 201);
    }

    public function publicConfig(): JsonResponse
    {
        return response()->json([
            'registration_enabled' => $this->registrationSettings->isPublicRegistrationEnabled(),
            'owner_share_management_enabled' => $this->registrationSettings->isOwnerShareManagementEnabled(),
            'dav_compatibility_mode_enabled' => $this->registrationSettings->isDavCompatibilityModeEnabled(),
            'contact_management_enabled' => $this->registrationSettings->isContactManagementEnabled(),
        ]);
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials, (bool) $request->boolean('remember'))) {
            return response()->json([
                'message' => 'The provided credentials are invalid.',
            ], 422);
        }

        $request->session()->regenerate();

        return response()->json([
            'user' => $request->user(),
            'registration_enabled' => $this->registrationSettings->isPublicRegistrationEnabled(),
            'owner_share_management_enabled' => $this->registrationSettings->isOwnerShareManagementEnabled(),
            'dav_compatibility_mode_enabled' => $this->registrationSettings->isDavCompatibilityModeEnabled(),
            'contact_management_enabled' => $this->registrationSettings->isContactManagementEnabled(),
        ]);
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
        return response()->json([
            'user' => $request->user(),
            'registration_enabled' => $this->registrationSettings->isPublicRegistrationEnabled(),
            'owner_share_management_enabled' => $this->registrationSettings->isOwnerShareManagementEnabled(),
            'dav_compatibility_mode_enabled' => $this->registrationSettings->isDavCompatibilityModeEnabled(),
            'contact_management_enabled' => $this->registrationSettings->isContactManagementEnabled(),
        ]);
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
}
