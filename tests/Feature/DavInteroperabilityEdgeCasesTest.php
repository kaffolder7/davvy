<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\User;
use App\Services\Dav\Backends\LaravelCalendarBackend;
use App\Services\Dav\Backends\LaravelCardDavBackend;
use App\Services\DavRequestContext;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Sabre\DAV\Exception\BadRequest;
use Sabre\DAV\Exception\Conflict;
use Sabre\DAV\Exception\InvalidSyncToken;
use Tests\TestCase;

class DavInteroperabilityEdgeCasesTest extends TestCase
{
    use RefreshDatabase;

    public function test_calendar_resource_with_mixed_uids_is_rejected(): void
    {
        [$backend, $calendar] = $this->calendarBackendForOwner();

        $this->expectException(BadRequest::class);

        $backend->createCalendarObject(
            $calendar->id,
            'mixed-uids.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Interop//EN\nBEGIN:VEVENT\nUID:uid-one\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T100000Z\nSUMMARY:One\nEND:VEVENT\nBEGIN:VEVENT\nUID:uid-two\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T110000Z\nSUMMARY:Two\nEND:VEVENT\nEND:VCALENDAR"
        );
    }

    public function test_rrule_with_count_and_until_is_rejected(): void
    {
        [$backend, $calendar] = $this->calendarBackendForOwner();

        $this->expectException(BadRequest::class);

        $backend->createCalendarObject(
            $calendar->id,
            'invalid-rrule.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Interop//EN\nBEGIN:VEVENT\nUID:rrule-conflict\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T100000Z\nRRULE:FREQ=DAILY;COUNT=5;UNTIL=20260301T100000Z\nSUMMARY:Invalid Recurrence\nEND:VEVENT\nEND:VCALENDAR"
        );
    }

    public function test_detached_recurrence_without_master_is_rejected(): void
    {
        [$backend, $calendar] = $this->calendarBackendForOwner();

        $this->expectException(BadRequest::class);

        $backend->createCalendarObject(
            $calendar->id,
            'detached-only.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Interop//EN\nBEGIN:VEVENT\nUID:recurrence-edge\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T100000Z\nRECURRENCE-ID:20260228T100000Z\nSUMMARY:Detached\nEND:VEVENT\nEND:VCALENDAR"
        );
    }

    public function test_calendar_uid_conflicts_are_rejected_on_create_and_update(): void
    {
        [$backend, $calendar] = $this->calendarBackendForOwner();

        $backend->createCalendarObject(
            $calendar->id,
            'base.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Interop//EN\nBEGIN:VEVENT\nUID:shared-uid\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T100000Z\nSUMMARY:Original\nEND:VEVENT\nEND:VCALENDAR"
        );

        try {
            $backend->createCalendarObject(
                $calendar->id,
                'conflict-create.ics',
                "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Interop//EN\nBEGIN:VEVENT\nUID:shared-uid\nDTSTAMP:20260227T090000Z\nDTSTART:20260228T100000Z\nSUMMARY:Conflict\nEND:VEVENT\nEND:VCALENDAR"
            );

            $this->fail('Expected create conflict for duplicate UID.');
        } catch (Conflict) {
            $this->assertTrue(true);
        }

        $backend->createCalendarObject(
            $calendar->id,
            'safe-update.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Interop//EN\nBEGIN:VEVENT\nUID:unique-uid\nDTSTAMP:20260227T090000Z\nDTSTART:20260229T100000Z\nSUMMARY:Safe\nEND:VEVENT\nEND:VCALENDAR"
        );

        $this->expectException(Conflict::class);

        $backend->updateCalendarObject(
            $calendar->id,
            'safe-update.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Interop//EN\nBEGIN:VEVENT\nUID:shared-uid\nDTSTAMP:20260227T090000Z\nDTSTART:20260229T100000Z\nSUMMARY:Now conflicting\nEND:VEVENT\nEND:VCALENDAR"
        );
    }

    public function test_vcard_uid_and_email_requirements_are_enforced(): void
    {
        [$backend, $addressBook] = $this->cardBackendForOwner();

        try {
            $backend->createCard(
                $addressBook->id,
                'missing-uid.vcf',
                "BEGIN:VCARD\nVERSION:4.0\nFN:Missing UID\nEMAIL:valid@example.com\nEND:VCARD"
            );

            $this->fail('Expected bad request for vCard without UID.');
        } catch (BadRequest) {
            $this->assertTrue(true);
        }

        $this->expectException(BadRequest::class);

        $backend->createCard(
            $addressBook->id,
            'invalid-email.vcf',
            "BEGIN:VCARD\nVERSION:4.0\nFN:Invalid Email\nUID:invalid-email\nEMAIL:not-an-email\nEND:VCARD"
        );
    }

    public function test_card_uid_conflicts_are_rejected_on_create_and_update(): void
    {
        [$backend, $addressBook] = $this->cardBackendForOwner();

        $backend->createCard(
            $addressBook->id,
            'base.vcf',
            "BEGIN:VCARD\nVERSION:4.0\nFN:Base Contact\nUID:shared-contact-uid\nEMAIL:base@example.com\nEND:VCARD"
        );

        try {
            $backend->createCard(
                $addressBook->id,
                'conflict-create.vcf',
                "BEGIN:VCARD\nVERSION:4.0\nFN:Conflict Contact\nUID:shared-contact-uid\nEMAIL:conflict@example.com\nEND:VCARD"
            );

            $this->fail('Expected create conflict for duplicate contact UID.');
        } catch (Conflict) {
            $this->assertTrue(true);
        }

        $backend->createCard(
            $addressBook->id,
            'safe-update.vcf',
            "BEGIN:VCARD\nVERSION:4.0\nFN:Safe Contact\nUID:unique-contact-uid\nEMAIL:safe@example.com\nEND:VCARD"
        );

        $this->expectException(Conflict::class);

        $backend->updateCard(
            $addressBook->id,
            'safe-update.vcf',
            "BEGIN:VCARD\nVERSION:4.0\nFN:Now conflicting\nUID:shared-contact-uid\nEMAIL:safe@example.com\nEND:VCARD"
        );
    }

    public function test_invalid_sync_tokens_are_rejected(): void
    {
        [$backend, $calendar] = $this->calendarBackendForOwner();

        $backend->createCalendarObject(
            $calendar->id,
            'sync.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Interop//EN\nBEGIN:VEVENT\nUID:sync-token-uid\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T100000Z\nSUMMARY:Sync Seed\nEND:VEVENT\nEND:VCALENDAR"
        );

        try {
            $backend->getChangesForCalendar($calendar->id, 'not-a-token', 1);
            $this->fail('Expected InvalidSyncToken for malformed token format.');
        } catch (InvalidSyncToken) {
            $this->assertTrue(true);
        }

        $this->expectException(InvalidSyncToken::class);

        $backend->getChangesForCalendar($calendar->id, '9999', 1);
    }

    public function test_strict_mode_rejects_legacy_calendar_payload_without_prodid_or_uid(): void
    {
        [$backend, $calendar] = $this->calendarBackendForOwner();

        $this->expectException(BadRequest::class);

        $backend->createCalendarObject(
            $calendar->id,
            'strict-reject.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:20260227T100000Z\nSUMMARY:Legacy Event\nEND:VEVENT\nEND:VCALENDAR"
        );
    }

    public function test_compatibility_mode_allows_legacy_calendar_and_card_payloads(): void
    {
        app(RegistrationSettingsService::class)->setDavCompatibilityModeEnabled(true);

        $owner = User::factory()->create();
        $calendar = Calendar::factory()->create(['owner_id' => $owner->id]);
        $addressBook = AddressBook::factory()->create(['owner_id' => $owner->id]);

        app(DavRequestContext::class)->setAuthenticatedUser($owner);

        $calendarBackend = app(LaravelCalendarBackend::class);
        $cardBackend = app(LaravelCardDavBackend::class);

        $etag = $calendarBackend->createCalendarObject(
            $calendar->id,
            'legacy-event.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:20260227T100000Z\nSUMMARY:Legacy Event\nEND:VEVENT\nEND:VCALENDAR"
        );

        $this->assertNotEmpty($etag);
        $this->assertDatabaseHas('calendar_objects', [
            'calendar_id' => $calendar->id,
            'uri' => 'legacy-event.ics',
            'uid' => 'legacy-calendar-'.sha1('legacy-event.ics'),
        ]);

        $cardEtag = $cardBackend->createCard(
            $addressBook->id,
            'legacy-contact.vcf',
            "BEGIN:VCARD\nN:Legacy;Contact;;;\nEMAIL:not-an-email\nEND:VCARD"
        );

        $this->assertNotEmpty($cardEtag);
        $this->assertDatabaseHas('cards', [
            'address_book_id' => $addressBook->id,
            'uri' => 'legacy-contact.vcf',
            'uid' => 'legacy-card-'.sha1('legacy-contact.vcf'),
        ]);
    }

    private function calendarBackendForOwner(): array
    {
        $owner = User::factory()->create();
        $calendar = Calendar::factory()->create(['owner_id' => $owner->id]);

        app(DavRequestContext::class)->setAuthenticatedUser($owner);

        return [app(LaravelCalendarBackend::class), $calendar];
    }

    private function cardBackendForOwner(): array
    {
        $owner = User::factory()->create();
        $addressBook = AddressBook::factory()->create(['owner_id' => $owner->id]);

        app(DavRequestContext::class)->setAuthenticatedUser($owner);

        return [app(LaravelCardDavBackend::class), $addressBook];
    }
}
