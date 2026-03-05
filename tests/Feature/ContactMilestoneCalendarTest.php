<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\AppSetting;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ContactMilestoneCalendarTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app(RegistrationSettingsService::class)->setContactManagementEnabled(true);
    }

    public function test_enabling_birthdays_and_anniversaries_creates_and_syncs_calendars(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'display_name' => 'Family',
            'uri' => 'family',
        ]);

        $this->actingAs($user)
            ->postJson('/api/contacts', $this->contactPayload([
                'address_book_ids' => [$addressBook->id],
                'dates' => [
                    [
                        'label' => 'anniversary',
                        'custom_label' => null,
                        'year' => 2015,
                        'month' => 9,
                        'day' => 12,
                    ],
                    [
                        'label' => 'custom',
                        'custom_label' => 'work anniversary',
                        'year' => 2020,
                        'month' => 5,
                        'day' => 4,
                    ],
                ],
            ]))
            ->assertCreated();

        $response = $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
                'anniversaries_enabled' => true,
            ])
            ->assertOk();

        $birthdayCalendarId = (int) $response->json('milestone_calendars.birthdays.calendar_id');
        $anniversaryCalendarId = (int) $response->json('milestone_calendars.anniversaries.calendar_id');

        $this->assertGreaterThan(0, $birthdayCalendarId);
        $this->assertGreaterThan(0, $anniversaryCalendarId);

        $this->assertDatabaseHas('calendars', [
            'id' => $birthdayCalendarId,
            'display_name' => 'Family Birthdays',
        ]);
        $this->assertDatabaseHas('calendars', [
            'id' => $anniversaryCalendarId,
            'display_name' => 'Family Anniversaries',
        ]);

        $birthdayObject = CalendarObject::query()
            ->where('calendar_id', $birthdayCalendarId)
            ->first();
        $anniversaryObjects = CalendarObject::query()
            ->where('calendar_id', $anniversaryCalendarId)
            ->get();

        $this->assertNotNull($birthdayObject);
        $this->assertCount(1, $anniversaryObjects);
        $this->assertStringContainsString('X-DAVVY-MILESTONE-TYPE:BIRTHDAY', $birthdayObject->data);
        $this->assertStringContainsString('SUMMARY:Alex Rivera\'s Birthday', $birthdayObject->data);
        $this->assertStringContainsString('X-DAVVY-MILESTONE-TYPE:ANNIVERSARY', $anniversaryObjects->first()->data);
        $this->assertStringContainsString('SUMMARY:Alex Rivera Anniversary', $anniversaryObjects->first()->data);
    }

    public function test_contacts_marked_to_exclude_milestones_are_skipped_from_generated_events(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'display_name' => 'Family',
            'uri' => 'family',
        ]);

        $this->actingAs($user)
            ->postJson('/api/contacts', $this->contactPayload([
                'first_name' => 'Alex',
                'last_name' => 'Rivera',
                'exclude_milestone_calendars' => false,
                'address_book_ids' => [$addressBook->id],
            ]))
            ->assertCreated();

        $this->actingAs($user)
            ->postJson('/api/contacts', $this->contactPayload([
                'first_name' => 'Sam',
                'last_name' => 'Taylor',
                'exclude_milestone_calendars' => true,
                'birthday' => [
                    'year' => 1988,
                    'month' => 5,
                    'day' => 20,
                ],
                'dates' => [
                    [
                        'label' => 'anniversary',
                        'custom_label' => null,
                        'year' => 2012,
                        'month' => 8,
                        'day' => 4,
                    ],
                ],
                'address_book_ids' => [$addressBook->id],
            ]))
            ->assertCreated();

        $response = $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
                'anniversaries_enabled' => true,
            ])
            ->assertOk();

        $birthdayCalendarId = (int) $response->json('milestone_calendars.birthdays.calendar_id');
        $anniversaryCalendarId = (int) $response->json('milestone_calendars.anniversaries.calendar_id');

        $birthdayObjects = CalendarObject::query()
            ->where('calendar_id', $birthdayCalendarId)
            ->get();
        $anniversaryObjects = CalendarObject::query()
            ->where('calendar_id', $anniversaryCalendarId)
            ->get();

        $this->assertCount(1, $birthdayObjects);
        $this->assertCount(1, $anniversaryObjects);
        $this->assertStringContainsString('SUMMARY:Alex Rivera\'s Birthday', $birthdayObjects->first()->data);
        $this->assertStringNotContainsString('Sam Taylor', $birthdayObjects->first()->data);
        $this->assertStringContainsString('SUMMARY:Alex Rivera Anniversary', $anniversaryObjects->first()->data);
        $this->assertStringNotContainsString('Sam Taylor', $anniversaryObjects->first()->data);
    }

    public function test_disabling_birthdays_stops_future_sync_updates(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'display_name' => 'Friends',
            'uri' => 'friends',
        ]);

        $created = $this->actingAs($user)
            ->postJson('/api/contacts', $this->contactPayload([
                'address_book_ids' => [$addressBook->id],
                'birthday' => [
                    'year' => 1990,
                    'month' => 6,
                    'day' => 15,
                ],
                'dates' => [],
            ]))
            ->assertCreated();

        $contactId = (int) $created->json('id');

        $enabled = $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
                'anniversaries_enabled' => false,
            ])
            ->assertOk();

        $birthdayCalendarId = (int) $enabled->json('milestone_calendars.birthdays.calendar_id');
        $birthdayObject = CalendarObject::query()
            ->where('calendar_id', $birthdayCalendarId)
            ->firstOrFail();

        $etagBeforeDisable = (string) $birthdayObject->etag;
        $dataBeforeDisable = (string) $birthdayObject->data;

        $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => false,
            ])
            ->assertOk();

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$contactId, [
                'first_name' => 'Alex',
                'last_name' => 'Rivera',
                'birthday' => [
                    'year' => 1990,
                    'month' => 8,
                    'day' => 22,
                ],
                'dates' => [],
                'address_book_ids' => [$addressBook->id],
            ])
            ->assertOk();

        $birthdayObject->refresh();

        $this->assertSame($etagBeforeDisable, $birthdayObject->etag);
        $this->assertSame($dataBeforeDisable, $birthdayObject->data);
    }

    public function test_default_names_follow_address_book_rename_and_custom_override_is_preserved(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'display_name' => 'Family',
            'uri' => 'family',
        ]);

        $response = $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
                'anniversaries_enabled' => true,
                'anniversary_calendar_name' => 'Marriage Milestones',
            ])
            ->assertOk();

        $birthdayCalendar = Calendar::query()->findOrFail(
            (int) $response->json('milestone_calendars.birthdays.calendar_id'),
        );
        $anniversaryCalendar = Calendar::query()->findOrFail(
            (int) $response->json('milestone_calendars.anniversaries.calendar_id'),
        );

        $this->assertSame('Family Birthdays', $birthdayCalendar->display_name);
        $this->assertSame('Marriage Milestones', $anniversaryCalendar->display_name);

        $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id, [
                'display_name' => 'Household',
            ])
            ->assertOk();

        $birthdayCalendar->refresh();
        $anniversaryCalendar->refresh();

        $this->assertSame('Household Birthdays', $birthdayCalendar->display_name);
        $this->assertSame('Marriage Milestones', $anniversaryCalendar->display_name);
    }

    public function test_enabling_milestones_marks_admin_purge_control_as_visible(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
        ]);

        $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
            ])
            ->assertOk();

        $this->assertDatabaseHas('app_settings', [
            'key' => 'milestone_purge_control_visible',
            'value' => 'true',
            'updated_by' => $user->id,
        ]);
        $this->assertTrue(AppSetting::milestonePurgeControlVisible());
    }

    public function test_non_owner_cannot_update_milestone_calendar_settings(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();

        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
        ]);

        $this->actingAs($intruder)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
            ])
            ->assertForbidden();
    }

    public function test_dashboard_still_loads_when_milestone_schema_is_missing(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'display_name' => 'Family',
        ]);

        Schema::dropIfExists('address_book_contact_milestone_calendars');

        $response = $this->actingAs($user)
            ->getJson('/api/dashboard')
            ->assertOk();

        $response->assertJsonFragment([
            'id' => $addressBook->id,
            'display_name' => 'Family',
        ]);
    }

    public function test_updating_milestones_returns_422_when_schema_is_missing(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
        ]);

        Schema::dropIfExists('address_book_contact_milestone_calendars');

        $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
            ])
            ->assertStatus(422)
            ->assertJsonPath(
                'message',
                'Milestone calendar schema is not available. Run migrations before enabling milestone calendars.',
            );
    }

    /**
     * @return array<string, mixed>
     */
    private function contactPayload(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'company' => '',
            'exclude_milestone_calendars' => false,
            'birthday' => [
                'year' => 1990,
                'month' => 6,
                'day' => 15,
            ],
            'dates' => [
                [
                    'label' => 'anniversary',
                    'custom_label' => null,
                    'year' => 2015,
                    'month' => 9,
                    'day' => 12,
                ],
            ],
            'phones' => [],
            'emails' => [],
            'urls' => [],
            'addresses' => [],
            'related_names' => [],
            'instant_messages' => [],
            'address_book_ids' => [],
        ], $overrides);
    }
}
