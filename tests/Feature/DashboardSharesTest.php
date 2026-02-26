<?php

namespace Tests\Feature;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\ResourceShare;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardSharesTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_lists_owned_and_shared_resources_with_permission_labels(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $sharedCalendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Team Calendar',
            'uri' => 'team-calendar',
            'is_sharable' => true,
        ]);

        $sharedAddressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Team Contacts',
            'uri' => 'team-contacts',
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::Calendar,
            'resource_id' => $sharedCalendar->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::ReadOnly,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::AddressBook,
            'resource_id' => $sharedAddressBook->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::Admin,
        ]);

        $response = $this->actingAs($recipient)->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonPath('shared.calendars.0.permission', 'read_only');
        $response->assertJsonPath('shared.address_books.0.permission', 'admin');
        $response->assertJsonFragment(['display_name' => 'Team Calendar']);
        $response->assertJsonFragment(['display_name' => 'Team Contacts']);
    }
}
