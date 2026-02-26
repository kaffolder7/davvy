<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminUserManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_users_with_roles_and_defaults(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/admin/users', [
                'name' => 'Managed User',
                'email' => 'managed@example.com',
                'password' => 'Password123!',
                'role' => 'regular',
            ]);

        $response->assertCreated();

        $createdUser = User::query()->where('email', 'managed@example.com')->firstOrFail();

        $this->assertDatabaseHas('calendars', ['owner_id' => $createdUser->id, 'is_default' => true]);
        $this->assertDatabaseHas('address_books', ['owner_id' => $createdUser->id, 'is_default' => true]);
    }

    public function test_regular_user_cannot_access_admin_user_creation(): void
    {
        $regular = User::factory()->create();

        $response = $this
            ->actingAs($regular)
            ->postJson('/api/admin/users', [
                'name' => 'Blocked User',
                'email' => 'blocked@example.com',
                'password' => 'Password123!',
                'role' => 'regular',
            ]);

        $response->assertForbidden();
    }

    public function test_admin_can_toggle_owner_share_management_setting(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this
            ->actingAs($admin)
            ->patchJson('/api/admin/settings/owner-share-management', [
                'enabled' => false,
            ]);

        $response->assertOk();
        $response->assertJsonPath('enabled', false);
    }

    public function test_admin_can_toggle_dav_compatibility_mode_setting(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this
            ->actingAs($admin)
            ->patchJson('/api/admin/settings/dav-compatibility-mode', [
                'enabled' => true,
            ]);

        $response->assertOk();
        $response->assertJsonPath('enabled', true);
    }
}
