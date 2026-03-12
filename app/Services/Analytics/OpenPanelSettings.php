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
        if (! (bool) config('services.openpanel.enabled', true)) {
            return false;
        }

        if (
            (bool) config('services.openpanel.disable_in_ddev', true)
            && (bool) config('services.openpanel.ddev_detected', false)
        ) {
            return false;
        }

        return true;
    }

    /**
     * Determine whether browser tracking can be initialized safely.
     *
     * @return bool
     */
    public function clientTrackingEnabled(): bool
    {
        return $this->trackingEnabled() && $this->clientId() !== '';
    }

    /**
     * Determine whether server-side tracking can be sent.
     *
     * @return bool
     */
    public function serverTrackingEnabled(): bool
    {
        return $this->clientTrackingEnabled() && $this->clientSecret() !== '';
    }

    /**
     * Return the OpenPanel browser client ID.
     *
     * @return string
     */
    public function clientId(): string
    {
        return (string) config('services.openpanel.client_id', '');
    }

    /**
     * Return the OpenPanel server client secret.
     *
     * @return string
     */
    public function clientSecret(): string
    {
        return (string) config('services.openpanel.client_secret', '');
    }

    /**
     * Return the OpenPanel API base URL.
     *
     * @return string
     */
    public function apiUrl(): string
    {
        return (string) config('services.openpanel.api_url', 'https://api.openpanel.dev');
    }

    /**
     * Return the script source for browser runtime.
     *
     * @return string
     */
    public function scriptUrl(): string
    {
        return (string) config('services.openpanel.script_url', 'https://openpanel.dev/op1.js');
    }
}
