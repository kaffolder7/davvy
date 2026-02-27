<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\Card;
use App\Models\User;
use App\Services\Dav\Backends\LaravelCalendarBackend;
use App\Services\Dav\Backends\LaravelCardDavBackend;
use App\Services\DavRequestContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Sabre\DAV\Exception\BadRequest;
use Tests\TestCase;

class DavPayloadValidationAndSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_invalid_ical_payload_is_rejected(): void
    {
        $owner = User::factory()->create();
        $calendar = Calendar::factory()->create(['owner_id' => $owner->id]);

        app(DavRequestContext::class)->setAuthenticatedUser($owner);

        $this->expectException(BadRequest::class);

        app(LaravelCalendarBackend::class)->createCalendarObject(
            $calendar->id,
            'invalid.ics',
            'INVALID PAYLOAD'
        );
    }

    public function test_invalid_vcard_payload_is_rejected(): void
    {
        $owner = User::factory()->create();
        $addressBook = AddressBook::factory()->create(['owner_id' => $owner->id]);

        app(DavRequestContext::class)->setAuthenticatedUser($owner);

        $this->expectException(BadRequest::class);

        app(LaravelCardDavBackend::class)->createCard(
            $addressBook->id,
            'invalid.vcf',
            "BEGIN:VCARD\nVERSION:4.0\nEND:VCARD"
        );
    }

    public function test_calendar_sync_reports_added_modified_and_deleted_objects(): void
    {
        $owner = User::factory()->create();
        $calendar = Calendar::factory()->create(['owner_id' => $owner->id]);

        app(DavRequestContext::class)->setAuthenticatedUser($owner);

        $backend = app(LaravelCalendarBackend::class);

        $backend->createCalendarObject(
            $calendar->id,
            'event-sync.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Tests//EN\nBEGIN:VEVENT\nUID:sync-event-1\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T120000Z\nDTEND:20260227T130000Z\nSUMMARY:Sync Added\nEND:VEVENT\nEND:VCALENDAR"
        );

        $backend->updateCalendarObject(
            $calendar->id,
            'event-sync.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Tests//EN\nBEGIN:VEVENT\nUID:sync-event-1\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T120000Z\nDTEND:20260227T140000Z\nSUMMARY:Sync Updated\nEND:VEVENT\nEND:VCALENDAR"
        );

        $backend->deleteCalendarObject($calendar->id, 'event-sync.ics');

        $changes = $backend->getChangesForCalendar($calendar->id, '0', 1);

        $this->assertContains('event-sync.ics', $changes['added']);
        $this->assertContains('event-sync.ics', $changes['modified']);
        $this->assertContains('event-sync.ics', $changes['deleted']);
    }

    public function test_address_book_sync_reports_added_modified_and_deleted_cards(): void
    {
        $owner = User::factory()->create();
        $addressBook = AddressBook::factory()->create(['owner_id' => $owner->id]);

        app(DavRequestContext::class)->setAuthenticatedUser($owner);

        $backend = app(LaravelCardDavBackend::class);

        $backend->createCard(
            $addressBook->id,
            'card-sync.vcf',
            "BEGIN:VCARD\nVERSION:4.0\nFN:Jane Sync\nUID:card-sync-1\nEMAIL:jane@example.com\nEND:VCARD"
        );

        $backend->updateCard(
            $addressBook->id,
            'card-sync.vcf',
            "BEGIN:VCARD\nVERSION:4.0\nFN:Jane Sync Updated\nUID:card-sync-1\nEMAIL:jane@example.com\nEND:VCARD"
        );

        $backend->deleteCard($addressBook->id, 'card-sync.vcf');

        $changes = $backend->getChangesForAddressBook($addressBook->id, '0', 1);

        $this->assertContains('card-sync.vcf', $changes['added']);
        $this->assertContains('card-sync.vcf', $changes['modified']);
        $this->assertContains('card-sync.vcf', $changes['deleted']);
    }

    public function test_initial_calendar_sync_includes_existing_objects(): void
    {
        $owner = User::factory()->create();
        $calendar = Calendar::factory()->create(['owner_id' => $owner->id]);

        CalendarObject::query()->create([
            'calendar_id' => $calendar->id,
            'uri' => 'existing-event.ics',
            'uid' => 'existing-event-uid',
            'etag' => md5('existing-event'),
            'size' => 1,
            'component_type' => 'VEVENT',
            'first_occurred_at' => now(),
            'last_occurred_at' => now(),
            'data' => "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Tests//EN\nBEGIN:VEVENT\nUID:existing-event-uid\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T120000Z\nDTEND:20260227T130000Z\nSUMMARY:Existing Event\nEND:VEVENT\nEND:VCALENDAR",
        ]);

        app(DavRequestContext::class)->setAuthenticatedUser($owner);

        $backend = app(LaravelCalendarBackend::class);

        $changes = $backend->getChangesForCalendar($calendar->id, null, 1);

        $this->assertContains('existing-event.ics', $changes['added']);
        $this->assertSame([], $changes['modified']);
        $this->assertSame([], $changes['deleted']);
    }

    public function test_initial_address_book_sync_includes_existing_cards(): void
    {
        $owner = User::factory()->create();
        $addressBook = AddressBook::factory()->create(['owner_id' => $owner->id]);

        Card::query()->create([
            'address_book_id' => $addressBook->id,
            'uri' => 'existing-contact.vcf',
            'uid' => 'existing-contact-uid',
            'etag' => md5('existing-contact'),
            'size' => 1,
            'data' => "BEGIN:VCARD\nVERSION:4.0\nFN:Existing Contact\nUID:existing-contact-uid\nEMAIL:existing@example.com\nEND:VCARD",
        ]);

        app(DavRequestContext::class)->setAuthenticatedUser($owner);

        $backend = app(LaravelCardDavBackend::class);

        $changes = $backend->getChangesForAddressBook($addressBook->id, null, 1);

        $this->assertContains('existing-contact.vcf', $changes['added']);
        $this->assertSame([], $changes['modified']);
        $this->assertSame([], $changes['deleted']);
    }

    public function test_address_book_listing_exposes_sync_metadata_properties(): void
    {
        $owner = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'uri' => 'team-contacts',
        ]);

        $collections = app(LaravelCardDavBackend::class)->getAddressBooksForUser('principals/'.$owner->id);
        $collection = collect($collections)->first(fn (array $item): bool => $item['id'] === $addressBook->id);

        $this->assertNotNull($collection);
        $this->assertArrayHasKey('{http://sabredav.org/ns}sync-token', $collection);
        $this->assertArrayHasKey('{http://calendarserver.org/ns/}getctag', $collection);
        $this->assertNotSame('0', $collection['{http://sabredav.org/ns}sync-token']);
        $this->assertNotSame('0', $collection['{http://calendarserver.org/ns/}getctag']);
    }

    public function test_calendar_listing_exposes_sync_metadata_properties(): void
    {
        $owner = User::factory()->create();
        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'uri' => 'team-calendar',
        ]);

        $collections = app(LaravelCalendarBackend::class)->getCalendarsForUser('principals/'.$owner->id);
        $collection = collect($collections)->first(fn (array $item): bool => $item['id'] === $calendar->id);

        $this->assertNotNull($collection);
        $this->assertArrayHasKey('{http://sabredav.org/ns}sync-token', $collection);
        $this->assertArrayHasKey('{http://calendarserver.org/ns/}getctag', $collection);
        $this->assertNotSame('0', $collection['{http://sabredav.org/ns}sync-token']);
        $this->assertNotSame('0', $collection['{http://calendarserver.org/ns/}getctag']);
    }

    public function test_collection_listing_upgrades_zero_sync_tokens(): void
    {
        $owner = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
        ]);

        DB::table('dav_resource_sync_states')
            ->where('resource_type', 'address_book')
            ->where('resource_id', $addressBook->id)
            ->update(['sync_token' => 0]);

        $collections = app(LaravelCardDavBackend::class)->getAddressBooksForUser('principals/'.$owner->id);
        $collection = collect($collections)->first(fn (array $item): bool => $item['id'] === $addressBook->id);

        $this->assertNotNull($collection);
        $this->assertNotSame('0', $collection['{http://sabredav.org/ns}sync-token']);
        $this->assertSame(
            1,
            (int) DB::table('dav_resource_sync_states')
                ->where('resource_type', 'address_book')
                ->where('resource_id', $addressBook->id)
                ->value('sync_token')
        );
    }

    public function test_carddav_addressbook_query_report_returns_existing_cards(): void
    {
        $user = User::factory()->create([
            'email' => 'report-test@example.test',
            'password' => Hash::make('password1234'),
        ]);

        $addressBook = AddressBook::query()
            ->where('owner_id', $user->id)
            ->where('uri', 'contacts')
            ->firstOrFail();

        Card::query()->create([
            'address_book_id' => $addressBook->id,
            'uri' => 'existing-contact.vcf',
            'uid' => 'existing-contact-uid',
            'etag' => md5('existing-contact'),
            'size' => 1,
            'data' => "BEGIN:VCARD\nVERSION:3.0\nFN:Existing Contact\nUID:existing-contact-uid\nEMAIL:existing@example.com\nEND:VCARD",
        ]);

        $response = $this->call(
            method: 'REPORT',
            uri: '/dav/addressbooks/'.$user->id.'/contacts',
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':password1234'),
                'HTTP_DEPTH' => '1',
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
            ],
            content: '<?xml version="1.0" encoding="utf-8"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><card:address-data/></d:prop><card:filter><card:prop-filter name="FN"/></card:filter></card:addressbook-query>',
        );

        $response->assertStatus(207);
        $this->assertStringContainsString('existing-contact.vcf', (string) $response->getContent());
    }
}
