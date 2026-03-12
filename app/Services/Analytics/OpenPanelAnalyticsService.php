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
     * Creates a new OpenPanel analytics service instance.
     *
     * @param  OpenPanelSettings  $settings
     * @param  AnalyticsProfileService  $profiles
     * @return void
     */
    public function __construct(
        private readonly OpenPanelSettings $settings,
        private readonly AnalyticsProfileService $profiles,
    ) {}

    /**
     * Tracks an event to OpenPanel when enabled.
     *
     * @param  string  $name
     * @param  array<string, bool|int|float|string|null>  $properties
     * @param  User|null  $user
     * @return void
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
     * Returns browser bootstrap payload.
     *
     * @param  User|null  $user
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
     * Sanitizes custom event properties before transport.
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
     * Returns whether the key likely contains PII.
     *
     * @param  string  $value
     * @return bool
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
     * Returns whether the value appears to be an email address.
     *
     * @param  string  $value
     * @return bool
     */
    private function looksLikeEmail(string $value): bool
    {
        return (bool) preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $value);
    }
}
