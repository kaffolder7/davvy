<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Analytics\AnalyticsProfileService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsBootstrapConfigTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_config_exposes_openpanel_bootstrap_when_enabled(): void
    {
        $this->configureOpenPanel(enabled: true, ddevDetected: false);

        $this->getJson('/api/public/config')
            ->assertOk()
            ->assertJsonPath('analytics.enabled', true)
            ->assertJsonPath('analytics.client_id', 'client_public')
            ->assertJsonPath('analytics.api_url', 'https://analytics.example.test')
            ->assertJsonPath('analytics.script_url', 'https://analytics.example.test/op1.js')
            ->assertJsonMissingPath('analytics.profile_id');
    }

    public function test_authenticated_config_exposes_hashed_profile_identifier(): void
    {
        $this->configureOpenPanel(enabled: true, ddevDetected: false);
        $user = User::factory()->create();
        $expectedProfileId = app(AnalyticsProfileService::class)->profileIdForUser($user);

        $this->actingAs($user)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('analytics.enabled', true)
            ->assertJsonPath('analytics.profile_id', $expectedProfileId)
            ->assertJsonMissingPath('analytics.user_id');
    }

    public function test_public_and_authenticated_config_disable_analytics_when_ddev_is_detected(): void
    {
        $this->configureOpenPanel(enabled: true, ddevDetected: true);
        $user = User::factory()->create();

        $this->getJson('/api/public/config')
            ->assertOk()
            ->assertJsonPath('analytics.enabled', false)
            ->assertJsonMissingPath('analytics.client_id');

        $this->actingAs($user)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('analytics.enabled', false)
            ->assertJsonMissingPath('analytics.profile_id');
    }

    private function configureOpenPanel(bool $enabled, bool $ddevDetected): void
    {
        config()->set('services.openpanel.enabled', $enabled);
        config()->set('services.openpanel.disable_in_ddev', true);
        config()->set('services.openpanel.ddev_detected', $ddevDetected);
        config()->set('services.openpanel.client_id', 'client_public');
        config()->set('services.openpanel.client_secret', 'secret_private');
        config()->set('services.openpanel.api_url', 'https://analytics.example.test');
        config()->set('services.openpanel.script_url', 'https://analytics.example.test/op1.js');
    }
}

