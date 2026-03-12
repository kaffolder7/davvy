<?php

namespace App\Services\Security;

use App\Models\User;
use Illuminate\Http\Request;

class PendingTwoFactorLoginService
{
    private const SESSION_KEY = 'auth.pending_two_factor_login';

    public function start(Request $request, User $user, bool $remember): void
    {
        $request->session()->put(self::SESSION_KEY, [
            'user_id' => $user->id,
            'remember' => $remember,
            'expires_at' => now()->addMinutes(10)->timestamp,
            'attempts' => 0,
        ]);
    }

    public function pendingUser(Request $request): ?User
    {
        $data = $this->sessionData($request);
        if ($data === null) {
            return null;
        }

        $userId = (int) ($data['user_id'] ?? 0);
        if ($userId < 1) {
            $this->clear($request);

            return null;
        }

        $user = User::query()->find($userId);
        if (! $user || ! $user->hasTwoFactorEnabled()) {
            $this->clear($request);

            return null;
        }

        return $user;
    }

    public function remember(Request $request): bool
    {
        $data = $this->sessionData($request);

        return (bool) ($data['remember'] ?? false);
    }

    public function status(Request $request): array
    {
        $data = $this->sessionData($request);
        if ($data === null) {
            return [
                'required' => false,
                'expires_at' => null,
            ];
        }

        return [
            'required' => true,
            'expires_at' => now()->setTimestamp((int) $data['expires_at'])->toISOString(),
        ];
    }

    public function registerFailedAttempt(Request $request): int
    {
        $data = $this->sessionData($request);
        if ($data === null) {
            return 0;
        }

        $attempts = ((int) ($data['attempts'] ?? 0)) + 1;
        $data['attempts'] = $attempts;
        $request->session()->put(self::SESSION_KEY, $data);

        if ($attempts >= 10) {
            $this->clear($request);
        }

        return $attempts;
    }

    public function clear(Request $request): void
    {
        $request->session()->forget(self::SESSION_KEY);
    }

    private function sessionData(Request $request): ?array
    {
        $data = $request->session()->get(self::SESSION_KEY);
        if (! is_array($data)) {
            return null;
        }

        $expiresAt = (int) ($data['expires_at'] ?? 0);
        if ($expiresAt < now()->timestamp) {
            $this->clear($request);

            return null;
        }

        return $data;
    }
}
