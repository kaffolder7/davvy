<?php

namespace App\Services\Security;

class TotpService
{
    private const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /**
     * @param  int  $bytes
     * @return string
     */
    public function generateSecret(int $bytes = 20): string
    {
        $bytes = max(10, min(64, $bytes));

        return $this->base32Encode(random_bytes($bytes));
    }

    /**
     * @param  string  $email
     * @param  string  $secret
     * @param  string|null  $issuer
     * @return string
     */
    public function provisioningUri(string $email, string $secret, ?string $issuer = null): string
    {
        $issuer = trim((string) ($issuer ?: config('app.name', 'Davvy')));
        if ($issuer === '') {
            $issuer = 'Davvy';
        }

        $label = rawurlencode($issuer.':'.$email);
        $query = http_build_query([
            'secret' => strtoupper(trim($secret)),
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => 6,
            'period' => 30,
        ], '', '&', PHP_QUERY_RFC3986);

        return "otpauth://totp/{$label}?{$query}";
    }

    /**
     * @param  string  $secret
     * @param  string  $code
     * @param  int  $window
     * @param  int|null  $timestamp
     * @return bool
     */
    public function verify(string $secret, string $code, int $window = 1, ?int $timestamp = null): bool
    {
        $normalizedCode = $this->normalizeTotpCode($code);
        if ($normalizedCode === null) {
            return false;
        }

        $time = max(0, $timestamp ?? time());
        $slice = intdiv($time, 30);
        $window = max(0, min(2, $window));

        for ($offset = -$window; $offset <= $window; $offset++) {
            $candidate = $this->codeForTimeslice($secret, $slice + $offset);
            if (hash_equals($candidate, $normalizedCode)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  string  $secret
     * @param  int|null  $timestamp
     * @return string
     */
    public function currentCode(string $secret, ?int $timestamp = null): string
    {
        $time = max(0, $timestamp ?? time());

        return $this->codeForTimeslice($secret, intdiv($time, 30));
    }

    /**
     * @param  string  $secret
     * @return string
     */
    public function formatSecretForHumans(string $secret): string
    {
        $trimmed = strtoupper(trim($secret));
        if ($trimmed === '') {
            return '';
        }

        return implode('-', str_split($trimmed, 4));
    }

    /**
     * @param  string  $code
     * @return string|null
     */
    public function normalizeTotpCode(string $code): ?string
    {
        $digits = preg_replace('/\D+/', '', $code);

        if (! is_string($digits) || strlen($digits) !== 6) {
            return null;
        }

        return $digits;
    }

    /**
     * @param  string  $secret
     * @param  int  $slice
     * @return string
     */
    private function codeForTimeslice(string $secret, int $slice): string
    {
        $slice = max(0, $slice);
        $key = $this->base32Decode($secret);

        if ($key === '') {
            return str_repeat('0', 6);
        }

        $binaryTime = pack('N*', 0).pack('N*', $slice);
        $hash = hash_hmac('sha1', $binaryTime, $key, true);
        $offset = ord($hash[19]) & 0x0F;

        $value = (
            ((ord($hash[$offset]) & 0x7F) << 24)
            | ((ord($hash[$offset + 1]) & 0xFF) << 16)
            | ((ord($hash[$offset + 2]) & 0xFF) << 8)
            | (ord($hash[$offset + 3]) & 0xFF)
        ) % 1_000_000;

        return str_pad((string) $value, 6, '0', STR_PAD_LEFT);
    }

    /**
     * @param  string  $bytes
     * @return string
     */
    private function base32Encode(string $bytes): string
    {
        if ($bytes === '') {
            return '';
        }

        $alphabet = self::BASE32_ALPHABET;
        $result = '';
        $buffer = 0;
        $bitsLeft = 0;

        $length = strlen($bytes);
        for ($i = 0; $i < $length; $i++) {
            $buffer = ($buffer << 8) | ord($bytes[$i]);
            $bitsLeft += 8;

            while ($bitsLeft >= 5) {
                $bitsLeft -= 5;
                $result .= $alphabet[($buffer >> $bitsLeft) & 0x1F];
            }
        }

        if ($bitsLeft > 0) {
            $result .= $alphabet[($buffer << (5 - $bitsLeft)) & 0x1F];
        }

        return $result;
    }

    /**
     * @param  string  $secret
     * @return string
     */
    private function base32Decode(string $secret): string
    {
        $normalized = strtoupper(trim($secret));
        $normalized = preg_replace('/[^A-Z2-7]/', '', $normalized);

        if (! is_string($normalized) || $normalized === '') {
            return '';
        }

        $alphabet = self::BASE32_ALPHABET;
        $lookup = array_flip(str_split($alphabet));

        $buffer = 0;
        $bitsLeft = 0;
        $result = '';

        $length = strlen($normalized);
        for ($i = 0; $i < $length; $i++) {
            $char = $normalized[$i];
            if (! array_key_exists($char, $lookup)) {
                continue;
            }

            $buffer = ($buffer << 5) | (int) $lookup[$char];
            $bitsLeft += 5;

            while ($bitsLeft >= 8) {
                $bitsLeft -= 8;
                $result .= chr(($buffer >> $bitsLeft) & 0xFF);
            }
        }

        return $result;
    }
}
