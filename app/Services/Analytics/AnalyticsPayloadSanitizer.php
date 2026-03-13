<?php

namespace App\Services\Analytics;

class AnalyticsPayloadSanitizer
{
    private const BLOCKED_KEY_TOKENS = [
        'email',
        'password',
        'passwd',
        'secret',
        'token',
        'phone',
        'address',
        'street',
        'postal',
        'zip',
        'query',
        'payload',
        'content',
        'body',
        'uri',
        'url',
        'path',
        'raw',
    ];

    /**
     * Sanitizes event properties to avoid PII and oversized values.
     *
     * @param  array<string, mixed>  $properties
     * @return array<string, bool|float|int|string>
     */
    public function sanitize(array $properties): array
    {
        $sanitized = [];

        foreach ($properties as $key => $value) {
            if (! is_string($key)) {
                continue;
            }

            $normalizedKey = $this->normalizeKey($key);
            if ($normalizedKey === null) {
                continue;
            }

            $normalizedValue = $this->normalizeValue($value);
            if ($normalizedValue === null) {
                continue;
            }

            $sanitized[$normalizedKey] = $normalizedValue;
        }

        return $sanitized;
    }

    /**
     * Normalizes and validates a property key.
     */
    private function normalizeKey(string $key): ?string
    {
        $normalized = strtolower(trim($key));
        if ($normalized === '' || strlen($normalized) > 64) {
            return null;
        }

        if (preg_match('/[^a-z0-9_.-]/', $normalized) === 1) {
            return null;
        }

        foreach (self::BLOCKED_KEY_TOKENS as $token) {
            if (str_contains($normalized, $token)) {
                return null;
            }
        }

        return $normalized;
    }

    /**
     * Normalizes and validates a property value.
     */
    private function normalizeValue(mixed $value): bool|float|int|string|null
    {
        if (is_bool($value) || is_int($value) || is_float($value)) {
            return $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $normalized = trim($value);
        if ($normalized === '' || $this->looksSensitive($normalized)) {
            return null;
        }

        return mb_substr($normalized, 0, 160);
    }

    /**
     * Checks whether a property value appears sensitive or identifying.
     */
    private function looksSensitive(string $value): bool
    {
        if (preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $value) === 1) {
            return true;
        }

        if (preg_match('/^https?:\/\//i', $value) === 1) {
            return true;
        }

        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1) {
            return true;
        }

        if (str_contains($value, '/') || str_contains($value, '\\')) {
            return true;
        }

        return false;
    }
}
