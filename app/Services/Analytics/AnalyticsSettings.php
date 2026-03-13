<?php

namespace App\Services\Analytics;

class AnalyticsSettings
{
    /**
     * Returns true when analytics is globally enabled and configured.
     */
    public function enabled(): bool
    {
        return $this->envFlagEnabled() && $this->posthogProjectApiKey() !== '';
    }

    /**
     * Returns whether the global env flag is enabled, regardless of provider config completeness.
     */
    public function envFlagEnabled(): bool
    {
        return (bool) config('services.analytics.enabled', true);
    }

    /**
     * Returns the PostHog API host.
     */
    public function posthogHost(): string
    {
        $host = trim((string) config('services.analytics.posthog_host', 'https://us.i.posthog.com'));

        return $host === '' ? 'https://us.i.posthog.com' : rtrim($host, '/');
    }

    /**
     * Returns the PostHog project API key.
     */
    public function posthogProjectApiKey(): string
    {
        return trim((string) config('services.analytics.posthog_project_api_key', ''));
    }

    /**
     * Returns the configured queue name or null when default queue should be used.
     */
    public function queueName(): ?string
    {
        $queue = trim((string) config('services.analytics.queue', ''));

        return $queue === '' ? null : $queue;
    }

    /**
     * Returns the secret used to HMAC-hash analytics identities.
     */
    public function hashKey(): string
    {
        $configured = trim((string) config('services.analytics.hash_key', ''));
        if ($configured !== '') {
            return $configured;
        }

        return (string) config('app.key', 'davvy-analytics-fallback');
    }
}
