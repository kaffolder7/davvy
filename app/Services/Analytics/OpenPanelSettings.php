<?php

namespace App\Services\Analytics;

class OpenPanelSettings
{
    /**
     * Returns whether tracking should run at all for current runtime.
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
     * Returns whether browser tracking can be initialized safely.
     */
    public function clientTrackingEnabled(): bool
    {
        return $this->trackingEnabled() && $this->clientId() !== '';
    }

    /**
     * Returns whether server-side tracking can be sent.
     */
    public function serverTrackingEnabled(): bool
    {
        return $this->clientTrackingEnabled() && $this->clientSecret() !== '';
    }

    /**
     * Returns the OpenPanel browser client ID.
     */
    public function clientId(): string
    {
        return (string) config('services.openpanel.client_id', '');
    }

    /**
     * Returns the OpenPanel server client secret.
     */
    public function clientSecret(): string
    {
        return (string) config('services.openpanel.client_secret', '');
    }

    /**
     * Returns the OpenPanel API base URL.
     */
    public function apiUrl(): string
    {
        return (string) config('services.openpanel.api_url', 'https://api.openpanel.dev');
    }

    /**
     * Returns script source for browser runtime.
     */
    public function scriptUrl(): string
    {
        return (string) config('services.openpanel.script_url', 'https://openpanel.dev/op1.js');
    }
}
