<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\User;
use App\Services\Dav\Backends\LaravelCalendarBackend;
use App\Services\Dav\Backends\LaravelCardDavBackend;
use App\Services\ResourceUriService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Sabre\DAV\Exception\Conflict;
use Tests\TestCase;

class DavCollectionCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_calendar_creation_uses_shared_owner_scoped_uri_deduplication(): void
    {
        $owner = User::factory()->create();
        Calendar::factory()->create([
            'owner_id' => $owner->id,
            'uri' => 'team-calendar',
        ]);

        $this->actingAs($owner)
            ->postJson('/api/calendars', [
                'display_name' => 'Team Calendar',
                'uri' => 'team calendar',
            ])
            ->assertCreated()
            ->assertJsonPath('uri', 'team-calendar-1');
    }

    public function test_api_address_book_creation_uses_shared_owner_scoped_uri_deduplication(): void
    {
        $owner = User::factory()->create();
        AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'uri' => 'team-book',
        ]);

        $this->actingAs($owner)
            ->postJson('/api/address-books', [
                'display_name' => 'Team Book',
                'uri' => 'team book',
            ])
            ->assertCreated()
            ->assertJsonPath('uri', 'team-book-1');
    }

    public function test_calendar_creation_deduplicates_owner_uri(): void
    {
        $owner = User::factory()->create();
        Calendar::factory()->create([
            'owner_id' => $owner->id,
            'uri' => 'team-calendar',
        ]);

        app(LaravelCalendarBackend::class)->createCalendar(
            principalUri: 'principals/'.$owner->id,
            calendarUri: 'team calendar',
            properties: ['{DAV:}displayname' => 'Team Calendar'],
        );

        $this->assertDatabaseHas('calendars', [
            'owner_id' => $owner->id,
            'uri' => 'team-calendar-1',
            'display_name' => 'Team Calendar',
        ]);
    }

    public function test_address_book_creation_deduplicates_owner_uri(): void
    {
        $owner = User::factory()->create();
        AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'uri' => 'team-book',
        ]);

        app(LaravelCardDavBackend::class)->createAddressBook(
            principalUri: 'principals/'.$owner->id,
            url: 'team book',
            properties: ['{DAV:}displayname' => 'Team Book'],
        );

        $this->assertDatabaseHas('address_books', [
            'owner_id' => $owner->id,
            'uri' => 'team-book-1',
            'display_name' => 'Team Book',
        ]);
    }

    public function test_calendar_creation_uses_non_empty_fallback_uri_when_slug_is_empty(): void
    {
        $owner = User::factory()->create();

        app(LaravelCalendarBackend::class)->createCalendar(
            principalUri: 'principals/'.$owner->id,
            calendarUri: '!!!',
            properties: ['{DAV:}displayname' => 'Emoji Calendar'],
        );

        $this->assertDatabaseHas('calendars', [
            'owner_id' => $owner->id,
            'uri' => 'calendar',
            'display_name' => 'Emoji Calendar',
        ]);
    }

    public function test_address_book_creation_uses_non_empty_fallback_uri_when_slug_is_empty(): void
    {
        $owner = User::factory()->create();

        app(LaravelCardDavBackend::class)->createAddressBook(
            principalUri: 'principals/'.$owner->id,
            url: '!!!',
            properties: ['{DAV:}displayname' => 'Emoji Book'],
        );

        $this->assertDatabaseHas('address_books', [
            'owner_id' => $owner->id,
            'uri' => 'address-book',
            'display_name' => 'Emoji Book',
        ]);
    }

    public function test_api_collection_creation_uses_non_empty_fallback_uri_when_slug_is_empty(): void
    {
        $owner = User::factory()->create();

        $this->actingAs($owner)
            ->postJson('/api/calendars', [
                'display_name' => 'Emoji Calendar',
                'uri' => '!!!',
            ])
            ->assertCreated()
            ->assertJsonPath('uri', 'calendar');

        $this->actingAs($owner)
            ->postJson('/api/address-books', [
                'display_name' => 'Emoji Book',
                'uri' => '!!!',
            ])
            ->assertCreated()
            ->assertJsonPath('uri', 'address-book');
    }

    public function test_calendar_creation_maps_owner_uri_unique_constraint_to_conflict(): void
    {
        $owner = User::factory()->create();
        Calendar::factory()->create([
            'owner_id' => $owner->id,
            'uri' => 'race-calendar',
        ]);

        $this->mock(ResourceUriService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('nextCalendarUri')->once()->andReturn('race-calendar');
        });

        $this->expectException(Conflict::class);
        $this->expectExceptionMessage('Calendar already exists for the requested URI.');

        app(LaravelCalendarBackend::class)->createCalendar(
            principalUri: 'principals/'.$owner->id,
            calendarUri: 'ignored',
            properties: ['{DAV:}displayname' => 'Race Calendar'],
        );
    }

    public function test_address_book_creation_maps_owner_uri_unique_constraint_to_conflict(): void
    {
        $owner = User::factory()->create();
        AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'uri' => 'race-book',
        ]);

        $this->mock(ResourceUriService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('nextAddressBookUri')->once()->andReturn('race-book');
        });

        $this->expectException(Conflict::class);
        $this->expectExceptionMessage('Address book already exists for the requested URI.');

        app(LaravelCardDavBackend::class)->createAddressBook(
            principalUri: 'principals/'.$owner->id,
            url: 'ignored',
            properties: ['{DAV:}displayname' => 'Race Book'],
        );
    }
}
