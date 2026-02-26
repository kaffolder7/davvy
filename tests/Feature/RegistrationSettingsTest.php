<?php

namespace Tests\Feature;

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

    public function test_public_config_includes_dav_compatibility_mode_setting(): void
    {
        app(RegistrationSettingsService::class)->setDavCompatibilityModeEnabled(true);

        $response = $this->getJson('/api/public/config');

        $response->assertOk();
        $response->assertJsonPath('dav_compatibility_mode_enabled', true);
    }
}
