<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\User;
use App\Services\Dav\Backends\LaravelCalendarBackend;
use App\Services\Dav\Backends\LaravelCardDavBackend;
use App\Services\DavRequestContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
            "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:sync-event-1\nDTSTART:20260227T120000Z\nDTEND:20260227T130000Z\nSUMMARY:Sync Added\nEND:VEVENT\nEND:VCALENDAR"
        );

        $backend->updateCalendarObject(
            $calendar->id,
            'event-sync.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:sync-event-1\nDTSTART:20260227T120000Z\nDTEND:20260227T140000Z\nSUMMARY:Sync Updated\nEND:VEVENT\nEND:VCALENDAR"
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
}
