<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AnalyticsProxyControllerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Cache::forget('analytics:openpanel:op1-script');
    }

    public function test_script_proxy_returns_upstream_browser_sdk_when_enabled(): void
    {
        $this->configureOpenPanel(enabled: true);

        Http::fake([
            'https://openpanel.dev/op1.js' => Http::response('window.__op_test = true;', 200),
        ]);

        $this->get('/davvy-op1.js')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/javascript; charset=utf-8')
            ->assertSee('window.__op_test = true;', false);

        Http::assertSentCount(1);
    }

    public function test_script_proxy_returns_not_found_when_analytics_is_disabled(): void
    {
        $this->configureOpenPanel(enabled: false);

        Http::fake();

        $this->get('/davvy-op1.js')->assertNotFound();

        Http::assertNothingSent();
    }

    public function test_track_proxy_forwards_sanitized_payload_to_upstream_track_endpoint(): void
    {
        $this->configureOpenPanel(enabled: true);

        Http::fake([
            'https://analytics.example.test/track' => Http::response([
                'sessionId' => 'sess_123',
                'deviceId' => 'dev_456',
            ], 200),
        ]);

        $this->postJson('/api/davvy-events/track', [
            'type' => 'track',
            'payload' => [
                'name' => 'ui.feature_interaction',
                'properties' => [
                    'feature_key' => 'backups',
                    'surface' => 'admin',
                    'admin_email' => 'admin@example.test',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('sessionId', 'sess_123');

        Http::assertSent(function ($request): bool {
            if ($request->url() !== 'https://analytics.example.test/track') {
                return false;
            }

            $this->assertSame('client_public', $request->header('openpanel-client-id')[0] ?? null);
            $this->assertSame('secret_private', $request->header('openpanel-client-secret')[0] ?? null);

            $payload = $request->data();
            $this->assertSame('track', $payload['type'] ?? null);
            $this->assertSame('ui.feature_interaction', $payload['payload']['name'] ?? null);
            $this->assertSame('backups', $payload['payload']['properties']['feature_key'] ?? null);
            $this->assertSame('admin', $payload['payload']['properties']['surface'] ?? null);
            $this->assertArrayNotHasKey('admin_email', $payload['payload']['properties'] ?? []);

            return true;
        });
    }

    public function test_track_proxy_is_a_noop_when_analytics_is_disabled(): void
    {
        $this->configureOpenPanel(enabled: false);

        Http::fake();

        $this->postJson('/api/davvy-events/track', [
            'type' => 'track',
            'payload' => [
                'name' => 'screen_view',
                'properties' => [
                    '__path' => '/contacts',
                ],
            ],
        ])->assertStatus(202)->assertJsonPath('disabled', true);

        Http::assertNothingSent();
    }

    public function test_track_proxy_ignores_unsupported_event_types(): void
    {
        $this->configureOpenPanel(enabled: true);

        Http::fake();

        $this->postJson('/api/davvy-events/track', [
            'type' => 'revenue',
            'payload' => [
                'amount' => 25,
            ],
        ])->assertStatus(202);

        Http::assertNothingSent();
    }

    private function configureOpenPanel(bool $enabled): void
    {
        config()->set('services.openpanel.enabled', $enabled);
        config()->set('services.openpanel.client_id', 'client_public');
        config()->set('services.openpanel.client_secret', 'secret_private');
        config()->set('services.openpanel.api_url', 'https://analytics.example.test');
    }
}
