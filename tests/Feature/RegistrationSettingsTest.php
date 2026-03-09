<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegistrationSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_registration_is_disabled_by_default(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Regular User',
            'email' => 'regular@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ]);

        $response->assertStatus(403);
    }

    public function test_registration_creates_default_calendar_and_address_book_when_enabled(): void
    {
        app(RegistrationSettingsService::class)->setPublicRegistrationEnabled(true);

        $response = $this->postJson('/api/auth/register', [
            'name' => 'New User',
            'email' => 'new-user@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ]);

        $response->assertCreated();

        $userId = $response->json('user.id');

        $this->assertDatabaseCount('calendars', 1);
        $this->assertDatabaseCount('address_books', 1);
        $this->assertDatabaseHas('calendars', [
            'owner_id' => $userId,
            'is_default' => true,
        ]);
        $this->assertDatabaseHas('address_books', [
            'owner_id' => $userId,
            'is_default' => true,
        ]);
    }

    public function test_registration_normalizes_email_and_rejects_case_variant_duplicates(): void
    {
        app(RegistrationSettingsService::class)->setPublicRegistrationEnabled(true);

        $first = $this->postJson('/api/auth/register', [
            'name' => 'Mixed Case',
            'email' => 'Mixed.Case@Example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ]);

        $first->assertCreated();
        $first->assertJsonPath('user.email', 'mixed.case@example.com');
        $this->assertDatabaseHas('users', [
            'email' => 'mixed.case@example.com',
        ]);

        $duplicate = $this->postJson('/api/auth/register', [
            'name' => 'Duplicate Case',
            'email' => 'MIXED.CASE@EXAMPLE.COM',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ]);

        $duplicate->assertStatus(422);
        $duplicate->assertJsonValidationErrors(['email']);
    }

    public function test_login_accepts_case_variant_email(): void
    {
        $user = User::factory()->create([
            'email' => 'login.case@example.com',
            'password' => 'Password123!',
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'LOGIN.CASE@EXAMPLE.COM',
            'password' => 'Password123!',
        ]);

        $response->assertOk();
        $response->assertJsonPath('user.id', $user->id);
    }

    public function test_public_config_includes_dav_compatibility_mode_setting(): void
    {
        app(RegistrationSettingsService::class)->setDavCompatibilityModeEnabled(true);

        $response = $this->getJson('/api/public/config');

        $response->assertOk();
        $response->assertJsonPath('dav_compatibility_mode_enabled', true);
    }

    public function test_public_config_includes_contact_management_setting(): void
    {
        app(RegistrationSettingsService::class)->setContactManagementEnabled(true);

        $response = $this->getJson('/api/public/config');

        $response->assertOk();
        $response->assertJsonPath('contact_management_enabled', true);
    }

    public function test_public_config_includes_contact_change_moderation_setting(): void
    {
        app(RegistrationSettingsService::class)->setContactChangeModerationEnabled(true);

        $response = $this->getJson('/api/public/config');

        $response->assertOk();
        $response->assertJsonPath('contact_change_moderation_enabled', true);
    }

    public function test_authenticated_me_payload_includes_contact_management_setting(): void
    {
        $user = User::factory()->create();
        app(RegistrationSettingsService::class)->setContactManagementEnabled(true);

        $response = $this->actingAs($user)->getJson('/api/auth/me');

        $response->assertOk();
        $response->assertJsonPath('contact_management_enabled', true);
    }

    public function test_authenticated_me_payload_includes_contact_change_moderation_setting(): void
    {
        $user = User::factory()->create();
        app(RegistrationSettingsService::class)->setContactChangeModerationEnabled(true);

        $response = $this->actingAs($user)->getJson('/api/auth/me');

        $response->assertOk();
        $response->assertJsonPath('contact_change_moderation_enabled', true);
    }

    public function test_public_config_includes_sponsorship_links_from_funding_file(): void
    {
        $path = storage_path('framework/testing/funding-for-test.yml');
        @mkdir(dirname($path), 0777, true);
        file_put_contents($path, <<<'YAML'
buy_me_a_coffee: lumen.supporter
custom:
  - https://example.com/support
YAML);

        try {
            config()->set('services.sponsorship.funding_file', $path);
            config()->set('services.sponsorship.button_hidden', false);

            $response = $this->getJson('/api/public/config');

            $response->assertOk();
            $response->assertJsonPath('sponsorship.enabled', true);
            $response->assertJsonFragment([
                'name' => 'Buy Me a Coffee',
                'url' => 'https://www.buymeacoffee.com/lumen.supporter',
            ]);
            $response->assertJsonFragment([
                'name' => 'Support Link (example.com)',
                'url' => 'https://example.com/support',
            ]);
        } finally {
            @unlink($path);
        }
    }

    public function test_public_config_hides_sponsorship_links_when_button_is_hidden(): void
    {
        $path = storage_path('framework/testing/funding-hidden-test.yml');
        @mkdir(dirname($path), 0777, true);
        file_put_contents($path, "buy_me_a_coffee: lumen.supporter\n");

        try {
            config()->set('services.sponsorship.funding_file', $path);
            config()->set('services.sponsorship.button_hidden', true);

            $response = $this->getJson('/api/public/config');

            $response->assertOk();
            $response->assertJsonPath('sponsorship.enabled', false);
            $response->assertJsonPath('sponsorship.links', []);
        } finally {
            @unlink($path);
        }
    }

    public function test_authenticated_me_payload_includes_sponsorship_links(): void
    {
        $user = User::factory()->create();
        $path = storage_path('framework/testing/funding-auth-test.yml');
        @mkdir(dirname($path), 0777, true);
        file_put_contents($path, "buy_me_a_coffee: lumen.supporter\n");

        try {
            config()->set('services.sponsorship.funding_file', $path);
            config()->set('services.sponsorship.button_hidden', false);

            $response = $this->actingAs($user)->getJson('/api/auth/me');

            $response->assertOk();
            $response->assertJsonPath('sponsorship.enabled', true);
            $response->assertJsonFragment([
                'name' => 'Buy Me a Coffee',
                'url' => 'https://www.buymeacoffee.com/lumen.supporter',
            ]);
        } finally {
            @unlink($path);
        }
    }
}
