<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Calendar;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OwnerShareManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_regular_owner_can_share_own_resource_when_feature_enabled(): void
    {
        app(RegistrationSettingsService::class)->setOwnerShareManagementEnabled(true);

        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        $response = $this->actingAs($owner)->postJson('/api/shares', [
            'resource_type' => 'calendar',
            'resource_id' => $calendar->id,
            'shared_with_id' => $recipient->id,
            'permission' => 'read_only',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('resource_shares', [
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'resource_type' => 'calendar',
            'resource_id' => $calendar->id,
            'permission' => 'read_only',
        ]);
    }

    public function test_regular_owner_cannot_share_when_feature_disabled(): void
    {
        app(RegistrationSettingsService::class)->setOwnerShareManagementEnabled(false);

        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        $response = $this->actingAs($owner)->postJson('/api/shares', [
            'resource_type' => 'calendar',
            'resource_id' => $calendar->id,
            'shared_with_id' => $recipient->id,
            'permission' => 'read_only',
        ]);

        $response->assertForbidden();
    }

    public function test_admin_can_manage_shares_even_when_owner_share_management_disabled(): void
    {
        app(RegistrationSettingsService::class)->setOwnerShareManagementEnabled(false);

        $admin = User::factory()->create(['role' => Role::Admin]);
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        $response = $this->actingAs($admin)->postJson('/api/admin/shares', [
            'resource_type' => 'calendar',
            'resource_id' => $calendar->id,
            'shared_with_id' => $recipient->id,
            'permission' => 'admin',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('resource_shares', [
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'resource_type' => 'calendar',
            'resource_id' => $calendar->id,
            'permission' => 'admin',
        ]);
    }

    public function test_owner_can_assign_editor_permission_when_feature_enabled(): void
    {
        app(RegistrationSettingsService::class)->setOwnerShareManagementEnabled(true);

        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        $response = $this->actingAs($owner)->postJson('/api/shares', [
            'resource_type' => 'calendar',
            'resource_id' => $calendar->id,
            'shared_with_id' => $recipient->id,
            'permission' => 'editor',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('resource_shares', [
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'resource_type' => 'calendar',
            'resource_id' => $calendar->id,
            'permission' => 'editor',
        ]);
    }
}
