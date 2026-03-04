<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\Card;
use App\Models\Contact;
use App\Models\ContactAddressBookAssignment;
use App\Models\User;
use App\Services\Dav\Backends\LaravelCardDavBackend;
use App\Services\DavRequestContext;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactCardDavSyncTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app(RegistrationSettingsService::class)->setContactManagementEnabled(true);
    }

    public function test_creating_card_via_carddav_backfills_managed_contact(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'uri' => 'sync-book',
        ]);

        app(DavRequestContext::class)->setAuthenticatedUser($user);

        app(LaravelCardDavBackend::class)->createCard(
            $addressBook->id,
            'alex-sync.vcf',
            "BEGIN:VCARD\nVERSION:4.0\nFN:Alex Sync\nN:Sync;Alex;;;\nUID:carddav-sync-uid\nORG:Davvy Labs;Platform\nTITLE:Engineer\nTEL;TYPE=CELL:+15555550100\nEMAIL;TYPE=WORK:alex.sync@example.com\nEND:VCARD"
        );

        $card = Card::query()
            ->where('address_book_id', $addressBook->id)
            ->where('uri', 'alex-sync.vcf')
            ->firstOrFail();

        $contact = Contact::query()
            ->where('owner_id', $user->id)
            ->where('uid', 'carddav-sync-uid')
            ->first();

        $this->assertNotNull($contact);
        $this->assertSame('Alex', $contact->payload['first_name'] ?? null);
        $this->assertSame('Sync', $contact->payload['last_name'] ?? null);
        $this->assertSame('Davvy Labs', $contact->payload['company'] ?? null);
        $this->assertSame('Platform', $contact->payload['department'] ?? null);
        $this->assertSame('+15555550100', $contact->payload['phones'][0]['value'] ?? null);
        $this->assertSame('alex.sync@example.com', $contact->payload['emails'][0]['value'] ?? null);

        $this->assertDatabaseHas('contact_address_book_assignments', [
            'contact_id' => $contact->id,
            'address_book_id' => $addressBook->id,
            'card_id' => $card->id,
            'card_uri' => 'alex-sync.vcf',
        ]);
    }

    public function test_updating_card_via_carddav_rehydrates_existing_managed_contact_payload(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'uri' => 'rehydrate-book',
        ]);

        $created = $this->actingAs($user)->postJson('/api/contacts', [
            'first_name' => 'Original',
            'last_name' => 'Person',
            'company' => null,
            'address_book_ids' => [$addressBook->id],
            'phones' => [],
            'emails' => [],
            'urls' => [],
            'addresses' => [],
            'dates' => [],
            'related_names' => [],
            'instant_messages' => [],
        ]);
        $created->assertCreated();

        $contactId = (int) $created->json('id');
        $uid = (string) $created->json('uid');
        $cardUri = (string) ContactAddressBookAssignment::query()
            ->where('contact_id', $contactId)
            ->where('address_book_id', $addressBook->id)
            ->value('card_uri');

        app(DavRequestContext::class)->setAuthenticatedUser($user);

        app(LaravelCardDavBackend::class)->updateCard(
            $addressBook->id,
            $cardUri,
            "BEGIN:VCARD\nVERSION:4.0\nFN:Jordan Parker\nN:Parker;Jordan;;;\nUID:{$uid}\nORG:Acme Co;Research\nTITLE:Lead Engineer\nTEL;TYPE=CELL:+15555550111\nEMAIL;TYPE=WORK:jordan.parker@example.com\nX-DAVVY-PRONOUNS:they/them\nEND:VCARD"
        );

        $contact = Contact::query()->findOrFail($contactId);
        $payload = is_array($contact->payload) ? $contact->payload : [];

        $this->assertSame('Jordan', $payload['first_name'] ?? null);
        $this->assertSame('Parker', $payload['last_name'] ?? null);
        $this->assertSame('Acme Co', $payload['company'] ?? null);
        $this->assertSame('Research', $payload['department'] ?? null);
        $this->assertSame('Lead Engineer', $payload['job_title'] ?? null);
        $this->assertSame('they/them', $payload['pronouns'] ?? null);
        $this->assertSame('+15555550111', $payload['phones'][0]['value'] ?? null);
        $this->assertSame('jordan.parker@example.com', $payload['emails'][0]['value'] ?? null);
    }

    public function test_deleting_card_via_carddav_removes_orphaned_managed_contact(): void
    {
        $user = User::factory()->create();
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'uri' => 'delete-sync-book',
        ]);

        app(DavRequestContext::class)->setAuthenticatedUser($user);

        app(LaravelCardDavBackend::class)->createCard(
            $addressBook->id,
            'delete-sync.vcf',
            "BEGIN:VCARD\nVERSION:4.0\nFN:Delete Sync\nN:Sync;Delete;;;\nUID:delete-sync-uid\nEMAIL:delete.sync@example.com\nEND:VCARD"
        );

        $card = Card::query()
            ->where('address_book_id', $addressBook->id)
            ->where('uri', 'delete-sync.vcf')
            ->firstOrFail();

        $assignment = ContactAddressBookAssignment::query()
            ->where('card_id', $card->id)
            ->first();

        $this->assertNotNull($assignment);
        $this->assertDatabaseHas('contacts', ['id' => $assignment->contact_id]);

        app(LaravelCardDavBackend::class)->deleteCard($addressBook->id, 'delete-sync.vcf');

        $this->assertDatabaseMissing('contact_address_book_assignments', ['card_id' => $card->id]);
        $this->assertDatabaseMissing('contacts', ['id' => $assignment->contact_id]);
    }
}
