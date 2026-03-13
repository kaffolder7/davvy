<?php

namespace App\Services\Analytics;

class AnalyticsInstallationService
{
    /**
     * Return a stable, non-reversible installation identifier.
     */
    public function installationId(): string
    {
        $material = trim((string) config('app.key', ''));

        if ($material === '') {
            $material = trim((string) config('app.url', ''));
        }

        if ($material === '') {
            $material = 'davvy-installation';
        }

        return hash_hmac('sha256', 'installation:analytics', $material);
    }

    /**
     * Return a stable profile identifier used for installation heartbeats.
     */
    public function profileId(): string
    {
        return $this->installationId();
    }
}
