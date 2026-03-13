<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\Analytics\AnalyticsProfileService;
use App\Services\Analytics\OpenPanelAnalyticsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OpenPanelAnalyticsServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_track_is_a_noop_when_analytics_is_disabled(): void
    {
        config()->set("services.openpanel.enabled", false);
        config()->set("services.openpanel.client_id", "client_123");
        config()->set("services.openpanel.client_secret", "secret_abc");
        config()->set(
            "services.openpanel.api_url",
            "https://analytics.example.test",
        );

        Http::fake();

        app(OpenPanelAnalyticsService::class)->track("auth.login", [
            "method" => "password",
        ]);

        Http::assertNothingSent();
    }

    public function test_track_is_a_noop_when_provider_values_are_not_configured(): void
    {
        config()->set("services.openpanel.enabled", true);
        config()->set(
            "services.openpanel.client_id",
            "REPLACE_WITH_OPENPANEL_CLIENT_ID",
        );
        config()->set(
            "services.openpanel.client_secret",
            "REPLACE_WITH_OPENPANEL_CLIENT_SECRET",
        );
        config()->set(
            "services.openpanel.api_url",
            "REPLACE_WITH_OPENPANEL_API_URL",
        );

        Http::fake();

        app(OpenPanelAnalyticsService::class)->track("auth.login", [
            "method" => "password",
        ]);

        Http::assertNothingSent();
    }

    public function test_track_posts_sanitized_payload_with_hashed_profile_id(): void
    {
        config()->set("services.openpanel.enabled", true);
        config()->set("services.openpanel.client_id", "client_123");
        config()->set("services.openpanel.client_secret", "secret_abc");
        config()->set(
            "services.openpanel.api_url",
            "https://analytics.example.test",
        );

        $user = User::factory()->create();
        $expectedProfileId = app(
            AnalyticsProfileService::class,
        )->profileIdForUser($user);

        Http::fake([
            "https://analytics.example.test/track" => Http::response(
                ["ok" => true],
                200,
            ),
        ]);

        app(OpenPanelAnalyticsService::class)->track(
            "backups.restore",
            [
                "status" => "success",
                "resource_count" => 3,
                "admin_email" => "admin@example.com",
                "api_token" => "secret-token-value",
                "empty_field" => "  ",
            ],
            $user,
        );

        Http::assertSent(function ($request) use ($expectedProfileId): bool {
            if ($request->url() !== "https://analytics.example.test/track") {
                return false;
            }

            $payload = $request->data();
            $properties = $payload["payload"]["properties"] ?? [];

            $this->assertSame("track", $payload["type"] ?? null);
            $this->assertSame(
                "backups.restore",
                $payload["payload"]["name"] ?? null,
            );
            $this->assertSame(
                $expectedProfileId,
                $payload["payload"]["profileId"] ?? null,
            );
            $this->assertSame("success", $properties["status"] ?? null);
            $this->assertSame(3, $properties["resource_count"] ?? null);
            $this->assertArrayNotHasKey("admin_email", $properties);
            $this->assertArrayNotHasKey("api_token", $properties);
            $this->assertArrayNotHasKey("empty_field", $properties);

            return true;
        });
    }
}
