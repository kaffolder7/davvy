<?php

namespace App\Services\Analytics;

class OpenPanelSettings
{
    private const BROWSER_API_BASE_PATH = '/api/davvy-events';

    private const BROWSER_SCRIPT_PATH = '/davvy-op1.js';

    /**
     * Determine whether tracking should run for the current runtime.
     */
    public function trackingEnabled(): bool
    {
        return (bool) config('services.openpanel.enabled', true);
    }

    /**
     * Determine whether browser tracking can be initialized safely.
     */
    public function clientTrackingEnabled(): bool
    {
        return $this->trackingEnabled()
            && $this->isConfiguredValue($this->clientId())
            && $this->isConfiguredValue($this->clientSecret())
            && $this->isConfiguredValue($this->apiUrl());
    }

    /**
     * Determine whether server-side tracking can be sent.
     */
    public function serverTrackingEnabled(): bool
    {
        return $this->clientTrackingEnabled();
    }

    /**
     * Return the OpenPanel browser client ID.
     */
    public function clientId(): string
    {
        return trim((string) config('services.openpanel.client_id', ''));
    }

    /**
     * Return the OpenPanel server client secret.
     */
    public function clientSecret(): string
    {
        return trim((string) config('services.openpanel.client_secret', ''));
    }

    /**
     * Return the OpenPanel API base URL.
     */
    public function apiUrl(): string
    {
        return rtrim((string) config('services.openpanel.api_url', ''), '/');
    }

    /**
     * Return the browser proxy API base URL.
     */
    public function browserApiUrl(): string
    {
        return self::BROWSER_API_BASE_PATH;
    }

    /**
     * Return the browser proxy script URL.
     */
    public function scriptUrl(): string
    {
        return self::BROWSER_SCRIPT_PATH;
    }

    /**
     * Determine whether a config value is present and not a placeholder.
     */
    private function isConfiguredValue(string $value): bool
    {
        return $value !== '' && ! str_starts_with($value, 'REPLACE_WITH_');
    }
}
