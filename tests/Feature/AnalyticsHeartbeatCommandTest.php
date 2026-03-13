<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AnalyticsHeartbeatCommandTest extends TestCase
{
    public function test_analytics_heartbeat_command_tracks_installation_event(): void
    {
        config()->set('services.openpanel.enabled', true);
        config()->set('services.openpanel.client_id', 'client_123');
        config()->set('services.openpanel.client_secret', 'secret_abc');
        config()->set('services.openpanel.api_url', 'https://analytics.example.test');

        Http::fake([
            'https://analytics.example.test/track' => Http::response(['ok' => true], 200),
        ]);

        $this->artisan('app:analytics:heartbeat')
            ->assertExitCode(0);

        Http::assertSent(function ($request): bool {
            if ($request->url() !== 'https://analytics.example.test/track') {
                return false;
            }

            $payload = $request->data();

            $this->assertSame('installation.heartbeat', $payload['payload']['name'] ?? null);

            return true;
        });
    }
}
