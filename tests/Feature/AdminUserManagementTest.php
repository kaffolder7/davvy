<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\AddressBookContactMilestoneCalendar;
use App\Models\AppSetting;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\Contact;
use App\Models\ContactChangeRequest;
use App\Models\ResourceShare;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
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

        $this->assertTrue((bool) $createdUser->is_approved);
        $this->assertSame($admin->id, $createdUser->approved_by);
        $this->assertNotNull($createdUser->approved_at);
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

    public function test_admin_user_creation_normalizes_email_and_rejects_case_variant_duplicates(): void
    {
        $admin = User::factory()->admin()->create();

        $first = $this
            ->actingAs($admin)
            ->postJson('/api/admin/users', [
                'name' => 'Case Managed User',
                'email' => 'Case.Managed@Example.com',
                'password' => 'Password123!',
                'role' => 'regular',
            ]);

        $first->assertCreated();
        $first->assertJsonPath('email', 'case.managed@example.com');
        $this->assertDatabaseHas('users', [
            'email' => 'case.managed@example.com',
        ]);

        $duplicate = $this
            ->actingAs($admin)
            ->postJson('/api/admin/users', [
                'name' => 'Case Duplicate User',
                'email' => 'CASE.MANAGED@EXAMPLE.COM',
                'password' => 'Password123!',
                'role' => 'regular',
            ]);

        $duplicate->assertStatus(422);
        $duplicate->assertJsonValidationErrors(['email']);
    }

    public function test_admin_can_delete_user_without_transfer_and_owned_data_is_removed(): void
    {
        $admin = User::factory()->admin()->create();
        $doomed = User::factory()->create();
        $sharedWith = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $doomed->id,
            'is_sharable' => true,
            'uri' => 'doomed-calendar',
        ]);
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $doomed->id,
            'is_sharable' => true,
            'uri' => 'doomed-address-book',
        ]);
        $contact = Contact::query()->create([
            'owner_id' => $doomed->id,
            'uid' => 'doomed-contact-uid',
            'full_name' => 'Doomed Contact',
            'payload' => ['first_name' => 'Doomed'],
        ]);
        ResourceShare::query()->create([
            'resource_type' => 'calendar',
            'resource_id' => $calendar->id,
            'owner_id' => $doomed->id,
            'shared_with_id' => $sharedWith->id,
            'permission' => 'read_only',
        ]);
        ResourceShare::query()->create([
            'resource_type' => 'address_book',
            'resource_id' => $addressBook->id,
            'owner_id' => $doomed->id,
            'shared_with_id' => $sharedWith->id,
            'permission' => 'editor',
        ]);

        $this->actingAs($admin)
            ->deleteJson('/api/admin/users/'.$doomed->id, [
                'confirmation_email' => $admin->email,
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('deleted_user_id', $doomed->id)
            ->assertJsonPath('transferred_to_user_id', null);

        $this->assertDatabaseMissing('users', ['id' => $doomed->id]);
        $this->assertDatabaseMissing('calendars', ['id' => $calendar->id]);
        $this->assertDatabaseMissing('address_books', ['id' => $addressBook->id]);
        $this->assertDatabaseMissing('contacts', ['id' => $contact->id]);
        $this->assertDatabaseMissing('resource_shares', ['owner_id' => $doomed->id]);
        $this->assertDatabaseCount('users', 2);
    }

    public function test_admin_can_delete_user_with_transfer_and_ownership_moves_to_target_user(): void
    {
        $admin = User::factory()->admin()->create();
        $source = User::factory()->create();
        $target = User::factory()->create();
        $sharedWith = User::factory()->create();

        $sourceCalendar = Calendar::factory()->create([
            'owner_id' => $source->id,
            'is_sharable' => true,
            'uri' => 'family',
            'is_default' => false,
        ]);
        $sourceAddressBook = AddressBook::factory()->create([
            'owner_id' => $source->id,
            'is_sharable' => true,
            'uri' => 'family-contacts',
            'is_default' => false,
        ]);
        Calendar::factory()->create([
            'owner_id' => $target->id,
            'uri' => 'family',
        ]);
        AddressBook::factory()->create([
            'owner_id' => $target->id,
            'uri' => 'family-contacts',
        ]);

        $targetContact = Contact::query()->create([
            'owner_id' => $target->id,
            'uid' => 'target-contact-uid',
            'full_name' => 'Target Contact',
            'payload' => ['first_name' => 'Target'],
        ]);
        $sourceContact = Contact::query()->create([
            'owner_id' => $source->id,
            'uid' => 'source-contact-uid',
            'full_name' => 'Source Contact',
            'payload' => ['first_name' => 'Source'],
        ]);

        ResourceShare::query()->create([
            'resource_type' => 'calendar',
            'resource_id' => $sourceCalendar->id,
            'owner_id' => $source->id,
            'shared_with_id' => $sharedWith->id,
            'permission' => 'read_only',
        ]);
        ResourceShare::query()->create([
            'resource_type' => 'calendar',
            'resource_id' => $sourceCalendar->id,
            'owner_id' => $source->id,
            'shared_with_id' => $target->id,
            'permission' => 'read_only',
        ]);

        $response = $this->actingAs($admin)
            ->deleteJson('/api/admin/users/'.$source->id, [
                'confirmation_email' => strtoupper($admin->email),
                'transfer_owner_id' => $target->id,
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('deleted_user_id', $source->id)
            ->assertJsonPath('transferred_to_user_id', $target->id);

        $response->assertJsonPath('transferred.calendars', 2);
        $response->assertJsonPath('transferred.address_books', 2);
        $response->assertJsonPath('transferred.contacts', 1);

        $this->assertDatabaseMissing('users', ['id' => $source->id]);
        $this->assertDatabaseHas('calendars', ['id' => $sourceCalendar->id, 'owner_id' => $target->id]);
        $this->assertDatabaseHas('address_books', ['id' => $sourceAddressBook->id, 'owner_id' => $target->id]);
        $this->assertDatabaseHas('contacts', ['id' => $sourceContact->id, 'owner_id' => $target->id]);
        $this->assertDatabaseHas('contacts', ['id' => $targetContact->id, 'uid' => 'target-contact-uid']);

        $this->assertSame(
            1,
            Calendar::query()
                ->where('owner_id', $target->id)
                ->where('is_default', true)
                ->count(),
        );
        $this->assertSame(
            1,
            AddressBook::query()
                ->where('owner_id', $target->id)
                ->where('is_default', true)
                ->count(),
        );

        $this->assertDatabaseHas('resource_shares', [
            'resource_type' => 'calendar',
            'resource_id' => $sourceCalendar->id,
            'owner_id' => $target->id,
            'shared_with_id' => $sharedWith->id,
        ]);
        $this->assertDatabaseMissing('resource_shares', [
            'resource_type' => 'calendar',
            'resource_id' => $sourceCalendar->id,
            'shared_with_id' => $target->id,
        ]);
    }

    public function test_deleting_user_requires_typed_email_confirmation_from_current_admin(): void
    {
        $admin = User::factory()->admin()->create();
        $doomed = User::factory()->create();

        $this->actingAs($admin)
            ->deleteJson('/api/admin/users/'.$doomed->id, [
                'confirmation_email' => 'wrong@example.com',
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Type your account email to confirm this deletion.');

        $this->assertDatabaseHas('users', ['id' => $doomed->id]);
    }

    public function test_transfer_delete_rejects_contact_uid_conflicts_between_source_and_target(): void
    {
        $admin = User::factory()->admin()->create();
        $source = User::factory()->create();
        $target = User::factory()->create();

        Contact::query()->create([
            'owner_id' => $source->id,
            'uid' => 'conflict-uid',
            'full_name' => 'Source Contact',
            'payload' => ['first_name' => 'Source'],
        ]);
        Contact::query()->create([
            'owner_id' => $target->id,
            'uid' => 'conflict-uid',
            'full_name' => 'Target Contact',
            'payload' => ['first_name' => 'Target'],
        ]);

        $this->actingAs($admin)
            ->deleteJson('/api/admin/users/'.$source->id, [
                'confirmation_email' => $admin->email,
                'transfer_owner_id' => $target->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath(
                'message',
                'Cannot transfer ownership because 1 contact UID conflict(s) exist between source and target owners.',
            );

        $this->assertDatabaseHas('users', ['id' => $source->id]);
        $this->assertDatabaseHas('contacts', ['owner_id' => $source->id, 'uid' => 'conflict-uid']);
    }

    public function test_deleting_user_rejects_transferring_ownership_to_the_same_account(): void
    {
        $admin = User::factory()->admin()->create();
        $doomed = User::factory()->create();

        $this->actingAs($admin)
            ->deleteJson('/api/admin/users/'.$doomed->id, [
                'confirmation_email' => $admin->email,
                'transfer_owner_id' => $doomed->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Select a different account for ownership transfer.');

        $this->assertDatabaseHas('users', ['id' => $doomed->id]);
    }

    public function test_admin_cannot_delete_own_account(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->deleteJson('/api/admin/users/'.$admin->id, [
                'confirmation_email' => $admin->email,
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'You cannot delete your own account.');

        $this->assertDatabaseHas('users', ['id' => $admin->id]);
    }

    public function test_admin_cannot_delete_last_admin_account(): void
    {
        $onlyAdmin = User::factory()->admin()->create();
        $actor = User::factory()->admin()->create();
        User::query()->whereKey($actor->id)->update(['role' => 'regular']);

        $this->actingAs($actor)
            ->deleteJson('/api/admin/users/'.$onlyAdmin->id, [
                'confirmation_email' => $actor->email,
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'You cannot delete the last admin account.');

        $this->assertDatabaseHas('users', ['id' => $onlyAdmin->id, 'role' => 'admin']);
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

    public function test_enabling_public_registration_defaults_approval_requirement_on_first_toggle(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this
            ->actingAs($admin)
            ->patchJson('/api/admin/settings/registration', [
                'enabled' => true,
            ]);

        $response->assertOk();
        $response->assertJsonPath('enabled', true);
        $response->assertJsonPath('require_approval', true);
    }

    public function test_admin_can_toggle_registration_approval_setting(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this
            ->actingAs($admin)
            ->patchJson('/api/admin/settings/registration-approval', [
                'enabled' => true,
            ]);

        $response->assertOk();
        $response->assertJsonPath('enabled', true);
    }

    public function test_approving_pending_user_marks_user_approved_and_provisions_defaults(): void
    {
        $admin = User::factory()->admin()->create();
        $pendingUser = User::factory()->create([
            'is_approved' => false,
            'approved_at' => null,
            'approved_by' => null,
        ]);

        $this->assertDatabaseMissing('calendars', ['owner_id' => $pendingUser->id, 'is_default' => true]);
        $this->assertDatabaseMissing('address_books', ['owner_id' => $pendingUser->id, 'is_default' => true]);

        $this->actingAs($admin)
            ->patchJson('/api/admin/users/'.$pendingUser->id.'/approve')
            ->assertOk()
            ->assertJsonPath('is_approved', true);

        $this->assertDatabaseHas('users', [
            'id' => $pendingUser->id,
            'is_approved' => true,
            'approved_by' => $admin->id,
        ]);
        $this->assertDatabaseHas('calendars', ['owner_id' => $pendingUser->id, 'is_default' => true]);
        $this->assertDatabaseHas('address_books', ['owner_id' => $pendingUser->id, 'is_default' => true]);
    }

    public function test_admin_can_bulk_approve_pending_users(): void
    {
        $admin = User::factory()->admin()->create();
        $firstPending = User::factory()->create([
            'is_approved' => false,
            'approved_at' => null,
            'approved_by' => null,
        ]);
        $secondPending = User::factory()->create([
            'is_approved' => false,
            'approved_at' => null,
            'approved_by' => null,
        ]);
        User::factory()->create([
            'is_approved' => true,
        ]);

        $this->actingAs($admin)
            ->patchJson('/api/admin/users/approve-pending')
            ->assertOk()
            ->assertJsonPath('approved_count', 2);

        foreach ([$firstPending, $secondPending] as $pendingUser) {
            $this->assertDatabaseHas('users', [
                'id' => $pendingUser->id,
                'is_approved' => true,
                'approved_by' => $admin->id,
            ]);
            $this->assertDatabaseHas('calendars', ['owner_id' => $pendingUser->id, 'is_default' => true]);
            $this->assertDatabaseHas('address_books', ['owner_id' => $pendingUser->id, 'is_default' => true]);
        }
    }

    public function test_regular_user_cannot_bulk_approve_pending_users(): void
    {
        $regular = User::factory()->create();

        $this->actingAs($regular)
            ->patchJson('/api/admin/users/approve-pending')
            ->assertForbidden();
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

    public function test_admin_can_toggle_contact_change_moderation_setting(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this
            ->actingAs($admin)
            ->patchJson('/api/admin/settings/contact-change-moderation', [
                'enabled' => true,
            ]);

        $response->assertOk();
        $response->assertJsonPath('enabled', true);
    }

    public function test_disabling_contact_change_moderation_requires_resolved_queue_requests(): void
    {
        $admin = User::factory()->admin()->create();
        $requester = User::factory()->create();

        ContactChangeRequest::query()->create([
            'group_uuid' => (string) Str::uuid(),
            'approval_owner_id' => $admin->id,
            'requester_id' => $requester->id,
            'contact_id' => null,
            'contact_uid' => null,
            'contact_display_name' => 'Pending Contact',
            'operation' => 'update',
            'status' => 'pending',
            'scope_address_book_ids' => [],
            'base_payload' => null,
            'base_address_book_ids' => null,
            'base_contact_updated_at' => null,
            'proposed_payload' => ['first_name' => 'Taylor'],
            'proposed_address_book_ids' => [],
            'request_fingerprint' => hash('sha256', 'pending-request'),
            'source' => 'web',
            'meta' => null,
        ]);

        $response = $this
            ->actingAs($admin)
            ->patchJson('/api/admin/settings/contact-change-moderation', [
                'enabled' => false,
            ]);

        $response->assertStatus(422);
        $response->assertJsonPath(
            'message',
            'Resolve or deny 1 unresolved review queue request(s) before disabling moderation.',
        );
    }

    public function test_admin_can_read_and_update_milestone_generation_years_setting(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->getJson('/api/admin/settings/milestone-generation-years')
            ->assertOk()
            ->assertJsonPath('years', 3);

        $this->actingAs($admin)
            ->patchJson('/api/admin/settings/milestone-generation-years', [
                'years' => 5,
            ])
            ->assertOk()
            ->assertJsonPath('years', 5);

        $this->assertDatabaseHas('app_settings', [
            'key' => 'milestone_calendar_generation_years',
            'value' => '5',
            'updated_by' => $admin->id,
        ]);
    }

    public function test_milestone_generation_years_setting_validates_range(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->patchJson('/api/admin/settings/milestone-generation-years', [
                'years' => 0,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['years']);

        $this->actingAs($admin)
            ->patchJson('/api/admin/settings/milestone-generation-years', [
                'years' => 26,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['years']);
    }

    public function test_updating_milestone_generation_years_resyncs_enabled_milestone_calendars(): void
    {
        app(RegistrationSettingsService::class)->setContactManagementEnabled(true);

        $admin = User::factory()->admin()->create();
        $owner = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Family',
            'uri' => 'family',
        ]);

        $this->actingAs($owner)
            ->postJson('/api/contacts', [
                'first_name' => 'Alex',
                'last_name' => 'Rivera',
                'company' => '',
                'exclude_milestone_calendars' => false,
                'birthday' => [
                    'year' => 1990,
                    'month' => 6,
                    'day' => 15,
                ],
                'dates' => [],
                'phones' => [],
                'emails' => [],
                'urls' => [],
                'addresses' => [],
                'related_names' => [],
                'instant_messages' => [],
                'address_book_ids' => [$addressBook->id],
            ])
            ->assertCreated();

        $enabled = $this->actingAs($owner)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
                'anniversaries_enabled' => false,
            ])
            ->assertOk();

        $birthdayCalendarId = (int) $enabled->json('milestone_calendars.birthdays.calendar_id');
        $this->assertCount(3, CalendarObject::query()->where('calendar_id', $birthdayCalendarId)->get());

        $this->actingAs($admin)
            ->patchJson('/api/admin/settings/milestone-generation-years', [
                'years' => 5,
            ])
            ->assertOk()
            ->assertJsonPath('years', 5);

        $this->assertCount(5, CalendarObject::query()->where('calendar_id', $birthdayCalendarId)->get());
    }

    public function test_admin_resources_reports_milestone_purge_unavailable_without_enabled_or_generated_settings(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->getJson('/api/admin/resources')
            ->assertOk()
            ->assertJsonPath('milestone_purge_visible', false)
            ->assertJsonPath('milestone_purge_available', false);
    }

    public function test_admin_resources_reports_milestone_purge_available_when_milestone_sync_is_enabled(): void
    {
        $admin = User::factory()->admin()->create();
        $owner = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
        ]);

        AddressBookContactMilestoneCalendar::query()->create([
            'address_book_id' => $addressBook->id,
            'milestone_type' => AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
            'enabled' => true,
            'calendar_id' => null,
            'custom_display_name' => null,
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/resources')
            ->assertOk()
            ->assertJsonPath('milestone_purge_visible', true)
            ->assertJsonPath('milestone_purge_available', true);
    }

    public function test_admin_resources_keeps_milestone_purge_visible_after_first_enable_even_when_unavailable(): void
    {
        $admin = User::factory()->admin()->create();

        AppSetting::query()->updateOrCreate(
            ['key' => 'milestone_purge_control_visible'],
            ['value' => 'true'],
        );

        $this->actingAs($admin)
            ->getJson('/api/admin/resources')
            ->assertOk()
            ->assertJsonPath('milestone_purge_visible', true)
            ->assertJsonPath('milestone_purge_available', false);
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

        $recipient = User::factory()->create();
        $birthdayShare = ResourceShare::query()->create([
            'resource_type' => 'calendar',
            'resource_id' => $birthdayCalendar->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => 'read_only',
        ]);
        $anniversaryShare = ResourceShare::query()->create([
            'resource_type' => 'calendar',
            'resource_id' => $anniversaryCalendar->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => 'read_only',
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
        $this->assertDatabaseMissing('resource_shares', ['id' => $birthdayShare->id]);
        $this->assertDatabaseMissing('resource_shares', ['id' => $anniversaryShare->id]);
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
