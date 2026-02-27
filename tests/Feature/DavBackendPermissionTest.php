<?php

namespace Tests\Feature;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\ResourceShare;
use App\Models\User;
use App\Services\Dav\Backends\LaravelCalendarBackend;
use App\Services\Dav\Backends\LaravelCardDavBackend;
use App\Services\DavRequestContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Sabre\DAV\Exception\Forbidden;
use Tests\TestCase;

class DavBackendPermissionTest extends TestCase
{
    use RefreshDatabase;

    public function test_read_only_share_cannot_write_calendar_object_over_dav_backend(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::Calendar,
            'resource_id' => $calendar->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::ReadOnly,
        ]);

        $context = app(DavRequestContext::class);
        $context->setAuthenticatedUser($recipient);

        $backend = app(LaravelCalendarBackend::class);

        $this->expectException(Forbidden::class);

        $backend->createCalendarObject(
            $calendar->id,
            'event-1.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Tests//EN\nBEGIN:VEVENT\nUID:1\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T100000Z\nSUMMARY:Read-only Test\nEND:VEVENT\nEND:VCALENDAR"
        );
    }

    public function test_admin_share_can_write_calendar_object_over_dav_backend(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::Calendar,
            'resource_id' => $calendar->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::Admin,
        ]);

        $context = app(DavRequestContext::class);
        $context->setAuthenticatedUser($recipient);

        $backend = app(LaravelCalendarBackend::class);

        $etag = $backend->createCalendarObject(
            $calendar->id,
            'event-2.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Tests//EN\nBEGIN:VEVENT\nUID:2\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T100000Z\nSUMMARY:Admin Test\nEND:VEVENT\nEND:VCALENDAR"
        );

        $this->assertNotEmpty($etag);
        $this->assertDatabaseHas('calendar_objects', [
            'calendar_id' => $calendar->id,
            'uri' => 'event-2.ics',
        ]);
    }

    public function test_editor_share_can_write_calendar_object_over_dav_backend(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::Calendar,
            'resource_id' => $calendar->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::Editor,
        ]);

        $context = app(DavRequestContext::class);
        $context->setAuthenticatedUser($recipient);

        $backend = app(LaravelCalendarBackend::class);

        $etag = $backend->createCalendarObject(
            $calendar->id,
            'event-3.ics',
            "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Tests//EN\nBEGIN:VEVENT\nUID:3\nDTSTAMP:20260227T090000Z\nDTSTART:20260227T100000Z\nSUMMARY:Editor Test\nEND:VEVENT\nEND:VCALENDAR"
        );

        $this->assertNotEmpty($etag);
        $this->assertDatabaseHas('calendar_objects', [
            'calendar_id' => $calendar->id,
            'uri' => 'event-3.ics',
        ]);
    }

    public function test_editor_share_cannot_delete_shared_calendar_over_dav_backend(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::Calendar,
            'resource_id' => $calendar->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::Editor,
        ]);

        $context = app(DavRequestContext::class);
        $context->setAuthenticatedUser($recipient);

        $backend = app(LaravelCalendarBackend::class);

        $this->expectException(Forbidden::class);
        $backend->deleteCalendar($calendar->id);
    }

    public function test_admin_share_can_delete_shared_calendar_over_dav_backend(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::Calendar,
            'resource_id' => $calendar->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::Admin,
        ]);

        $context = app(DavRequestContext::class);
        $context->setAuthenticatedUser($recipient);

        $backend = app(LaravelCalendarBackend::class);
        $backend->deleteCalendar($calendar->id);

        $this->assertDatabaseMissing('calendars', [
            'id' => $calendar->id,
        ]);
    }

    public function test_editor_share_cannot_delete_shared_address_book_over_dav_backend(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::AddressBook,
            'resource_id' => $addressBook->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::Editor,
        ]);

        $context = app(DavRequestContext::class);
        $context->setAuthenticatedUser($recipient);

        $backend = app(LaravelCardDavBackend::class);

        $this->expectException(Forbidden::class);
        $backend->deleteAddressBook($addressBook->id);
    }

    public function test_admin_share_can_delete_shared_address_book_over_dav_backend(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::AddressBook,
            'resource_id' => $addressBook->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::Admin,
        ]);

        $context = app(DavRequestContext::class);
        $context->setAuthenticatedUser($recipient);

        $backend = app(LaravelCardDavBackend::class);
        $backend->deleteAddressBook($addressBook->id);

        $this->assertDatabaseMissing('address_books', [
            'id' => $addressBook->id,
        ]);
    }
}
