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

    public function test_linked_related_name_rows_sync_bidirectionally_and_remove_when_unlinked(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'family-sync']);

        $parent = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Pat',
            'last_name' => 'Morgan',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $parent->assertCreated();
        $parentId = (int) $parent->json('id');
        $parentName = (string) $parent->json('display_name');

        $child = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Riley',
            'last_name' => 'Morgan',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $child->assertCreated();
        $childId = (int) $child->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$parentId, $this->payload([
                'first_name' => 'Pat',
                'last_name' => 'Morgan',
                'related_names' => [
                    [
                        'label' => 'son',
                        'custom_label' => null,
                        'value' => 'Riley Morgan',
                        'related_contact_id' => $childId,
                    ],
                ],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $childPayload = Contact::query()->findOrFail($childId)->payload;
        $this->assertSame(
            $parentId,
            $childPayload['related_names'][0]['related_contact_id'] ?? null,
        );
        $this->assertSame('parent', $childPayload['related_names'][0]['label'] ?? null);
        $this->assertSame($parentName, $childPayload['related_names'][0]['value'] ?? null);

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$parentId, $this->payload([
                'first_name' => 'Pat',
                'last_name' => 'Morgan',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $childPayloadAfterUnlink = Contact::query()->findOrFail($childId)->payload;
        $this->assertSame([], $childPayloadAfterUnlink['related_names'] ?? null);
    }

    public function test_editing_either_side_updates_inverse_label_on_related_contact(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'family-sync-2']);

        $alex = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Alex',
            'last_name' => 'Casey',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $alex->assertCreated();
        $alexId = (int) $alex->json('id');

        $jamie = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Jamie',
            'last_name' => 'Casey',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $jamie->assertCreated();
        $jamieId = (int) $jamie->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$alexId, $this->payload([
                'first_name' => 'Alex',
                'last_name' => 'Casey',
                'related_names' => [
                    [
                        'label' => 'partner',
                        'custom_label' => null,
                        'value' => 'Jamie Casey',
                        'related_contact_id' => $jamieId,
                    ],
                ],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$jamieId, $this->payload([
                'first_name' => 'Jamie',
                'last_name' => 'Casey',
                'related_names' => [
                    [
                        'label' => 'wife',
                        'custom_label' => null,
                        'value' => 'Alex Casey',
                        'related_contact_id' => $alexId,
                    ],
                ],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $alexPayload = Contact::query()->findOrFail($alexId)->payload;
        $this->assertSame(
            $jamieId,
            $alexPayload['related_names'][0]['related_contact_id'] ?? null,
        );
        $this->assertSame('spouse', $alexPayload['related_names'][0]['label'] ?? null);
    }

    public function test_parent_child_specific_overrides_are_not_replaced_by_generic_inverse_labels(): void
    {
        $cases = [
            [
                'uri' => 'family-sync-overrides-father-son',
                'parent_specific_label' => 'father',
                'child_specific_label' => 'son',
            ],
            [
                'uri' => 'family-sync-overrides-mother-son',
                'parent_specific_label' => 'mother',
                'child_specific_label' => 'son',
            ],
            [
                'uri' => 'family-sync-overrides-father-daughter',
                'parent_specific_label' => 'father',
                'child_specific_label' => 'daughter',
            ],
            [
                'uri' => 'family-sync-overrides-mother-daughter',
                'parent_specific_label' => 'mother',
                'child_specific_label' => 'daughter',
            ],
        ];

        foreach ($cases as $index => $case) {
            $user = User::factory()->create();
            $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => $case['uri']]);

            $parent = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'Parent'.$index,
                'last_name' => 'Morgan',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $parent->assertCreated();
            $parentId = (int) $parent->json('id');

            $child = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'Child'.$index,
                'last_name' => 'Morgan',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $child->assertCreated();
            $childId = (int) $child->json('id');

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$childId, $this->payload([
                    'first_name' => 'Child'.$index,
                    'last_name' => 'Morgan',
                    'related_names' => [[
                        'label' => $case['parent_specific_label'],
                        'custom_label' => null,
                        'value' => 'Parent'.$index.' Morgan',
                        'related_contact_id' => $parentId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $parentPayloadInitial = Contact::query()->findOrFail($parentId)->payload;
            $this->assertSame('child', $parentPayloadInitial['related_names'][0]['label'] ?? null);

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$parentId, $this->payload([
                    'first_name' => 'Parent'.$index,
                    'last_name' => 'Morgan',
                    'related_names' => [[
                        'label' => $case['child_specific_label'],
                        'custom_label' => null,
                        'value' => 'Child'.$index.' Morgan',
                        'related_contact_id' => $childId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$childId, $this->payload([
                    'first_name' => 'Child'.$index,
                    'last_name' => 'Morgan',
                    'related_names' => [[
                        'label' => $case['parent_specific_label'],
                        'custom_label' => null,
                        'value' => 'Parent'.$index.' Morgan',
                        'related_contact_id' => $parentId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $parentPayloadAfter = Contact::query()->findOrFail($parentId)->payload;
            $childPayloadAfter = Contact::query()->findOrFail($childId)->payload;

            $this->assertSame($case['child_specific_label'], $parentPayloadAfter['related_names'][0]['label'] ?? null);
            $this->assertSame($case['parent_specific_label'], $childPayloadAfter['related_names'][0]['label'] ?? null);
        }
    }

    public function test_in_law_specific_overrides_are_not_replaced_by_generic_inverse_labels(): void
    {
        $cases = [
            [
                'uri' => 'in-law-sync-overrides-father-son',
                'parent_in_law_specific_label' => 'father_in_law',
                'child_in_law_specific_label' => 'son_in_law',
            ],
            [
                'uri' => 'in-law-sync-overrides-father-daughter',
                'parent_in_law_specific_label' => 'father_in_law',
                'child_in_law_specific_label' => 'daughter_in_law',
            ],
            [
                'uri' => 'in-law-sync-overrides-mother-son',
                'parent_in_law_specific_label' => 'mother_in_law',
                'child_in_law_specific_label' => 'son_in_law',
            ],
            [
                'uri' => 'in-law-sync-overrides-mother-daughter',
                'parent_in_law_specific_label' => 'mother_in_law',
                'child_in_law_specific_label' => 'daughter_in_law',
            ],
        ];

        foreach ($cases as $index => $case) {
            $user = User::factory()->create();
            $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => $case['uri']]);

            $parentInLaw = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'ParentInLaw'.$index,
                'last_name' => 'Hargrove',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $parentInLaw->assertCreated();
            $parentInLawId = (int) $parentInLaw->json('id');

            $childInLaw = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'ChildInLaw'.$index,
                'last_name' => 'Hargrove',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $childInLaw->assertCreated();
            $childInLawId = (int) $childInLaw->json('id');

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$childInLawId, $this->payload([
                    'first_name' => 'ChildInLaw'.$index,
                    'last_name' => 'Hargrove',
                    'related_names' => [[
                        'label' => $case['parent_in_law_specific_label'],
                        'custom_label' => null,
                        'value' => 'ParentInLaw'.$index.' Hargrove',
                        'related_contact_id' => $parentInLawId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $parentPayloadInitial = Contact::query()->findOrFail($parentInLawId)->payload;
            $this->assertSame('child_in_law', $parentPayloadInitial['related_names'][0]['label'] ?? null);

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$parentInLawId, $this->payload([
                    'first_name' => 'ParentInLaw'.$index,
                    'last_name' => 'Hargrove',
                    'related_names' => [[
                        'label' => $case['child_in_law_specific_label'],
                        'custom_label' => null,
                        'value' => 'ChildInLaw'.$index.' Hargrove',
                        'related_contact_id' => $childInLawId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$childInLawId, $this->payload([
                    'first_name' => 'ChildInLaw'.$index,
                    'last_name' => 'Hargrove',
                    'related_names' => [[
                        'label' => $case['parent_in_law_specific_label'],
                        'custom_label' => null,
                        'value' => 'ParentInLaw'.$index.' Hargrove',
                        'related_contact_id' => $parentInLawId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $parentPayloadAfter = Contact::query()->findOrFail($parentInLawId)->payload;
            $childPayloadAfter = Contact::query()->findOrFail($childInLawId)->payload;

            $this->assertSame($case['child_in_law_specific_label'], $parentPayloadAfter['related_names'][0]['label'] ?? null);
            $this->assertSame($case['parent_in_law_specific_label'], $childPayloadAfter['related_names'][0]['label'] ?? null);
        }
    }

    public function test_child_in_law_relationship_propagates_to_spouse_contact(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'in-law-spouse-propagation']);

        $father = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Dennis',
            'last_name' => 'Hargrove',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $father->assertCreated();
        $fatherId = (int) $father->json('id');

        $mother = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Melanie',
            'last_name' => 'Hargrove',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $mother->assertCreated();
        $motherId = (int) $mother->json('id');

        $daughterInLaw = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Melissa',
            'last_name' => 'Hargrove',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $daughterInLaw->assertCreated();
        $daughterInLawId = (int) $daughterInLaw->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$fatherId, $this->payload([
                'first_name' => 'Dennis',
                'last_name' => 'Hargrove',
                'related_names' => [
                    [
                        'label' => 'spouse',
                        'custom_label' => null,
                        'value' => 'Marisol Hargrove',
                        'related_contact_id' => $motherId,
                    ],
                    [
                        'label' => 'daughter_in_law',
                        'custom_label' => null,
                        'value' => 'Talia Hargrove',
                        'related_contact_id' => $daughterInLawId,
                    ],
                ],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $motherPayload = Contact::query()->findOrFail($motherId)->payload;
        $daughterPayload = Contact::query()->findOrFail($daughterInLawId)->payload;

        $motherRelatedRows = collect($motherPayload['related_names'] ?? []);
        $spouseMirroredRow = $motherRelatedRows->first(
            fn (mixed $row): bool => is_array($row)
                && (int) ($row['related_contact_id'] ?? 0) === $daughterInLawId
        );

        $this->assertIsArray($spouseMirroredRow);
        $this->assertSame('daughter_in_law', $spouseMirroredRow['label'] ?? null);

        $daughterRelatedRows = collect($daughterPayload['related_names'] ?? [])
            ->filter(fn (mixed $row): bool => is_array($row))
            ->mapWithKeys(fn (array $row): array => [
                (int) ($row['related_contact_id'] ?? 0) => $row['label'] ?? null,
            ])
            ->all();

        $this->assertSame('parent_in_law', $daughterRelatedRows[$fatherId] ?? null);
        $this->assertSame('parent_in_law', $daughterRelatedRows[$motherId] ?? null);
    }

    public function test_removing_child_in_law_link_cleans_up_spouse_propagated_relationships(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'in-law-spouse-propagation-cleanup']);

        $father = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Dennis',
            'last_name' => 'Hargrove',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $father->assertCreated();
        $fatherId = (int) $father->json('id');

        $mother = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Melanie',
            'last_name' => 'Hargrove',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $mother->assertCreated();
        $motherId = (int) $mother->json('id');

        $daughterInLaw = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Melissa',
            'last_name' => 'Hargrove',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $daughterInLaw->assertCreated();
        $daughterInLawId = (int) $daughterInLaw->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$fatherId, $this->payload([
                'first_name' => 'Dennis',
                'last_name' => 'Hargrove',
                'related_names' => [
                    [
                        'label' => 'spouse',
                        'custom_label' => null,
                        'value' => 'Marisol Hargrove',
                        'related_contact_id' => $motherId,
                    ],
                    [
                        'label' => 'daughter_in_law',
                        'custom_label' => null,
                        'value' => 'Talia Hargrove',
                        'related_contact_id' => $daughterInLawId,
                    ],
                ],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$fatherId, $this->payload([
                'first_name' => 'Dennis',
                'last_name' => 'Hargrove',
                'related_names' => [
                    [
                        'label' => 'spouse',
                        'custom_label' => null,
                        'value' => 'Marisol Hargrove',
                        'related_contact_id' => $motherId,
                    ],
                ],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $motherPayload = Contact::query()->findOrFail($motherId)->payload;
        $daughterPayload = Contact::query()->findOrFail($daughterInLawId)->payload;

        $motherHasDaughterInLawRelation = collect($motherPayload['related_names'] ?? [])
            ->filter(fn (mixed $row): bool => is_array($row))
            ->contains(fn (array $row): bool => (int) ($row['related_contact_id'] ?? 0) === $daughterInLawId);
        $daughterHasMotherInLawRelation = collect($daughterPayload['related_names'] ?? [])
            ->filter(fn (mixed $row): bool => is_array($row))
            ->contains(fn (array $row): bool => (int) ($row['related_contact_id'] ?? 0) === $motherId);

        $this->assertFalse($motherHasDaughterInLawRelation);
        $this->assertFalse($daughterHasMotherInLawRelation);
    }

    public function test_niece_nephew_gender_matrix_bidirectional_inverse_mapping(): void
    {
        $cases = [
            [
                'uri' => 'nephew-uncle-matrix',
                'adult_pronouns' => 'he/him',
                'younger_pronouns' => 'he/him',
                'source_label' => 'nephew',
                'expected_inverse_label' => 'uncle',
            ],
            [
                'uri' => 'nephew-aunt-matrix',
                'adult_pronouns' => 'she/her',
                'younger_pronouns' => 'he/him',
                'source_label' => 'nephew',
                'expected_inverse_label' => 'aunt',
            ],
            [
                'uri' => 'niece-uncle-matrix',
                'adult_pronouns' => 'he/him',
                'younger_pronouns' => 'she/her',
                'source_label' => 'niece',
                'expected_inverse_label' => 'uncle',
            ],
            [
                'uri' => 'niece-aunt-matrix',
                'adult_pronouns' => 'she/her',
                'younger_pronouns' => 'she/her',
                'source_label' => 'niece',
                'expected_inverse_label' => 'aunt',
            ],
        ];

        foreach ($cases as $index => $case) {
            $user = User::factory()->create();
            $book = AddressBook::factory()->create([
                'owner_id' => $user->id,
                'uri' => $case['uri'],
            ]);

            $adultContact = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'Adult'.$index,
                'last_name' => 'Hargrove',
                'pronouns' => $case['adult_pronouns'],
                'pronouns_custom' => '',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $adultContact->assertCreated();
            $adultContactId = (int) $adultContact->json('id');

            $youngerContact = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'Younger'.$index,
                'last_name' => 'Hargrove',
                'pronouns' => $case['younger_pronouns'],
                'pronouns_custom' => '',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $youngerContact->assertCreated();
            $youngerContactId = (int) $youngerContact->json('id');

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$adultContactId, $this->payload([
                    'first_name' => 'Adult'.$index,
                    'last_name' => 'Hargrove',
                    'pronouns' => $case['adult_pronouns'],
                    'pronouns_custom' => '',
                    'related_names' => [[
                        'label' => $case['source_label'],
                        'custom_label' => null,
                        'value' => 'Younger'.$index.' Hargrove',
                        'related_contact_id' => $youngerContactId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $youngerPayload = Contact::query()->findOrFail($youngerContactId)->payload;
            $this->assertSame(
                $case['expected_inverse_label'],
                $youngerPayload['related_names'][0]['label'] ?? null,
            );

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$youngerContactId, $this->payload([
                    'first_name' => 'Younger'.$index,
                    'last_name' => 'Hargrove',
                    'pronouns' => $case['younger_pronouns'],
                    'pronouns_custom' => '',
                    'related_names' => [[
                        'label' => $case['expected_inverse_label'],
                        'custom_label' => null,
                        'value' => 'Adult'.$index.' Hargrove',
                        'related_contact_id' => $adultContactId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $adultPayload = Contact::query()->findOrFail($adultContactId)->payload;
            $this->assertSame(
                $case['source_label'],
                $adultPayload['related_names'][0]['label'] ?? null,
            );
        }
    }

    public function test_changing_related_label_from_other_to_specific_updates_inverse(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'other-to-specific']);

        $father = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Dennis',
            'last_name' => 'Hargrove',
            'pronouns' => 'he/him',
            'pronouns_custom' => '',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $father->assertCreated();
        $fatherId = (int) $father->json('id');

        $son = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Kyle',
            'last_name' => 'Hargrove',
            'pronouns' => 'he/him',
            'pronouns_custom' => '',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $son->assertCreated();
        $sonId = (int) $son->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$sonId, $this->payload([
                'first_name' => 'Kyle',
                'last_name' => 'Hargrove',
                'pronouns' => 'he/him',
                'pronouns_custom' => '',
                'related_names' => [[
                    'label' => 'other',
                    'custom_label' => null,
                    'value' => 'Calvin Hargrove',
                    'related_contact_id' => $fatherId,
                ]],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $fatherPayloadInitial = Contact::query()->findOrFail($fatherId)->payload;
        $this->assertSame('other', $fatherPayloadInitial['related_names'][0]['label'] ?? null);

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$sonId, $this->payload([
                'first_name' => 'Kyle',
                'last_name' => 'Hargrove',
                'pronouns' => 'he/him',
                'pronouns_custom' => '',
                'related_names' => [[
                    'label' => 'father',
                    'custom_label' => null,
                    'value' => 'Calvin Hargrove',
                    'related_contact_id' => $fatherId,
                ]],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $fatherPayloadAfter = Contact::query()->findOrFail($fatherId)->payload;
        $this->assertSame('son', $fatherPayloadAfter['related_names'][0]['label'] ?? null);
    }

    public function test_changing_related_label_from_other_to_custom_updates_inverse(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'other-to-custom']);

        $alex = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $alex->assertCreated();
        $alexId = (int) $alex->json('id');

        $jamie = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Jamie',
            'last_name' => 'Rivera',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $jamie->assertCreated();
        $jamieId = (int) $jamie->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$alexId, $this->payload([
                'first_name' => 'Alex',
                'last_name' => 'Rivera',
                'related_names' => [[
                    'label' => 'other',
                    'custom_label' => null,
                    'value' => 'Jamie Rivera',
                    'related_contact_id' => $jamieId,
                ]],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $jamiePayloadInitial = Contact::query()->findOrFail($jamieId)->payload;
        $this->assertSame('other', $jamiePayloadInitial['related_names'][0]['label'] ?? null);

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$alexId, $this->payload([
                'first_name' => 'Alex',
                'last_name' => 'Rivera',
                'related_names' => [[
                    'label' => 'custom',
                    'custom_label' => 'Mentor',
                    'value' => 'Jamie Rivera',
                    'related_contact_id' => $jamieId,
                ]],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $jamiePayloadAfter = Contact::query()->findOrFail($jamieId)->payload;
        $this->assertSame('custom', $jamiePayloadAfter['related_names'][0]['label'] ?? null);
        $this->assertSame('Mentor', $jamiePayloadAfter['related_names'][0]['custom_label'] ?? null);
    }

    public function test_other_label_does_not_overwrite_existing_specific_inverse_label(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create(['owner_id' => $user->id, 'uri' => 'other-does-not-clobber']);

        $father = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Dennis',
            'last_name' => 'Hargrove',
            'pronouns' => 'he/him',
            'pronouns_custom' => '',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $father->assertCreated();
        $fatherId = (int) $father->json('id');

        $son = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'Kyle',
            'last_name' => 'Hargrove',
            'pronouns' => 'he/him',
            'pronouns_custom' => '',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $son->assertCreated();
        $sonId = (int) $son->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$sonId, $this->payload([
                'first_name' => 'Kyle',
                'last_name' => 'Hargrove',
                'pronouns' => 'he/him',
                'pronouns_custom' => '',
                'related_names' => [[
                    'label' => 'father',
                    'custom_label' => null,
                    'value' => 'Calvin Hargrove',
                    'related_contact_id' => $fatherId,
                ]],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $fatherPayloadInitial = Contact::query()->findOrFail($fatherId)->payload;
        $this->assertSame('son', $fatherPayloadInitial['related_names'][0]['label'] ?? null);

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$sonId, $this->payload([
                'first_name' => 'Kyle',
                'last_name' => 'Hargrove',
                'pronouns' => 'he/him',
                'pronouns_custom' => '',
                'related_names' => [[
                    'label' => 'other',
                    'custom_label' => null,
                    'value' => 'Calvin Hargrove',
                    'related_contact_id' => $fatherId,
                ]],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $fatherPayloadAfter = Contact::query()->findOrFail($fatherId)->payload;
        $this->assertSame('son', $fatherPayloadAfter['related_names'][0]['label'] ?? null);
    }

    public function test_grandchild_gender_matrix_bidirectional_inverse_mapping(): void
    {
        $cases = [
            [
                'uri' => 'grandson-grandfather-matrix',
                'grandparent_pronouns' => 'he/him',
                'grandchild_pronouns' => 'he/him',
                'source_label' => 'grandson',
                'expected_inverse_label' => 'grandfather',
            ],
            [
                'uri' => 'grandson-grandmother-matrix',
                'grandparent_pronouns' => 'she/her',
                'grandchild_pronouns' => 'he/him',
                'source_label' => 'grandson',
                'expected_inverse_label' => 'grandmother',
            ],
            [
                'uri' => 'granddaughter-grandfather-matrix',
                'grandparent_pronouns' => 'he/him',
                'grandchild_pronouns' => 'she/her',
                'source_label' => 'granddaughter',
                'expected_inverse_label' => 'grandfather',
            ],
            [
                'uri' => 'granddaughter-grandmother-matrix',
                'grandparent_pronouns' => 'she/her',
                'grandchild_pronouns' => 'she/her',
                'source_label' => 'granddaughter',
                'expected_inverse_label' => 'grandmother',
            ],
        ];

        foreach ($cases as $index => $case) {
            $user = User::factory()->create();
            $book = AddressBook::factory()->create([
                'owner_id' => $user->id,
                'uri' => $case['uri'],
            ]);

            $grandparent = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'Grandparent'.$index,
                'last_name' => 'Hargrove',
                'pronouns' => $case['grandparent_pronouns'],
                'pronouns_custom' => '',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $grandparent->assertCreated();
            $grandparentId = (int) $grandparent->json('id');

            $grandchild = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'Grandchild'.$index,
                'last_name' => 'Hargrove',
                'pronouns' => $case['grandchild_pronouns'],
                'pronouns_custom' => '',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $grandchild->assertCreated();
            $grandchildId = (int) $grandchild->json('id');

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$grandparentId, $this->payload([
                    'first_name' => 'Grandparent'.$index,
                    'last_name' => 'Hargrove',
                    'pronouns' => $case['grandparent_pronouns'],
                    'pronouns_custom' => '',
                    'related_names' => [[
                        'label' => $case['source_label'],
                        'custom_label' => null,
                        'value' => 'Grandchild'.$index.' Hargrove',
                        'related_contact_id' => $grandchildId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $grandchildPayload = Contact::query()->findOrFail($grandchildId)->payload;
            $this->assertSame(
                $case['expected_inverse_label'],
                $grandchildPayload['related_names'][0]['label'] ?? null,
            );

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$grandchildId, $this->payload([
                    'first_name' => 'Grandchild'.$index,
                    'last_name' => 'Hargrove',
                    'pronouns' => $case['grandchild_pronouns'],
                    'pronouns_custom' => '',
                    'related_names' => [[
                        'label' => $case['expected_inverse_label'],
                        'custom_label' => null,
                        'value' => 'Grandparent'.$index.' Hargrove',
                        'related_contact_id' => $grandparentId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $grandparentPayload = Contact::query()->findOrFail($grandparentId)->payload;
            $this->assertSame(
                $case['source_label'],
                $grandparentPayload['related_names'][0]['label'] ?? null,
            );
        }
    }

    public function test_child_parent_gender_matrix_bidirectional_inverse_mapping(): void
    {
        $cases = [
            [
                'uri' => 'son-mother-matrix',
                'parent_pronouns' => 'she/her',
                'child_pronouns' => 'he/him',
                'source_label' => 'son',
                'expected_inverse_label' => 'mother',
            ],
            [
                'uri' => 'son-father-matrix',
                'parent_pronouns' => 'he/him',
                'child_pronouns' => 'he/him',
                'source_label' => 'son',
                'expected_inverse_label' => 'father',
            ],
            [
                'uri' => 'daughter-mother-matrix',
                'parent_pronouns' => 'she/her',
                'child_pronouns' => 'she/her',
                'source_label' => 'daughter',
                'expected_inverse_label' => 'mother',
            ],
            [
                'uri' => 'daughter-father-matrix',
                'parent_pronouns' => 'he/him',
                'child_pronouns' => 'she/her',
                'source_label' => 'daughter',
                'expected_inverse_label' => 'father',
            ],
        ];

        foreach ($cases as $index => $case) {
            $user = User::factory()->create();
            $book = AddressBook::factory()->create([
                'owner_id' => $user->id,
                'uri' => $case['uri'],
            ]);

            $parent = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'Parent'.$index,
                'last_name' => 'Hargrove',
                'pronouns' => $case['parent_pronouns'],
                'pronouns_custom' => '',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $parent->assertCreated();
            $parentId = (int) $parent->json('id');

            $child = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
                'first_name' => 'Child'.$index,
                'last_name' => 'Hargrove',
                'pronouns' => $case['child_pronouns'],
                'pronouns_custom' => '',
                'related_names' => [],
                'address_book_ids' => [$book->id],
            ]));
            $child->assertCreated();
            $childId = (int) $child->json('id');

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$parentId, $this->payload([
                    'first_name' => 'Parent'.$index,
                    'last_name' => 'Hargrove',
                    'pronouns' => $case['parent_pronouns'],
                    'pronouns_custom' => '',
                    'related_names' => [[
                        'label' => $case['source_label'],
                        'custom_label' => null,
                        'value' => 'Child'.$index.' Hargrove',
                        'related_contact_id' => $childId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $childPayload = Contact::query()->findOrFail($childId)->payload;
            $this->assertSame(
                $case['expected_inverse_label'],
                $childPayload['related_names'][0]['label'] ?? null,
            );

            $this->actingAs($user)
                ->patchJson('/api/contacts/'.$childId, $this->payload([
                    'first_name' => 'Child'.$index,
                    'last_name' => 'Hargrove',
                    'pronouns' => $case['child_pronouns'],
                    'pronouns_custom' => '',
                    'related_names' => [[
                        'label' => $case['expected_inverse_label'],
                        'custom_label' => null,
                        'value' => 'Parent'.$index.' Hargrove',
                        'related_contact_id' => $parentId,
                    ]],
                    'address_book_ids' => [$book->id],
                ]))
                ->assertOk();

            $parentPayload = Contact::query()->findOrFail($parentId)->payload;
            $this->assertSame(
                $case['source_label'],
                $parentPayload['related_names'][0]['label'] ?? null,
            );
        }
    }

    public function test_neutral_fallback_is_used_when_pronouns_are_not_inferable(): void
    {
        $user = User::factory()->create();
        $book = AddressBook::factory()->create([
            'owner_id' => $user->id,
            'uri' => 'neutral-fallback-pronouns',
        ]);

        $grandparent = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'NeutralGrandparent',
            'last_name' => 'Hargrove',
            'pronouns' => 'they/them',
            'pronouns_custom' => '',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $grandparent->assertCreated();
        $grandparentId = (int) $grandparent->json('id');

        $grandchild = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'NeutralGrandchild',
            'last_name' => 'Hargrove',
            'pronouns' => 'they/them',
            'pronouns_custom' => '',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $grandchild->assertCreated();
        $grandchildId = (int) $grandchild->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$grandparentId, $this->payload([
                'first_name' => 'NeutralGrandparent',
                'last_name' => 'Hargrove',
                'pronouns' => 'they/them',
                'pronouns_custom' => '',
                'related_names' => [[
                    'label' => 'grandson',
                    'custom_label' => null,
                    'value' => 'NeutralGrandchild Hargrove',
                    'related_contact_id' => $grandchildId,
                ]],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $grandchildPayload = Contact::query()->findOrFail($grandchildId)->payload;
        $this->assertSame('grandparent', $grandchildPayload['related_names'][0]['label'] ?? null);

        $parent = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'NeutralParent',
            'last_name' => 'Hargrove',
            'pronouns' => '',
            'pronouns_custom' => '',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $parent->assertCreated();
        $parentId = (int) $parent->json('id');

        $child = $this->actingAs($user)->postJson('/api/contacts', $this->payload([
            'first_name' => 'NeutralChild',
            'last_name' => 'Hargrove',
            'pronouns' => '',
            'pronouns_custom' => '',
            'related_names' => [],
            'address_book_ids' => [$book->id],
        ]));
        $child->assertCreated();
        $childId = (int) $child->json('id');

        $this->actingAs($user)
            ->patchJson('/api/contacts/'.$parentId, $this->payload([
                'first_name' => 'NeutralParent',
                'last_name' => 'Hargrove',
                'pronouns' => '',
                'pronouns_custom' => '',
                'related_names' => [[
                    'label' => 'daughter',
                    'custom_label' => null,
                    'value' => 'NeutralChild Hargrove',
                    'related_contact_id' => $childId,
                ]],
                'address_book_ids' => [$book->id],
            ]))
            ->assertOk();

        $childPayload = Contact::query()->findOrFail($childId)->payload;
        $this->assertSame('parent', $childPayload['related_names'][0]['label'] ?? null);
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
