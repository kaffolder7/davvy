<?php

namespace App\Services\Security;

use App\Models\User;
use App\Models\UserAppPassword;
use Illuminate\Support\Collection;

class AppPasswordService
{
    /**
     * Creates a new resource.
     *
     * @param  User  $user
     * @param  string  $name
     * @return array
     */
    public function create(User $user, string $name): array
    {
        $trimmedName = trim($name);
        $trimmedName = $trimmedName === '' ? 'DAV Client' : $trimmedName;

        $token = $this->generateToken();
        $prefix = substr($token, 0, 12);

        $record = $user->appPasswords()->create([
            'name' => $trimmedName,
            'token_hash' => $this->hashToken($token),
            'token_prefix' => $prefix,
        ]);

        return [
            'record' => $record,
            'token' => $token,
        ];
    }

    /**
     * Returns active records.
     *
     * @return Collection<int, UserAppPassword>
     */
    public function activeFor(User $user): Collection
    {
        return $user->appPasswords()
            ->whereNull('revoked_at')
            ->orderByDesc('id')
            ->get();
    }

    /**
     * Revokes access.
     *
     * @param  User  $user
     * @param  int  $appPasswordId
     * @return bool
     */
    public function revoke(User $user, int $appPasswordId): bool
    {
        $password = $user->appPasswords()
            ->where('id', $appPasswordId)
            ->whereNull('revoked_at')
            ->first();

        if (! $password) {
            return false;
        }

        $password->forceFill([
            'revoked_at' => now(),
        ])->save();

        return true;
    }

    /**
     * Revokes all.
     *
     * @param  User  $user
     * @return int
     */
    public function revokeAll(User $user): int
    {
        return $user->appPasswords()
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    /**
     * Verifies the credential and updates its usage timestamp.
     *
     * @param  User  $user
     * @param  string  $token
     * @return bool
     */
    public function verifyAndTouch(User $user, string $token): bool
    {
        $candidate = trim($token);
        if ($candidate === '') {
            return false;
        }

        $prefix = substr($candidate, 0, 12);
        $hash = $this->hashToken($candidate);

        $match = $user->appPasswords()
            ->whereNull('revoked_at')
            ->where('token_prefix', $prefix)
            ->first();

        if (! $match || ! hash_equals($match->token_hash, $hash)) {
            return false;
        }

        $match->forceFill([
            'last_used_at' => now(),
        ])->save();

        return true;
    }

    /**
     * Generates token.
     *
     * @return string
     */
    private function generateToken(): string
    {
        return 'dvap_'.bin2hex(random_bytes(20));
    }

    /**
     * Returns hash token.
     *
     * @param  string  $token
     * @return string
     */
    private function hashToken(string $token): string
    {
        return hash_hmac('sha256', $token, (string) config('app.key', 'davvy-app-passwords'));
    }
}
