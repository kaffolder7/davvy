<?php

namespace Tests\Feature;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\Card;
use App\Models\ResourceShare;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Tests\TestCase;
use ZipArchive;

class ResourceExportTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_export_single_calendar_as_ics_file(): void
    {
        $user = User::factory()->create();
        $calendar = Calendar::factory()->create([
            'owner_id' => $user->id,
            'display_name' => 'Work Calendar',
            'uri' => 'work-calendar',
        ]);

        $this->createCalendarObject($calendar, 'work-event', 'Work Sync');

        $response = $this->actingAs($user)->get("/api/exports/calendars/{$calendar->id}");

        $response->assertOk();
        $response->assertHeader('content-type', 'text/calendar; charset=utf-8');
        $response->assertHeader('content-disposition', 'attachment; filename="work-calendar.ics"');
        $this->assertStringContainsString('BEGIN:VCALENDAR', (string) $response->getContent());
        $this->assertStringContainsString('SUMMARY:Work Sync', (string) $response->getContent());
    }

    public function test_user_can_export_all_calendars_including_shared_resources(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $ownedCalendar = Calendar::factory()->create([
            'owner_id' => $recipient->id,
            'display_name' => 'My Calendar',
            'uri' => 'my-calendar',
        ]);
        $sharedCalendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Team Calendar',
            'uri' => 'team-calendar',
            'is_sharable' => true,
        ]);

        $this->createCalendarObject($ownedCalendar, 'owned-event', 'Owned Event');
        $this->createCalendarObject($sharedCalendar, 'shared-event', 'Shared Event');

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::Calendar,
            'resource_id' => $sharedCalendar->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::ReadOnly,
        ]);

        $response = $this->actingAs($recipient)->get('/api/exports/calendars');

        $response->assertOk();
        $response->assertHeader('content-type', 'application/zip');
        $response->assertDownload();

        $entries = $this->zipEntries($response);
        $this->assertCount(2, $entries);
        $this->assertContains('my-calendar.ics', array_keys($entries));
        $this->assertContains('team-calendar.ics', array_keys($entries));
        $this->assertTrue($this->zipEntryContains($entries, 'SUMMARY:Owned Event'));
        $this->assertTrue($this->zipEntryContains($entries, 'SUMMARY:Shared Event'));
    }

    public function test_user_can_export_single_shared_address_book_as_vcard_file(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Team Contacts',
            'uri' => 'team-contacts',
            'is_sharable' => true,
        ]);
        $this->createCard($addressBook, 'jane-shared', 'Jane Shared', 'jane@example.com');

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::AddressBook,
            'resource_id' => $addressBook->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::ReadOnly,
        ]);

        $response = $this->actingAs($recipient)->get("/api/exports/address-books/{$addressBook->id}");

        $response->assertOk();
        $response->assertHeader('content-type', 'text/vcard; charset=utf-8');
        $response->assertHeader('content-disposition', 'attachment; filename="team-contacts.vcf"');
        $this->assertStringContainsString('BEGIN:VCARD', (string) $response->getContent());
        $this->assertStringContainsString('FN:Jane Shared', (string) $response->getContent());
    }

    public function test_user_can_export_all_address_books_including_shared_resources(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $ownedAddressBook = AddressBook::factory()->create([
            'owner_id' => $recipient->id,
            'display_name' => 'My Contacts',
            'uri' => 'my-contacts',
        ]);
        $sharedAddressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Team Contacts',
            'uri' => 'team-contacts',
            'is_sharable' => true,
        ]);

        $this->createCard($ownedAddressBook, 'alice-owned', 'Alice Owned', 'alice@example.com');
        $this->createCard($sharedAddressBook, 'bob-shared', 'Bob Shared', 'bob@example.com');

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::AddressBook,
            'resource_id' => $sharedAddressBook->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::ReadOnly,
        ]);

        $response = $this->actingAs($recipient)->get('/api/exports/address-books');

        $response->assertOk();
        $response->assertHeader('content-type', 'application/zip');
        $response->assertDownload();

        $entries = $this->zipEntries($response);
        $this->assertCount(2, $entries);
        $this->assertContains('my-contacts.vcf', array_keys($entries));
        $this->assertContains('team-contacts.vcf', array_keys($entries));
        $this->assertTrue($this->zipEntryContains($entries, 'FN:Alice Owned'));
        $this->assertTrue($this->zipEntryContains($entries, 'FN:Bob Shared'));
    }

    public function test_export_endpoints_reject_unreadable_resources(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();

        $calendar = Calendar::factory()->create(['owner_id' => $owner->id]);
        $addressBook = AddressBook::factory()->create(['owner_id' => $owner->id]);

        $this->actingAs($otherUser)
            ->get("/api/exports/calendars/{$calendar->id}")
            ->assertForbidden();

        $this->actingAs($otherUser)
            ->get("/api/exports/address-books/{$addressBook->id}")
            ->assertForbidden();
    }

    private function createCalendarObject(Calendar $calendar, string $uid, string $summary): void
    {
        $ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Tests//EN\nBEGIN:VEVENT\nUID:{$uid}\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T100000Z\nDTEND:20260227T103000Z\nSUMMARY:{$summary}\nEND:VEVENT\nEND:VCALENDAR";

        CalendarObject::query()->create([
            'calendar_id' => $calendar->id,
            'uri' => "{$uid}.ics",
            'uid' => $uid,
            'etag' => sha1($ics),
            'size' => strlen($ics),
            'component_type' => 'VEVENT',
            'data' => $ics,
        ]);
    }

    private function createCard(AddressBook $addressBook, string $uid, string $name, string $email): void
    {
        $vcard = "BEGIN:VCARD\nVERSION:4.0\nFN:{$name}\nUID:{$uid}\nEMAIL:{$email}\nEND:VCARD";

        Card::query()->create([
            'address_book_id' => $addressBook->id,
            'uri' => "{$uid}.vcf",
            'uid' => $uid,
            'etag' => sha1($vcard),
            'size' => strlen($vcard),
            'data' => $vcard,
        ]);
    }

    /**
     * @return array<string, string>
     */
    private function zipEntries(TestResponse $response): array
    {
        $this->assertInstanceOf(BinaryFileResponse::class, $response->baseResponse);

        $zip = new ZipArchive();
        $opened = $zip->open($response->baseResponse->getFile()->getPathname());
        $this->assertTrue($opened === true, 'Unable to open exported zip archive.');

        $entries = [];
        for ($index = 0; $index < $zip->numFiles; $index++) {
            $entryName = $zip->getNameIndex($index);
            $entryContents = $zip->getFromIndex($index);

            if ($entryName !== false && $entryContents !== false) {
                $entries[$entryName] = $entryContents;
            }
        }

        $zip->close();

        return $entries;
    }

    /**
     * @param  array<string, string>  $entries
     */
    private function zipEntryContains(array $entries, string $needle): bool
    {
        foreach ($entries as $entryContents) {
            if (str_contains($entryContents, $needle)) {
                return true;
            }
        }

        return false;
    }
}
