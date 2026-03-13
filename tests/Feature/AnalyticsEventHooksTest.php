<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AnalyticsEventHooksTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_tracks_auth_register_event(): void
    {
        $this->enableAnalytics();
        $this->configureRegistration(enabled: true, requireApproval: false, requireVerification: false);

        $this->postJson('/api/auth/register', [
            'name' => 'Analytics User',
            'email' => 'analytics-user@example.test',
            'password' => 'password1234',
            'password_confirmation' => 'password1234',
        ])->assertCreated();

        $this->assertAnalyticsEventSent('auth.register', function (array $properties): void {
            $this->assertSame('completed', $properties['status'] ?? null);
            $this->assertSame(false, $properties['requires_approval'] ?? null);
            $this->assertSame(false, $properties['requires_verification'] ?? null);
        });
    }

    public function test_contacts_store_tracks_contacts_created_event(): void
    {
        $this->enableAnalytics();
        app(RegistrationSettingsService::class)->setContactManagementEnabled(true);

        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'uri' => 'analytics-book',
        ]);

        $this->actingAs($user)
            ->postJson('/api/contacts', [
                'first_name' => 'Taylor',
                'last_name' => 'Sample',
                'address_book_ids' => [$addressBook->id],
            ])
            ->assertCreated();

        $this->assertAnalyticsEventSent('contacts.created', function (array $properties): void {
            $this->assertSame('web', $properties['source'] ?? null);
            $this->assertSame('success', $properties['status'] ?? null);
            $this->assertSame(1, $properties['address_book_count'] ?? null);
        });
    }

    public function test_share_upsert_tracks_sharing_created_event(): void
    {
        $this->enableAnalytics();
        app(RegistrationSettingsService::class)->setOwnerShareManagementEnabled(true);

        $owner = User::factory()->create();
        $recipient = User::factory()->create();
        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        $this->actingAs($owner)
            ->postJson('/api/shares', [
                'resource_type' => 'calendar',
                'resource_id' => $calendar->id,
                'shared_with_id' => $recipient->id,
                'permission' => 'editor',
            ])
            ->assertCreated();

        $this->assertAnalyticsEventSent('sharing.created', function (array $properties): void {
            $this->assertSame('create', $properties['action'] ?? null);
            $this->assertSame('calendar', $properties['resource_type'] ?? null);
            $this->assertSame('editor', $properties['permission'] ?? null);
        });
    }

    public function test_admin_setting_toggle_tracks_admin_setting_changed_event(): void
    {
        $this->enableAnalytics();
        app(RegistrationSettingsService::class)->setOwnerShareManagementEnabled(true);

        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->patchJson('/api/admin/settings/owner-share-management', [
                'enabled' => false,
            ])
            ->assertOk()
            ->assertJsonPath('enabled', false);

        $this->assertAnalyticsEventSent('admin.setting_changed', function (array $properties): void {
            $this->assertSame('sharing.owner_management_enabled', $properties['setting_key'] ?? null);
            $this->assertSame(true, $properties['from_state'] ?? null);
            $this->assertSame(false, $properties['to_state'] ?? null);
        });
    }

    public function test_scheduled_backup_command_tracks_backups_scheduled_run_event(): void
    {
        $this->enableAnalytics();

        $this->artisan('app:backup')
            ->assertExitCode(0);

        $this->assertAnalyticsEventSent('backups.scheduled_run', function (array $properties): void {
            $this->assertSame('skipped', $properties['status'] ?? null);
            $this->assertSame('scheduled', $properties['trigger'] ?? null);
            $this->assertSame('disabled', $properties['code'] ?? null);
        });
    }

    private function configureRegistration(bool $enabled, bool $requireApproval, bool $requireVerification): void
    {
        $settings = app(RegistrationSettingsService::class);
        $settings->setPublicRegistrationEnabled($enabled);
        $settings->setPublicRegistrationApprovalRequired($requireApproval);
        config()->set('onboarding.require_public_email_verification', $requireVerification);
    }

    private function enableAnalytics(): void
    {
        config()->set('services.openpanel.enabled', true);
        config()->set('services.openpanel.client_id', 'client_123');
        config()->set('services.openpanel.client_secret', 'secret_abc');
        config()->set('services.openpanel.api_url', 'https://analytics.example.test');
        config()->set('services.openpanel.script_url', 'https://analytics.example.test/op1.js');

        Http::fake([
            'https://analytics.example.test/track' => Http::response(['ok' => true], 200),
        ]);
    }

    /**
     * @param  callable(array<string, bool|int|float|string|null>):void|null  $assertProperties
     */
    private function assertAnalyticsEventSent(string $eventName, ?callable $assertProperties = null): void
    {
        Http::assertSent(function ($request) use ($eventName, $assertProperties): bool {
            if ($request->url() !== 'https://analytics.example.test/track') {
                return false;
            }

            $payload = $request->data();
            if (($payload['type'] ?? null) !== 'track') {
                return false;
            }

            if (($payload['payload']['name'] ?? null) !== $eventName) {
                return false;
            }

            $properties = is_array($payload['payload']['properties'] ?? null)
                ? $payload['payload']['properties']
                : [];

            if ($assertProperties) {
                $assertProperties($properties);
            }

            return true;
        });
    }
}

