<?php

namespace App\Services\Analytics;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Throwable;

class OpenPanelAnalyticsService
{
    private const BLOCKED_PROPERTY_TOKENS = [
        'email',
        'name',
        'phone',
        'address',
        'password',
        'token',
        'secret',
    ];

    /**
     * Create a new OpenPanel analytics service instance.
     *
     * @return void
     */
    public function __construct(
        private readonly OpenPanelSettings $settings,
        private readonly AnalyticsProfileService $profiles,
    ) {}

    /**
     * Track an event to OpenPanel when enabled.
     *
     * @param  array<string, bool|int|float|string|null>  $properties
     */
    public function track(string $name, array $properties = [], ?User $user = null): void
    {
        if (! $this->settings->serverTrackingEnabled()) {
            return;
        }

        $eventName = trim($name);
        if ($eventName === '') {
            return;
        }

        $payload = [
            'type' => 'track',
            'payload' => [
                'name' => $eventName,
                'properties' => $this->sanitizeProperties($properties),
            ],
        ];

        if ($user) {
            $payload['payload']['profileId'] = $this->profiles->profileIdForUser($user);
        }

        try {
            Http::asJson()
                ->timeout(2)
                ->withHeaders([
                    'openpanel-client-id' => $this->settings->clientId(),
                    'openpanel-client-secret' => $this->settings->clientSecret(),
                ])
                ->post($this->settings->apiUrl().'/track', $payload);
        } catch (Throwable $throwable) {
            report($throwable);
        }
    }

    /**
     * Return the browser bootstrap payload.
     *
     * @return array{enabled:bool,client_id?:string,api_url?:string,script_url?:string,profile_id?:string}
     */
    public function browserConfig(?User $user = null): array
    {
        if (! $this->settings->clientTrackingEnabled()) {
            return ['enabled' => false];
        }

        $payload = [
            'enabled' => true,
            'client_id' => $this->settings->clientId(),
            'api_url' => $this->settings->apiUrl(),
            'script_url' => $this->settings->scriptUrl(),
        ];

        if ($user) {
            $payload['profile_id'] = $this->profiles->profileIdForUser($user);
        }

        return $payload;
    }

    /**
     * Sanitize custom event properties before transport.
     *
     * @param  array<string, bool|int|float|string|null>  $properties
     * @return array<string, bool|int|float|string>
     */
    private function sanitizeProperties(array $properties): array
    {
        $sanitized = [];

        foreach ($properties as $key => $value) {
            if (! is_string($key)) {
                continue;
            }

            $normalizedKey = trim($key);
            if ($normalizedKey === '') {
                continue;
            }

            if ($this->hasBlockedToken($normalizedKey)) {
                continue;
            }

            if (is_bool($value) || is_int($value) || is_float($value)) {
                $sanitized[$normalizedKey] = $value;

                continue;
            }

            if (is_string($value)) {
                $normalizedValue = trim($value);
                if ($normalizedValue === '' || $this->looksLikeEmail($normalizedValue)) {
                    continue;
                }

                $sanitized[$normalizedKey] = mb_substr($normalizedValue, 0, 200);
            }
        }

        return $sanitized;
    }

    /**
     * Determine whether the key likely contains PII.
     */
    private function hasBlockedToken(string $value): bool
    {
        $normalized = mb_strtolower($value);
        foreach (self::BLOCKED_PROPERTY_TOKENS as $token) {
            if (str_contains($normalized, $token)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Determine whether the value appears to be an email address.
     */
    private function looksLikeEmail(string $value): bool
    {
        return (bool) preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $value);
    }
}
