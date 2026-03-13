<?php

namespace Tests\Unit;

use App\Services\Analytics\AnalyticsInstallationService;
use Tests\TestCase;

class AnalyticsInstallationServiceTest extends TestCase
{
    public function test_installation_id_is_stable_for_same_app_key(): void
    {
        config()->set('app.key', 'base64:test-app-key');
        config()->set('app.url', 'https://davvy.example.test');

        $service = app(AnalyticsInstallationService::class);

        $first = $service->installationId();
        $second = $service->installationId();

        $this->assertSame($first, $second);
        $this->assertNotSame('base64:test-app-key', $first);
    }

    public function test_installation_id_falls_back_to_app_url_when_key_missing(): void
    {
        config()->set('app.key', '');
        config()->set('app.url', 'https://davvy.example.test');

        $service = app(AnalyticsInstallationService::class);
        $expected = hash_hmac(
            'sha256',
            'installation:analytics',
            'https://davvy.example.test',
        );

        $this->assertSame($expected, $service->installationId());
        $this->assertSame($expected, $service->profileId());
    }
}
