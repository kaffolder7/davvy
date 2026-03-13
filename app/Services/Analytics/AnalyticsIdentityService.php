<?php

namespace App\Services\Analytics;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Support\Str;

class AnalyticsIdentityService
{
    private const INSTALLATION_SETTING_KEY = 'analytics_installation_id';

    /**
     * Create a new analytics identity service instance.
     */
    public function __construct(private readonly AnalyticsSettings $settings) {}

    /**
     * Returns a stable distinct ID for the current installation.
     */
    public function installationDistinctId(): string
    {
        return 'inst_'.substr($this->hash('installation:'.$this->installationId()), 0, 32);
    }

    /**
     * Returns a distinct ID for a user-like actor or falls back to installation scope.
     */
    public function distinctIdFor(User|string|int|null $actor = null): string
    {
        if ($actor instanceof User) {
            return 'usr_'.substr($this->hash('user:'.$actor->getKey()), 0, 32);
        }

        if (is_int($actor) || is_string($actor)) {
            $normalized = trim((string) $actor);
            if ($normalized !== '') {
                return 'act_'.substr($this->hash('actor:'.$normalized), 0, 32);
            }
        }

        return $this->installationDistinctId();
    }

    /**
     * Returns a persistent installation identifier generated once per deployment.
     */
    private function installationId(): string
    {
        $setting = AppSetting::query()->find(self::INSTALLATION_SETTING_KEY);
        $existing = trim((string) ($setting?->value ?? ''));
        if ($existing !== '') {
            return $existing;
        }

        $generated = (string) Str::uuid();

        AppSetting::query()->updateOrCreate(
            ['key' => self::INSTALLATION_SETTING_KEY],
            ['value' => $generated, 'updated_by' => null],
        );

        return $generated;
    }

    /**
     * Returns an HMAC hash string for analytics identity values.
     */
    private function hash(string $value): string
    {
        return hash_hmac('sha256', $value, $this->settings->hashKey());
    }
}
