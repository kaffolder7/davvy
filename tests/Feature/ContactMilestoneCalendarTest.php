<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\AppSetting;
use App\Models\Card;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Support\Carbon;
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
        $this->travelTo(Carbon::create(2026, 1, 15, 12, 0, 0, 'UTC'));

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

        $birthdayObjects = CalendarObject::query()
            ->where('calendar_id', $birthdayCalendarId)
            ->get();
        $anniversaryObjects = CalendarObject::query()
            ->where('calendar_id', $anniversaryCalendarId)
            ->get();

        $this->assertCount(3, $birthdayObjects);
        $this->assertCount(3, $anniversaryObjects);

        $birthdayData = $birthdayObjects->pluck('data')->implode("\n");
        $anniversaryData = $anniversaryObjects->pluck('data')->implode("\n");

        $this->assertStringContainsString('X-DAVVY-MILESTONE-TYPE:BIRTHDAY', $birthdayData);
        $this->assertStringContainsString('SUMMARY:🎂 Alex Rivera\'s 36th Birthday', $birthdayData);
        $this->assertStringContainsString('X-DAVVY-MILESTONE-TYPE:ANNIVERSARY', $anniversaryData);
        $this->assertStringContainsString('SUMMARY:💍 Alex Rivera\'s 11th Anniversary', $anniversaryData);
    }

    public function test_enabling_milestones_backfills_legacy_cards_and_parses_apple_anniversary_labels(): void
    {
        $this->travelTo(Carbon::create(2026, 1, 15, 12, 0, 0, 'UTC'));

        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'display_name' => 'Family',
            'uri' => 'family',
        ]);

        $uid = '7CA82058-5B9F-477B-AB0F-1F24DBEF89CF';
        $cardData = implode("\r\n", [
            'BEGIN:VCARD',
            'VERSION:3.0',
            'FN:Rowan Hargrove',
            'N:Hargrove;Collin;;;',
            'ORG:First Bank of Berne;Business Banking',
            'BDAY:1995-11-07',
            'ITEM1.X-ABDATE:2018-09-23',
            'ITEM1.X-ABLABEL:_$!<Anniversary>!$_',
            'UID:'.$uid,
            'END:VCARD',
            '',
        ]);

        $card = Card::query()->create([
            'address_book_id' => $addressBook->id,
            'uri' => $uid.'.vcf',
            'uid' => $uid,
            'etag' => md5($cardData),
            'size' => strlen($cardData),
            'data' => $cardData,
        ]);

        $response = $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
                'anniversaries_enabled' => true,
            ])
            ->assertOk();

        $birthdayCalendarId = (int) $response->json('milestone_calendars.birthdays.calendar_id');
        $anniversaryCalendarId = (int) $response->json('milestone_calendars.anniversaries.calendar_id');

        $this->assertDatabaseHas('contacts', [
            'owner_id' => $user->id,
            'uid' => $uid,
            'full_name' => 'Rowan Hargrove',
        ]);
        $this->assertDatabaseHas('contact_address_book_assignments', [
            'address_book_id' => $addressBook->id,
            'card_id' => $card->id,
            'card_uri' => $card->uri,
        ]);

        $birthdayData = CalendarObject::query()
            ->where('calendar_id', $birthdayCalendarId)
            ->get()
            ->pluck('data')
            ->implode("\n");
        $anniversaryData = CalendarObject::query()
            ->where('calendar_id', $anniversaryCalendarId)
            ->get()
            ->pluck('data')
            ->implode("\n");

        $this->assertSame(3, substr_count($birthdayData, 'BEGIN:VEVENT'));
        $this->assertSame(3, substr_count($anniversaryData, 'BEGIN:VEVENT'));
        $this->assertStringContainsString('SUMMARY:🎂 Rowan Hargrove\'s 31st Birthday', $birthdayData);
        $this->assertStringContainsString('SUMMARY:💍 Rowan Hargrove\'s 8th Anniversary', $anniversaryData);
    }

    public function test_contacts_marked_to_exclude_milestones_are_skipped_from_generated_events(): void
    {
        $this->travelTo(Carbon::create(2026, 1, 15, 12, 0, 0, 'UTC'));

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

        $this->assertCount(3, $birthdayObjects);
        $this->assertCount(3, $anniversaryObjects);
        $birthdayData = $birthdayObjects->pluck('data')->implode("\n");
        $anniversaryData = $anniversaryObjects->pluck('data')->implode("\n");
        $this->assertStringContainsString('SUMMARY:🎂 Alex Rivera\'s 36th Birthday', $birthdayData);
        $this->assertStringNotContainsString('Sam Taylor', $birthdayData);
        $this->assertStringContainsString('SUMMARY:💍 Alex Rivera\'s 11th Anniversary', $anniversaryData);
        $this->assertStringNotContainsString('Sam Taylor', $anniversaryData);
    }

    public function test_milestone_titles_omit_ordinal_when_source_year_is_missing(): void
    {
        $this->travelTo(Carbon::create(2026, 1, 15, 12, 0, 0, 'UTC'));

        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'display_name' => 'Family',
            'uri' => 'family',
        ]);

        $this->actingAs($user)
            ->postJson('/api/contacts', $this->contactPayload([
                'birthday' => [
                    'year' => null,
                    'month' => 6,
                    'day' => 15,
                ],
                'dates' => [
                    [
                        'label' => 'anniversary',
                        'custom_label' => null,
                        'year' => null,
                        'month' => 9,
                        'day' => 12,
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

        $birthdayData = CalendarObject::query()
            ->where('calendar_id', $birthdayCalendarId)
            ->get()
            ->pluck('data')
            ->implode("\n");
        $anniversaryData = CalendarObject::query()
            ->where('calendar_id', $anniversaryCalendarId)
            ->get()
            ->pluck('data')
            ->implode("\n");

        $this->assertSame(3, substr_count($birthdayData, 'BEGIN:VEVENT'));
        $this->assertSame(3, substr_count($anniversaryData, 'BEGIN:VEVENT'));
        $this->assertStringContainsString('SUMMARY:🎂 Alex Rivera\'s Birthday', $birthdayData);
        $this->assertStringContainsString('SUMMARY:💍 Alex Rivera\'s Anniversary', $anniversaryData);
        $this->assertSame(0, preg_match("/SUMMARY:🎂 Alex Rivera's \\d+(?:st|nd|rd|th) Birthday/u", $birthdayData));
        $this->assertSame(0, preg_match("/SUMMARY:💍 Alex Rivera's \\d+(?:st|nd|rd|th) Anniversary/u", $anniversaryData));
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
        $birthdayObjects = CalendarObject::query()
            ->where('calendar_id', $birthdayCalendarId)
            ->orderBy('uri')
            ->get();

        $this->assertCount(3, $birthdayObjects);
        $etagBeforeDisable = $birthdayObjects
            ->mapWithKeys(fn (CalendarObject $object): array => [$object->uri => (string) $object->etag])
            ->all();
        $dataBeforeDisable = $birthdayObjects
            ->mapWithKeys(fn (CalendarObject $object): array => [$object->uri => (string) $object->data])
            ->all();

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

        $birthdayObjectsAfterDisable = CalendarObject::query()
            ->where('calendar_id', $birthdayCalendarId)
            ->orderBy('uri')
            ->get();

        $this->assertCount(3, $birthdayObjectsAfterDisable);
        $etagAfterDisable = $birthdayObjectsAfterDisable
            ->mapWithKeys(fn (CalendarObject $object): array => [$object->uri => (string) $object->etag])
            ->all();
        $dataAfterDisable = $birthdayObjectsAfterDisable
            ->mapWithKeys(fn (CalendarObject $object): array => [$object->uri => (string) $object->data])
            ->all();

        $this->assertSame($etagBeforeDisable, $etagAfterDisable);
        $this->assertSame($dataBeforeDisable, $dataAfterDisable);
    }

    public function test_milestone_generation_years_setting_controls_event_count(): void
    {
        $this->travelTo(Carbon::create(2026, 1, 15, 12, 0, 0, 'UTC'));
        AppSetting::query()->updateOrCreate(
            ['key' => 'milestone_calendar_generation_years'],
            ['value' => '5'],
        );

        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'display_name' => 'Family',
            'uri' => 'family',
        ]);

        $this->actingAs($user)
            ->postJson('/api/contacts', $this->contactPayload([
                'address_book_ids' => [$addressBook->id],
            ]))
            ->assertCreated();

        $response = $this->actingAs($user)
            ->patchJson('/api/address-books/'.$addressBook->id.'/milestone-calendars', [
                'birthdays_enabled' => true,
                'anniversaries_enabled' => false,
            ])
            ->assertOk();

        $birthdayCalendarId = (int) $response->json('milestone_calendars.birthdays.calendar_id');
        $birthdayObjects = CalendarObject::query()
            ->where('calendar_id', $birthdayCalendarId)
            ->get();

        $this->assertCount(5, $birthdayObjects);
        $this->assertStringContainsString(
            'SUMMARY:🎂 Alex Rivera\'s 40th Birthday',
            $birthdayObjects->pluck('data')->implode("\n"),
        );
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
