<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\AddressBookContactMilestoneCalendar;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
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

    public function test_admin_can_toggle_contact_management_setting(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this
            ->actingAs($admin)
            ->patchJson('/api/admin/settings/contact-management', [
                'enabled' => true,
            ]);

        $response->assertOk();
        $response->assertJsonPath('enabled', true);
    }

    public function test_enabling_contact_management_requires_contact_schema_tables(): void
    {
        $admin = User::factory()->admin()->create();

        Schema::dropIfExists('contact_address_book_assignments');
        Schema::dropIfExists('contacts');

        $response = $this
            ->actingAs($admin)
            ->patchJson('/api/admin/settings/contact-management', [
                'enabled' => true,
            ]);

        $response->assertStatus(422);
        $response->assertJsonPath(
            'message',
            'Contact management schema is not available. Run migrations before enabling.',
        );
    }

    public function test_admin_can_purge_generated_milestone_calendars(): void
    {
        $admin = User::factory()->admin()->create();
        $owner = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Contacts',
            'uri' => 'milestone-purge-test-book',
        ]);

        $birthdayCalendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Contacts Birthdays',
        ]);
        $anniversaryCalendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Contacts Anniversaries',
        ]);

        $birthdaySetting = AddressBookContactMilestoneCalendar::query()->create([
            'address_book_id' => $addressBook->id,
            'milestone_type' => AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
            'enabled' => true,
            'calendar_id' => $birthdayCalendar->id,
            'custom_display_name' => null,
        ]);
        $anniversarySetting = AddressBookContactMilestoneCalendar::query()->create([
            'address_book_id' => $addressBook->id,
            'milestone_type' => AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
            'enabled' => true,
            'calendar_id' => $anniversaryCalendar->id,
            'custom_display_name' => 'Marriage Milestones',
        ]);

        CalendarObject::query()->create([
            'calendar_id' => $birthdayCalendar->id,
            'uri' => 'davvy-milestone-birthday-contact-1.ics',
            'etag' => md5('birthday-1'),
            'size' => 10,
            'component_type' => 'VEVENT',
            'data' => 'BEGIN:VCALENDAR',
        ]);
        CalendarObject::query()->create([
            'calendar_id' => $anniversaryCalendar->id,
            'uri' => 'davvy-milestone-anniversary-contact-1-1.ics',
            'etag' => md5('anniversary-1'),
            'size' => 11,
            'component_type' => 'VEVENT',
            'data' => 'BEGIN:VCALENDAR',
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/admin/contact-milestones/purge-generated-calendars')
            ->assertOk();

        $response->assertJsonPath('purged_calendar_count', 2);
        $response->assertJsonPath('purged_event_count', 2);
        $response->assertJsonPath('disabled_setting_count', 2);

        $this->assertDatabaseMissing('calendars', ['id' => $birthdayCalendar->id]);
        $this->assertDatabaseMissing('calendars', ['id' => $anniversaryCalendar->id]);
        $this->assertDatabaseMissing('calendar_objects', ['calendar_id' => $birthdayCalendar->id]);
        $this->assertDatabaseMissing('calendar_objects', ['calendar_id' => $anniversaryCalendar->id]);
        $this->assertDatabaseHas('address_book_contact_milestone_calendars', [
            'id' => $birthdaySetting->id,
            'enabled' => false,
            'calendar_id' => null,
        ]);
        $this->assertDatabaseHas('address_book_contact_milestone_calendars', [
            'id' => $anniversarySetting->id,
            'enabled' => false,
            'calendar_id' => null,
            'custom_display_name' => 'Marriage Milestones',
        ]);
    }

    public function test_regular_user_cannot_purge_generated_milestone_calendars(): void
    {
        $regular = User::factory()->create();

        $this->actingAs($regular)
            ->postJson('/api/admin/contact-milestones/purge-generated-calendars')
            ->assertForbidden();
    }

    public function test_purging_generated_milestone_calendars_requires_schema_tables(): void
    {
        $admin = User::factory()->admin()->create();
        Schema::dropIfExists('address_book_contact_milestone_calendars');

        $this->actingAs($admin)
            ->postJson('/api/admin/contact-milestones/purge-generated-calendars')
            ->assertStatus(422)
            ->assertJsonPath(
                'message',
                'Milestone calendar schema is not available. Run migrations before purging milestone calendars.',
            );
    }
}
