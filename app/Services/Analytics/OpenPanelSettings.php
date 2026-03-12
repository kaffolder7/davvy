<?php

namespace App\Services\Analytics;

class OpenPanelSettings
{
    /**
     * Determine whether tracking should run for the current runtime.
     *
     * @return bool
     */
    public function trackingEnabled(): bool
    {
        return (bool) config('services.openpanel.enabled', true);
    }

    /**
     * Determine whether browser tracking can be initialized safely.
     *
     * @return bool
     */
    public function clientTrackingEnabled(): bool
    {
        return $this->trackingEnabled()
            && $this->isConfiguredValue($this->clientId())
            && $this->isConfiguredValue($this->apiUrl())
            && $this->scriptUrl() !== '';
    }

    /**
     * Determine whether server-side tracking can be sent.
     *
     * @return bool
     */
    public function serverTrackingEnabled(): bool
    {
        return $this->clientTrackingEnabled() && $this->isConfiguredValue($this->clientSecret());
    }

    /**
     * Return the OpenPanel browser client ID.
     *
     * @return string
     */
    public function clientId(): string
    {
        return trim((string) config('services.openpanel.client_id', ''));
    }

    /**
     * Return the OpenPanel server client secret.
     *
     * @return string
     */
    public function clientSecret(): string
    {
        return trim((string) config('services.openpanel.client_secret', ''));
    }

    /**
     * Return the OpenPanel API base URL.
     *
     * @return string
     */
    public function apiUrl(): string
    {
        return rtrim((string) config('services.openpanel.api_url', ''), '/');
    }

    /**
     * Return the script source for browser runtime.
     *
     * @return string
     */
    public function scriptUrl(): string
    {
        $configured = trim((string) config('services.openpanel.script_url', ''));
        if ($this->isConfiguredValue($configured)) {
            return $configured;
        }

        $apiUrl = $this->apiUrl();
        if (! $this->isConfiguredValue($apiUrl)) {
            return '';
        }

        $parts = parse_url($apiUrl);
        $scheme = (string) ($parts['scheme'] ?? '');
        $host = (string) ($parts['host'] ?? '');
        $port = isset($parts['port']) ? ':'.$parts['port'] : '';

        if ($scheme === '' || $host === '') {
            return '';
        }

        return $scheme.'://'.$host.$port.'/op1.js';
    }

    /**
     * Determine whether a config value is present and not a placeholder.
     *
     * @param  string  $value
     * @return bool
     */
    private function isConfiguredValue(string $value): bool
    {
        return $value !== '' && ! str_starts_with($value, 'REPLACE_WITH_');
    }
}
