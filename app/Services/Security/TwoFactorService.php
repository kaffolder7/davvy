<?php

namespace App\Services\Security;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

class TwoFactorService
{
    private const BACKUP_CODE_COUNT = 8;

    public function __construct(
        private readonly TotpService $totp,
        private readonly AppPasswordService $appPasswords,
    ) {}

    /**
     * Starts two-factor setup and returns enrollment details.
     *
     * @param  User  $user
     * @return array
     */
    public function beginSetup(User $user): array
    {
        $secret = $this->totp->generateSecret();

        return [
            'secret' => $secret,
            'manual_key' => $this->totp->formatSecretForHumans($secret),
            'otpauth_uri' => $this->totp->provisioningUri($user->email, $secret),
        ];
    }

    /**
     * Verifies an enrollment code during two-factor setup.
     *
     * @param  string  $secret
     * @param  string  $code
     * @return bool
     */
    public function verifyEnrollmentCode(string $secret, string $code): bool
    {
        return $this->totp->verify($secret, $code);
    }

    /**
     * Enables two-factor auth and stores backup codes.
     *
     * @return array<int, string>
     */
    public function enable(User $user, string $secret): array
    {
        $backupCodes = $this->generateBackupCodes();

        $user->forceFill([
            'two_factor_secret' => strtoupper(trim($secret)),
            'two_factor_backup_codes' => $this->hashBackupCodes($backupCodes),
            'two_factor_enabled_at' => now(),
        ])->save();

        return $backupCodes;
    }

    /**
     * Regenerates backup codes for an enrolled user.
     *
     * @return array<int, string>
     */
    public function regenerateBackupCodes(User $user): array
    {
        $backupCodes = $this->generateBackupCodes();

        $user->forceFill([
            'two_factor_backup_codes' => $this->hashBackupCodes($backupCodes),
        ])->save();

        return $backupCodes;
    }

    /**
     * Disables two-factor auth and clears related fields.
     *
     * @param  User  $user
     * @param  bool  $revokeAppPasswords
     * @return void
     */
    public function disable(User $user, bool $revokeAppPasswords = true): void
    {
        $user->forceFill([
            'two_factor_secret' => null,
            'two_factor_backup_codes' => null,
            'two_factor_enabled_at' => null,
        ])->save();

        if ($revokeAppPasswords) {
            $this->appPasswords->revokeAll($user);
        }
    }

    /**
     * Verifies a TOTP code or consumes a backup code.
     *
     * @param  User  $user
     * @param  string  $input
     * @return bool
     */
    public function verifyTotpOrBackupCode(User $user, string $input): bool
    {
        if (! $user->hasTwoFactorEnabled()) {
            return false;
        }

        $totpCode = $this->totp->normalizeTotpCode($input);
        if ($totpCode !== null && $this->totp->verify((string) $user->two_factor_secret, $totpCode)) {
            return true;
        }

        return $this->consumeBackupCode($user, $input);
    }

    /**
     * Verifies a TOTP code against the stored secret.
     *
     * @param  User  $user
     * @param  string  $input
     * @return bool
     */
    public function verifyTotpCode(User $user, string $input): bool
    {
        if (! $user->hasTwoFactorEnabled()) {
            return false;
        }

        $code = $this->totp->normalizeTotpCode($input);
        if ($code === null) {
            return false;
        }

        return $this->totp->verify((string) $user->two_factor_secret, $code);
    }

    /**
     * Generates the current TOTP code for the stored secret.
     *
     * @param  string  $secret
     * @return string
     */
    public function currentCode(string $secret): string
    {
        return $this->totp->currentCode($secret);
    }

    /**
     * Checks whether consume backup code.
     *
     * @param  User  $user
     * @param  string  $input
     * @return bool
     */
    private function consumeBackupCode(User $user, string $input): bool
    {
        $normalized = $this->normalizeBackupCode($input);
        if ($normalized === null) {
            return false;
        }

        $hashes = $this->backupCodeHashesFor($user);

        foreach ($hashes as $index => $hash) {
            if (! is_string($hash)) {
                continue;
            }

            if (! Hash::check($normalized, $hash)) {
                continue;
            }

            unset($hashes[$index]);

            $user->forceFill([
                'two_factor_backup_codes' => array_values($hashes),
            ])->save();

            return true;
        }

        return false;
    }

    /**
     * Generates backup codes.
     *
     * @return array<int, string>
     */
    private function generateBackupCodes(): array
    {
        $codes = [];

        for ($i = 0; $i < self::BACKUP_CODE_COUNT; $i++) {
            $codes[] = $this->generateBackupCode();
        }

        return $codes;
    }

    /**
     * Generates backup code.
     *
     * @return string
     */
    private function generateBackupCode(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $segments = [];

        for ($segment = 0; $segment < 2; $segment++) {
            $chunk = '';
            for ($i = 0; $i < 4; $i++) {
                $chunk .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $segments[] = $chunk;
        }

        return implode('-', $segments);
    }

    /**
     * Returns hash backup codes.
     *
     * @param  array<int, string>  $codes
     * @return array<int, string>
     */
    private function hashBackupCodes(array $codes): array
    {
        return array_map(
            fn (string $code): string => Hash::make((string) $this->normalizeBackupCode($code)),
            $codes,
        );
    }

    /**
     * Returns backup code hashes.
     *
     * @return array<int, string>
     */
    private function backupCodeHashesFor(User $user): array
    {
        return is_array($user->two_factor_backup_codes) ? $user->two_factor_backup_codes : [];
    }

    /**
     * Normalizes backup code.
     *
     * @param  string  $code
     * @return string|null
     */
    private function normalizeBackupCode(string $code): ?string
    {
        $normalized = strtoupper(trim($code));
        $normalized = preg_replace('/[^A-Z0-9]/', '', $normalized);

        if (! is_string($normalized) || strlen($normalized) !== 8) {
            return null;
        }

        return $normalized;
    }
}
