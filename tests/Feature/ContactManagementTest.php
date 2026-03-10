<?php

namespace Tests\Feature;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Card;
use App\Models\Contact;
use App\Models\ContactAddressBookAssignment;
use App\Models\ResourceShare;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app(RegistrationSettingsService::class)->setContactManagementEnabled(true);
    }

    public function test_user_can_create_contact_in_multiple_address_books(): void
    {
        $user = User::factory()->create();
        $bookA = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'friends']);
        $bookB = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'work']);

        $response = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'address_book_ids' => [$bookA->id, $bookB->id],
        ]));

        $response->assertCreated();
        $contactId = (int) $response->json('id');
        $uid = (string) $response->json('uid');

        $this->assertDatabaseHas('contacts', [
            'id' => $contactId,
            'owner_id' => $user->id,
            'uid' => $uid,
        ]);

        $cards = Card::query()->where('uid', $uid)->orderBy('address_book_id')->get();

        $this->assertCount(2, $cards);
        $this->assertSame([$bookA->id, $bookB->id], $cards->pluck('address_book_id')->all());
        $this->assertStringContainsString('FN:Dr. Alex Q Rivera Jr.', $cards[0]->data);
        $this->assertStringContainsString('X-DAVVY-PRONOUNS:they/them', $cards[0]->data);

        $this->assertSame(
            2,
            ContactAddressBookAssignment::query()->where('contact_id', $contactId)->count(),
        );
    }

    public function test_updating_contact_reassigns_address_books_and_updates_existing_cards(): void
    {
        $user = User::factory()->create();
        $bookA = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'a-book']);
        $bookB = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'b-book']);
        $bookC = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'c-book']);

        $created = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'address_book_ids' => [$bookA->id, $bookB->id],
        ]));

        $created->assertCreated();

        $contactId = (int) $created->json('id');
        $uid = (string) $created->json('uid');

        $updatedPayload = $this->payload([
            'first_name' => 'Jordan',
            'last_name' => 'Parker',
            'address_book_ids' => [$bookB->id, $bookC->id],
        ]);

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$contactId, $updatedPayload)
            ->assertOk()
            ->assertJsonPath('display_name', 'Dr. Jordan Q Parker Jr.');

        $this->assertSame(
            0,
            Card::query()->where('address_book_id', $bookA->id)->where('uid', $uid)->count(),
        );

        $bookBCard = Card::query()->where('address_book_id', $bookB->id)->where('uid', $uid)->first();
        $bookCCard = Card::query()->where('address_book_id', $bookC->id)->where('uid', $uid)->first();

        $this->assertNotNull($bookBCard);
        $this->assertNotNull($bookCCard);
        $this->assertStringContainsString('FN:Dr. Jordan Q Parker Jr.', $bookBCard->data);
        $this->assertStringContainsString('FN:Dr. Jordan Q Parker Jr.', $bookCCard->data);

        $assignedBookIds = Contact::query()
            ->findOrFail($contactId)
            ->assignments()
            ->orderBy('address_book_id')
            ->pluck('address_book_id')
            ->all();

        $this->assertSame([$bookB->id, $bookC->id], $assignedBookIds);
    }

    public function test_related_name_can_link_to_existing_contact_by_id(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'family-link']);

        $partner = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'prefix' => '',
            'first_name' => 'Jamie',
            'middle_name' => '',
            'last_name' => 'Rowe',
            'suffix' => '',
            'nickname' => '',
            'company' => '',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $partner->assertCreated();

        $partnerId = (int) $partner->json('id');
        $partnerName = (string) $partner->json('display_name');

        $created = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $created->assertCreated();

        $contactId = (int) $created->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$contactId, $this->payload([
                'first_name' => 'Alex',
                'last_name' => 'Rivera',
                'related_names' => [
                    [
                        'label' => 'spouse',
                        'custom_label' => null,
                        'value' => 'Will be replaced',
                        'related_contact_id' => $partnerId,
                    ],
                ],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk()
            ->assertJsonPath('related_names.0.related_contact_id', $partnerId)
            ->assertJsonPath('related_names.0.value', $partnerName);

        $payload = Contact::query()->findOrFail($contactId)->payload;
        $this->assertSame($partnerId, $payload['related_names'][0]['related_contact_id'] ?? null);
        $this->assertSame($partnerName, $payload['related_names'][0]['value'] ?? null);
    }

    public function test_related_name_cannot_reference_same_contact_id(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'self-link']);

        $created = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $created->assertCreated();

        $contactId = (int) $created->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$contactId, $this->payload([
                'first_name' => 'Alex',
                'last_name' => 'Rivera',
                'related_names' => [
                    [
                        'label' => 'spouse',
                        'custom_label' => null,
                        'value' => 'Alex Rivera',
                        'related_contact_id' => $contactId,
                    ],
                ],
                'address_book_ids' => [$book->id],
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['related_names.0.related_contact_id']);
    }

    public function test_contact_can_opt_out_of_milestone_calendar_generation(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'opt-out-book']);

        $response = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'exclude_milestone_calendars' => true,
            'address_book_ids' => [$book->id],
        ]));

        $response->assertCreated();
        $response->assertJsonPath('exclude_milestone_calendars', true);

        $uid = (string) $response->json('uid');
        $card = Card::query()
            ->where('address_book_id', $book->id)
            ->where('uid', $uid)
            ->firstOrFail();

        $this->assertStringContainsString('X-DAVVY-EXCLUDE-MILESTONES:1', $card->data);
    }

    public function test_contact_can_be_marked_as_head_of_household(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'household-book']);

        $response = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'head_of_household' => true,
            'address_book_ids' => [$book->id],
        ]));

        $response->assertCreated();
        $response->assertJsonPath('head_of_household', true);

        $uid = (string) $response->json('uid');
        $card = Card::query()
            ->where('address_book_id', $book->id)
            ->where('uid', $uid)
            ->firstOrFail();

        $this->assertStringContainsString('X-DAVVY-HEAD-OF-HOUSEHOLD:1', $card->data);
    }

    public function test_create_contact_requires_write_access_to_selected_address_books(): void
    {
        $owner = User::factory()->create();
        $recipient = User::factory()->create();

        $sharedBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::AddressBook,
            'resource_id' => $sharedBook->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $recipient->id,
            'permission' => SharePermission::ReadOnly,
        ]);

        $this->actingAs($recipient)
            ->postJson('/api/contacts', $this->payload([
                'address_book_ids' => [$sharedBook->id],
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['address_book_ids']);

        ResourceShare::query()->where('resource_id', $sharedBook->id)->update([
            'permission' => SharePermission::Editor->value,
        ]);

        $this->actingAs($recipient)
            ->postJson('/api/contacts', $this->payload([
                'address_book_ids' => [$sharedBook->id],
            ]))
            ->assertCreated();
    }

    public function test_deleting_contact_removes_associated_cards(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id]);

        $created = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'address_book_ids' => [$book->id],
        ]));

        $created->assertCreated();

        $contactId = (int) $created->json('id');
        $uid = (string) $created->json('uid');

        $this->actingAs($user)
            ->deleteJson('/api/contacts/'.$contactId)
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertDatabaseMissing('contacts', ['id' => $contactId]);
        $this->assertSame(0, Card::query()->where('uid', $uid)->count());
        $this->assertSame(0, ContactAddressBookAssignment::query()->where('contact_id', $contactId)->count());
    }

    public function test_create_contact_requires_first_name_last_name_or_company(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id]);

        $this->actingAs($user)
            ->postJson('/api/contacts', $this->payload([
                'first_name' => '   ',
                'last_name' => '',
                'company' => null,
                'address_book_ids' => [$book->id],
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['first_name']);
    }

    public function test_contacts_api_is_forbidden_when_contact_management_is_disabled(): void
    {
        $user = User::factory()->create();
        app(RegistrationSettingsService::class)->setContactManagementEnabled(false);

        $this->actingAs($user)
            ->getJson('/api/contacts')
            ->assertForbidden()
            ->assertJsonPath('message', 'Contact management is currently disabled by admins.');

        $this->actingAs($user)
            ->postJson('/api/contacts', $this->payload())
            ->assertForbidden();

        $this->actingAs($user)
            ->patchJson('/api/contacts/999', $this->payload())
            ->assertForbidden();

        $this->actingAs($user)
            ->deleteJson('/api/contacts/999')
            ->assertForbidden();
    }

    public function test_update_contact_requires_first_name_last_name_or_company(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id]);

        $created = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'address_book_ids' => [$book->id],
        ]));
        $created->assertCreated();

        $contactId = (int) $created->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$contactId, $this->payload([
                'first_name' => '',
                'last_name' => '   ',
                'company' => null,
                'address_book_ids' => [$book->id],
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['first_name']);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'prefix' => 'Dr.',
            'first_name' => 'Alex',
            'middle_name' => 'Q',
            'last_name' => 'Rivera',
            'suffix' => 'Jr.',
            'nickname' => 'Lex',
            'company' => 'Davvy Labs',
            'job_title' => 'Engineer',
            'department' => 'Platform',
            'pronouns' => 'they/them',
            'pronouns_custom' => '',
            'ringtone' => 'Radar',
            'text_tone' => 'Note',
            'phonetic_first_name' => 'Ah-leks',
            'phonetic_last_name' => 'Ri-ve-ra',
            'phonetic_company' => 'Da-vee',
            'maiden_name' => 'Taylor',
            'verification_code' => '123456',
            'profile' => 'https://example.com/profile/alex',
            'head_of_household' => false,
            'exclude_milestone_calendars' => false,
            'birthday' => [
                'year' => 1990,
                'month' => 6,
                'day' => 12,
            ],
            'phones' => [
                ['label' => 'mobile', 'custom_label' => null, 'value' => '+15555550100'],
            ],
            'emails' => [
                ['label' => 'work', 'custom_label' => null, 'value' => 'alex@example.com'],
            ],
            'urls' => [
                ['label' => 'homepage', 'custom_label' => null, 'value' => 'https://example.com'],
            ],
            'addresses' => [
                [
                    'label' => 'home',
                    'custom_label' => null,
                    'street' => '123 Main St',
                    'city' => 'Indianapolis',
                    'state' => 'IN',
                    'postal_code' => '46204',
                    'country' => 'US',
                ],
            ],
            'dates' => [
                [
                    'label' => 'anniversary',
                    'custom_label' => null,
                    'year' => 2020,
                    'month' => 9,
                    'day' => 1,
                ],
            ],
            'related_names' => [
                ['label' => 'spouse', 'custom_label' => null, 'value' => 'Jamie Rivera'],
            ],
            'instant_messages' => [
                ['label' => 'work', 'custom_label' => null, 'value' => 'im:alex@example.com'],
            ],
            'address_book_ids' => [],
        ], $overrides);
    }
}
