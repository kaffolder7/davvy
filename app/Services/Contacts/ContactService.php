<?php

namespace App\Services\Contacts;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Card;
use App\Models\Contact;
use App\Models\ContactAddressBookAssignment;
use App\Models\ResourceShare;
use App\Models\User;
use App\Services\AddressBookMirrorService;
use App\Services\Dav\DavSyncService;
use App\Services\Dav\VCardValidator;
use App\Services\ResourceAccessService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ContactService
{
    private const RELATED_SUPPORTED_LABELS = [
        'spouse',
        'husband',
        'wife',
        'partner',
        'boyfriend',
        'girlfriend',
        'fiance',
        'fiancee',
        'parent',
        'father',
        'mother',
        'dad',
        'mom',
        'child',
        'son',
        'daughter',
        'stepson',
        'stepdaughter',
        'parent_in_law',
        'father_in_law',
        'mother_in_law',
        'child_in_law',
        'son_in_law',
        'daughter_in_law',
        'sibling',
        'brother',
        'sister',
        'sibling_in_law',
        'brother_in_law',
        'sister_in_law',
        'aunt_uncle',
        'aunt',
        'uncle',
        'niece_nephew',
        'niece',
        'nephew',
        'grandparent',
        'grandfather',
        'grandmother',
        'grandchild',
        'grandson',
        'granddaughter',
        'cousin',
        'assistant',
        'friend',
        'other',
    ];

    private const RELATED_LABEL_ALIASES = [
        'spouse' => 'spouse',
        'husband' => 'husband',
        'wife' => 'wife',
        'partner' => 'partner',
        'boyfriend' => 'boyfriend',
        'girlfriend' => 'girlfriend',
        'fiance' => 'fiance',
        'fiancee' => 'fiancee',
        'parent' => 'parent',
        'father' => 'father',
        'mother' => 'mother',
        'dad' => 'dad',
        'mom' => 'mom',
        'child' => 'child',
        'son' => 'son',
        'daughter' => 'daughter',
        'stepson' => 'stepson',
        'step son' => 'stepson',
        'stepdaughter' => 'stepdaughter',
        'step daughter' => 'stepdaughter',
        'parent in law' => 'parent_in_law',
        'father in law' => 'father_in_law',
        'mother in law' => 'mother_in_law',
        'child in law' => 'child_in_law',
        'son in law' => 'son_in_law',
        'daughter in law' => 'daughter_in_law',
        'sibling' => 'sibling',
        'brother' => 'brother',
        'sister' => 'sister',
        'sibling in law' => 'sibling_in_law',
        'brother in law' => 'brother_in_law',
        'sister in law' => 'sister_in_law',
        'aunt uncle' => 'aunt_uncle',
        'aunt or uncle' => 'aunt_uncle',
        'aunt' => 'aunt',
        'uncle' => 'uncle',
        'niece nephew' => 'niece_nephew',
        'niece or nephew' => 'niece_nephew',
        'niece' => 'niece',
        'nephew' => 'nephew',
        'grandparent' => 'grandparent',
        'grand parent' => 'grandparent',
        'grandfather' => 'grandfather',
        'grand father' => 'grandfather',
        'grandmother' => 'grandmother',
        'grand mother' => 'grandmother',
        'grandchild' => 'grandchild',
        'grand child' => 'grandchild',
        'grandson' => 'grandson',
        'grand son' => 'grandson',
        'granddaughter' => 'granddaughter',
        'grand daughter' => 'granddaughter',
        'cousin' => 'cousin',
        'assistant' => 'assistant',
        'friend' => 'friend',
        'other' => 'other',
    ];

    private const RELATED_INVERSE_LABELS = [
        'spouse' => 'spouse',
        'husband' => 'spouse',
        'wife' => 'spouse',
        'partner' => 'partner',
        'boyfriend' => 'partner',
        'girlfriend' => 'partner',
        'fiance' => 'partner',
        'fiancee' => 'partner',
        'parent' => 'child',
        'father' => 'child',
        'mother' => 'child',
        'dad' => 'child',
        'mom' => 'child',
        'child' => 'parent',
        'son' => 'parent',
        'daughter' => 'parent',
        'stepson' => 'parent',
        'stepdaughter' => 'parent',
        'parent_in_law' => 'child_in_law',
        'father_in_law' => 'child_in_law',
        'mother_in_law' => 'child_in_law',
        'child_in_law' => 'parent_in_law',
        'son_in_law' => 'parent_in_law',
        'daughter_in_law' => 'parent_in_law',
        'sibling' => 'sibling',
        'brother' => 'sibling',
        'sister' => 'sibling',
        'sibling_in_law' => 'sibling_in_law',
        'brother_in_law' => 'sibling_in_law',
        'sister_in_law' => 'sibling_in_law',
        'aunt_uncle' => 'niece_nephew',
        'aunt' => 'niece_nephew',
        'uncle' => 'niece_nephew',
        'niece_nephew' => 'aunt_uncle',
        'niece' => 'aunt_uncle',
        'nephew' => 'aunt_uncle',
        'grandparent' => 'grandchild',
        'grandfather' => 'grandchild',
        'grandmother' => 'grandchild',
        'grandchild' => 'grandparent',
        'grandson' => 'grandparent',
        'granddaughter' => 'grandparent',
        'cousin' => 'cousin',
        'assistant' => 'assistant',
        'friend' => 'friend',
        'other' => 'other',
    ];

    private const RELATED_CANONICAL_LABELS = [
        'spouse' => 'spouse',
        'husband' => 'spouse',
        'wife' => 'spouse',
        'partner' => 'partner',
        'boyfriend' => 'partner',
        'girlfriend' => 'partner',
        'fiance' => 'partner',
        'fiancee' => 'partner',
        'parent' => 'parent',
        'father' => 'parent',
        'mother' => 'parent',
        'dad' => 'parent',
        'mom' => 'parent',
        'child' => 'child',
        'son' => 'child',
        'daughter' => 'child',
        'stepson' => 'child',
        'stepdaughter' => 'child',
        'parent_in_law' => 'parent_in_law',
        'father_in_law' => 'parent_in_law',
        'mother_in_law' => 'parent_in_law',
        'child_in_law' => 'child_in_law',
        'son_in_law' => 'child_in_law',
        'daughter_in_law' => 'child_in_law',
        'sibling' => 'sibling',
        'brother' => 'sibling',
        'sister' => 'sibling',
        'sibling_in_law' => 'sibling_in_law',
        'brother_in_law' => 'sibling_in_law',
        'sister_in_law' => 'sibling_in_law',
        'aunt_uncle' => 'aunt_uncle',
        'aunt' => 'aunt_uncle',
        'uncle' => 'aunt_uncle',
        'niece_nephew' => 'niece_nephew',
        'niece' => 'niece_nephew',
        'nephew' => 'niece_nephew',
        'grandparent' => 'grandparent',
        'grandfather' => 'grandparent',
        'grandmother' => 'grandparent',
        'grandchild' => 'grandchild',
        'grandson' => 'grandchild',
        'granddaughter' => 'grandchild',
        'cousin' => 'cousin',
        'assistant' => 'assistant',
        'friend' => 'friend',
        'other' => 'other',
    ];

    private const RELATED_SPOUSE_CANONICAL_LABELS = [
        'spouse',
        'partner',
    ];

    private const RELATED_SPOUSE_PROPAGATION_CANONICAL_LABELS = [
        'child_in_law',
    ];

    public function __construct(
        private readonly ContactVCardService $vCardService,
        private readonly ResourceAccessService $accessService,
        private readonly VCardValidator $vCardValidator,
        private readonly DavSyncService $syncService,
        private readonly AddressBookMirrorService $mirrorService,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
    ) {}

    /**
     * @return Collection<int, Contact>
     */
    public function contactsFor(User $actor): Collection
    {
        $writableAddressBookIds = $this->writableAddressBookIdsFor($actor);

        if ($writableAddressBookIds === []) {
            return collect();
        }

        return Contact::query()
            ->with(['assignments.addressBook'])
            ->whereHas('assignments', function ($query) use ($writableAddressBookIds): void {
                $query->whereIn('address_book_id', $writableAddressBookIds);
            })
            ->whereDoesntHave('assignments', function ($query) use ($writableAddressBookIds): void {
                $query->whereNotIn('address_book_id', $writableAddressBookIds);
            })
            ->orderBy('full_name')
            ->orderBy('id')
            ->get();
    }

    /**
     * @return Collection<int, array{id:int,uri:string,display_name:string,scope:string,owner_name:?string,owner_email:?string}>
     */
    public function writableAddressBooksFor(User $actor): Collection
    {
        $owned = AddressBook::query()
            ->where('owner_id', $actor->id)
            ->orderBy('display_name')
            ->get()
            ->map(fn (AddressBook $book): array => [
                'id' => $book->id,
                'uri' => $book->uri,
                'display_name' => $book->display_name,
                'scope' => 'owned',
                'owner_name' => $actor->name,
                'owner_email' => $actor->email,
            ]);

        $shared = ResourceShare::query()
            ->with(['addressBook', 'owner'])
            ->where('resource_type', ShareResourceType::AddressBook)
            ->where('shared_with_id', $actor->id)
            ->whereIn('permission', [SharePermission::Editor->value, SharePermission::Admin->value])
            ->get()
            ->filter(fn (ResourceShare $share): bool => $share->addressBook !== null)
            ->map(fn (ResourceShare $share): array => [
                'id' => $share->addressBook->id,
                'uri' => $share->addressBook->uri,
                'display_name' => $share->addressBook->display_name,
                'scope' => 'shared',
                'owner_name' => $share->owner?->name,
                'owner_email' => $share->owner?->email,
            ]);

        return $owned
            ->concat($shared)
            ->unique('id')
            ->sortBy('display_name')
            ->values();
    }

    /**
     * @return array<int, int>
     */
    public function writableAddressBookIdsFor(User $actor): array
    {
        return $this->writableAddressBooksFor($actor)
            ->pluck('id')
            ->map(fn (mixed $id): int => (int) $id)
            ->values()
            ->all();
    }

    /**
     * @return array<int, int>
     */
    public function addressBookIdsForContact(Contact $contact): array
    {
        return $contact->assignments()
            ->pluck('address_book_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->values()
            ->all();
    }

    public function canUserWriteContact(User $actor, Contact $contact): bool
    {
        $assignments = $contact->assignments()->with('addressBook')->get();

        if ($assignments->isEmpty()) {
            return false;
        }

        foreach ($assignments as $assignment) {
            $addressBook = $assignment->addressBook;
            if (! $addressBook || ! $this->accessService->userCanWriteAddressBook($actor, $addressBook)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, int>  $addressBookIds
     */
    public function create(User $actor, array $payload, array $addressBookIds): Contact
    {
        $addressBooks = $this->writableAddressBookModels($actor, $addressBookIds);

        $createdResult = DB::transaction(function () use ($actor, $payload, $addressBooks): array {
            $contact = Contact::query()->create([
                'owner_id' => $actor->id,
                'uid' => (string) Str::uuid(),
                'full_name' => $this->vCardService->displayName($payload),
                'payload' => $payload,
            ]);

            $this->syncAssignments($contact, $addressBooks);

            $relatedAddressBookIds = $this->syncBidirectionalRelatedNamesForContact($contact, []);

            return [
                'contact' => $contact->fresh(['assignments.addressBook']),
                'related_address_book_ids' => $relatedAddressBookIds,
            ];
        });

        $this->syncMilestoneCalendarsForAddressBooks(
            [
                ...$addressBooks->pluck('id')->map(fn (mixed $id): int => (int) $id)->all(),
                ...(is_array($createdResult['related_address_book_ids'] ?? null)
                    ? $createdResult['related_address_book_ids']
                    : []),
            ],
        );

        return $createdResult['contact'];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, int>  $addressBookIds
     */
    public function update(User $actor, Contact $contact, array $payload, array $addressBookIds): Contact
    {
        $this->assertCanMutateContact($actor, $contact);

        $addressBooks = $this->writableAddressBookModels($actor, $addressBookIds);

        return $this->persistContactUpdate($contact, $payload, $addressBooks);
    }

    public function delete(User $actor, Contact $contact): void
    {
        $this->assertCanMutateContact($actor, $contact);

        $this->destroyContact($contact);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, int>  $addressBookIds
     */
    public function applyApprovedUpdate(Contact $contact, array $payload, array $addressBookIds): Contact
    {
        $addressBooks = $this->addressBookModelsByIds($addressBookIds);

        return $this->persistContactUpdate($contact, $payload, $addressBooks);
    }

    public function applyApprovedDelete(Contact $contact): void
    {
        $this->destroyContact($contact);
    }

    private function assertCanMutateContact(User $actor, Contact $contact): void
    {
        if (! $this->canUserWriteContact($actor, $contact)) {
            abort(403, 'You cannot modify this contact.');
        }
    }

    /**
     * @param  array<int, int>  $addressBookIds
     * @return Collection<int, AddressBook>
     */
    private function writableAddressBookModels(User $actor, array $addressBookIds): Collection
    {
        $ids = collect($addressBookIds)
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($ids === []) {
            throw ValidationException::withMessages([
                'address_book_ids' => ['Select at least one address book.'],
            ]);
        }

        $books = AddressBook::query()
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        foreach ($ids as $id) {
            $book = $books->get($id);
            if (! $book) {
                throw ValidationException::withMessages([
                    'address_book_ids' => ['One or more selected address books could not be found.'],
                ]);
            }

            if (! $this->accessService->userCanWriteAddressBook($actor, $book)) {
                throw ValidationException::withMessages([
                    'address_book_ids' => [
                        'You do not have write access to one or more selected address books.',
                    ],
                ]);
            }
        }

        return collect($ids)->map(fn (int $id): AddressBook => $books->get($id));
    }

    /**
     * @param  array<int, int>  $addressBookIds
     * @return Collection<int, AddressBook>
     */
    private function addressBookModelsByIds(array $addressBookIds): Collection
    {
        $ids = collect($addressBookIds)
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($ids === []) {
            throw ValidationException::withMessages([
                'address_book_ids' => ['Select at least one address book.'],
            ]);
        }

        $books = AddressBook::query()
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        foreach ($ids as $id) {
            if (! $books->has($id)) {
                throw ValidationException::withMessages([
                    'address_book_ids' => ['One or more selected address books could not be found.'],
                ]);
            }
        }

        return collect($ids)->map(fn (int $id): AddressBook => $books->get($id));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  Collection<int, AddressBook>  $addressBooks
     */
    private function persistContactUpdate(Contact $contact, array $payload, Collection $addressBooks): Contact
    {
        $previousPayload = is_array($contact->payload) ? $contact->payload : [];
        $currentAddressBookIds = $this->addressBookIdsForContact($contact);

        $updatedResult = DB::transaction(function () use (
            $contact,
            $payload,
            $addressBooks,
            $previousPayload
        ): array {
            $contact->update([
                'full_name' => $this->vCardService->displayName($payload),
                'payload' => $payload,
            ]);

            $this->syncAssignments($contact, $addressBooks);

            $relatedAddressBookIds = $this->syncBidirectionalRelatedNamesForContact($contact, $previousPayload);

            return [
                'contact' => $contact->fresh(['assignments.addressBook']),
                'related_address_book_ids' => $relatedAddressBookIds,
            ];
        });

        $this->syncMilestoneCalendarsForAddressBooks([
            ...$currentAddressBookIds,
            ...$addressBooks->pluck('id')->map(fn (mixed $id): int => (int) $id)->all(),
            ...(is_array($updatedResult['related_address_book_ids'] ?? null)
                ? $updatedResult['related_address_book_ids']
                : []),
        ]);

        return $updatedResult['contact'];
    }

    private function destroyContact(Contact $contact): void
    {
        $assignedAddressBookIds = $this->addressBookIdsForContact($contact);
        $relatedAddressBookIds = [];

        DB::transaction(function () use ($contact, &$relatedAddressBookIds): void {
            $relatedAddressBookIds = $this->removeBidirectionalRelatedNamesForContact($contact);

            $assignments = $contact->assignments()->with(['card', 'addressBook'])->get();

            foreach ($assignments as $assignment) {
                $this->deleteAssignmentCard($assignment);
                $assignment->delete();
            }

            $contact->delete();
        });

        $this->syncMilestoneCalendarsForAddressBooks([
            ...$assignedAddressBookIds,
            ...$relatedAddressBookIds,
        ]);
    }

    /**
     * @param  array<string, mixed>  $previousPayload
     * @return array<int, int>
     */
    public function syncBidirectionalRelatedNamesForContact(Contact $sourceContact, array $previousPayload = []): array
    {
        $sourcePayload = is_array($sourceContact->payload) ? $sourceContact->payload : [];
        $currentRows = $this->normalizeRelatedRowsForSync($sourcePayload['related_names'] ?? []);
        $previousRows = $this->normalizeRelatedRowsForSync($previousPayload['related_names'] ?? []);
        $previousLinkedIds = $this->linkedRelatedContactIds($previousRows);

        $linkedRowIndices = [];
        foreach ($currentRows as $index => $row) {
            $relatedContactId = $row['related_contact_id'];
            if ($relatedContactId === null || $relatedContactId <= 0) {
                continue;
            }

            if ($relatedContactId === (int) $sourceContact->id) {
                $currentRows[$index]['related_contact_id'] = null;
                continue;
            }

            if (array_key_exists($relatedContactId, $linkedRowIndices)) {
                // Keep only the first linked row per target contact; later duplicates become free-text.
                $currentRows[$index]['related_contact_id'] = null;
                continue;
            }

            $linkedRowIndices[$relatedContactId] = $index;
        }

        $targetContacts = Contact::query()
            ->whereIn('id', array_keys($linkedRowIndices))
            ->get()
            ->keyBy('id');

        foreach ($linkedRowIndices as $relatedContactId => $index) {
            /** @var Contact|null $targetContact */
            $targetContact = $targetContacts->get($relatedContactId);
            if ($targetContact === null || (int) $targetContact->owner_id !== (int) $sourceContact->owner_id) {
                $currentRows[$index]['related_contact_id'] = null;

                continue;
            }

            $targetName = trim((string) ($targetContact->full_name ?: 'Unnamed Contact'));
            if ($currentRows[$index]['value'] !== $targetName) {
                $currentRows[$index]['value'] = $targetName;
            }
        }

        $activeLinkedRowsByContactId = [];
        foreach ($currentRows as $row) {
            $relatedContactId = $row['related_contact_id'];
            if ($relatedContactId === null || $relatedContactId <= 0) {
                continue;
            }

            /** @var Contact|null $targetContact */
            $targetContact = $targetContacts->get($relatedContactId);
            if ($targetContact === null || (int) $targetContact->owner_id !== (int) $sourceContact->owner_id) {
                continue;
            }

            if (! array_key_exists($relatedContactId, $activeLinkedRowsByContactId)) {
                $activeLinkedRowsByContactId[$relatedContactId] = $row;
            }
        }

        $affectedAddressBookIds = [];
        if (! $this->relatedRowsEqual($currentRows, $sourcePayload['related_names'] ?? [])) {
            $sourcePayload['related_names'] = $currentRows;
            $sourceContact->payload = $sourcePayload;
            $sourceContact->save();

            $this->syncAssignmentsForExistingContact($sourceContact);
            $affectedAddressBookIds = [
                ...$affectedAddressBookIds,
                ...$this->addressBookIdsForContact($sourceContact),
            ];
        }

        $sourceDisplayName = trim((string) ($sourceContact->full_name ?: 'Unnamed Contact'));

        foreach ($activeLinkedRowsByContactId as $relatedContactId => $sourceRow) {
            /** @var Contact|null $targetContact */
            $targetContact = $targetContacts->get($relatedContactId);
            if ($targetContact === null || (int) $targetContact->owner_id !== (int) $sourceContact->owner_id) {
                continue;
            }

            $targetPayload = is_array($targetContact->payload) ? $targetContact->payload : [];
            $targetRows = $this->normalizeRelatedRowsForSync($targetPayload['related_names'] ?? []);
            $nextTargetRows = $this->upsertReciprocalRelatedRow(
                targetRows: $targetRows,
                sourceContact: $sourceContact,
                sourceRow: $sourceRow,
                sourceDisplayName: $sourceDisplayName,
            );

            if ($this->relatedRowsEqual($targetRows, $nextTargetRows)) {
                continue;
            }

            $targetPayload['related_names'] = $nextTargetRows;
            $targetContact->payload = $targetPayload;
            $targetContact->save();

            $this->syncAssignmentsForExistingContact($targetContact);
            $affectedAddressBookIds = [
                ...$affectedAddressBookIds,
                ...$this->addressBookIdsForContact($targetContact),
            ];
        }

        $spouseContactIds = [];
        $propagatedRows = [];
        foreach ($activeLinkedRowsByContactId as $relatedContactId => $sourceRow) {
            $canonical = $this->canonicalRelatedLabelForRow($sourceRow);
            if ($canonical === null) {
                continue;
            }

            if (in_array($canonical, self::RELATED_SPOUSE_CANONICAL_LABELS, true)) {
                $spouseContactIds[$relatedContactId] = $relatedContactId;
            }

            if (in_array($canonical, self::RELATED_SPOUSE_PROPAGATION_CANONICAL_LABELS, true)) {
                $propagatedRows[$relatedContactId] = $sourceRow;
            }
        }

        if ($spouseContactIds !== [] && $propagatedRows !== []) {
            foreach (array_values($spouseContactIds) as $spouseContactId) {
                /** @var Contact|null $spouseContact */
                $spouseContact = $targetContacts->get($spouseContactId);
                if ($spouseContact === null || (int) $spouseContact->owner_id !== (int) $sourceContact->owner_id) {
                    continue;
                }

                $spousePayload = is_array($spouseContact->payload) ? $spouseContact->payload : [];
                $spouseRows = $this->normalizeRelatedRowsForSync($spousePayload['related_names'] ?? []);
                $spouseDisplayName = trim((string) ($spouseContact->full_name ?: 'Unnamed Contact'));

                foreach ($propagatedRows as $targetId => $propagatedSourceRow) {
                    if ($targetId === $spouseContactId || $targetId === (int) $sourceContact->id) {
                        continue;
                    }

                    /** @var Contact|null $propagatedTargetContact */
                    $propagatedTargetContact = $targetContacts->get($targetId);
                    if (
                        $propagatedTargetContact === null
                        || (int) $propagatedTargetContact->owner_id !== (int) $sourceContact->owner_id
                    ) {
                        continue;
                    }

                    $mirroredRow = [
                        'label' => $propagatedSourceRow['label'],
                        'custom_label' => $propagatedSourceRow['custom_label'],
                        'value' => $propagatedSourceRow['value'],
                        'related_contact_id' => $targetId,
                    ];

                    $nextSpouseRows = $this->upsertMirroredRelatedRow(
                        targetRows: $spouseRows,
                        incomingRow: $mirroredRow,
                    );
                    if (! $this->relatedRowsEqual($spouseRows, $nextSpouseRows)) {
                        $spouseRows = $nextSpouseRows;
                    }

                    $propagatedTargetPayload = is_array($propagatedTargetContact->payload)
                        ? $propagatedTargetContact->payload
                        : [];
                    $propagatedTargetRows = $this->normalizeRelatedRowsForSync(
                        $propagatedTargetPayload['related_names'] ?? []
                    );
                    $nextPropagatedTargetRows = $this->upsertReciprocalRelatedRow(
                        targetRows: $propagatedTargetRows,
                        sourceContact: $spouseContact,
                        sourceRow: $mirroredRow,
                        sourceDisplayName: $spouseDisplayName,
                    );

                    if ($this->relatedRowsEqual($propagatedTargetRows, $nextPropagatedTargetRows)) {
                        continue;
                    }

                    $propagatedTargetPayload['related_names'] = $nextPropagatedTargetRows;
                    $propagatedTargetContact->payload = $propagatedTargetPayload;
                    $propagatedTargetContact->save();

                    $this->syncAssignmentsForExistingContact($propagatedTargetContact);
                    $affectedAddressBookIds = [
                        ...$affectedAddressBookIds,
                        ...$this->addressBookIdsForContact($propagatedTargetContact),
                    ];
                }

                if ($this->relatedRowsEqual($spouseRows, $spousePayload['related_names'] ?? [])) {
                    continue;
                }

                $spousePayload['related_names'] = $spouseRows;
                $spouseContact->payload = $spousePayload;
                $spouseContact->save();

                $this->syncAssignmentsForExistingContact($spouseContact);
                $affectedAddressBookIds = [
                    ...$affectedAddressBookIds,
                    ...$this->addressBookIdsForContact($spouseContact),
                ];
            }
        }

        $removedTargetIds = array_diff($previousLinkedIds, array_keys($activeLinkedRowsByContactId));
        if ($removedTargetIds !== []) {
            Contact::query()
                ->whereIn('id', $removedTargetIds)
                ->where('owner_id', $sourceContact->owner_id)
                ->get()
                ->each(function (Contact $targetContact) use (&$affectedAddressBookIds, $sourceContact): void {
                    $targetPayload = is_array($targetContact->payload) ? $targetContact->payload : [];
                    $targetRows = $this->normalizeRelatedRowsForSync($targetPayload['related_names'] ?? []);
                    $nextTargetRows = array_values(array_filter(
                        $targetRows,
                        fn (array $row): bool => $row['related_contact_id'] !== (int) $sourceContact->id
                    ));

                    if ($this->relatedRowsEqual($targetRows, $nextTargetRows)) {
                        return;
                    }

                    $targetPayload['related_names'] = $nextTargetRows;
                    $targetContact->payload = $targetPayload;
                    $targetContact->save();

                    $this->syncAssignmentsForExistingContact($targetContact);
                    $affectedAddressBookIds = [
                        ...$affectedAddressBookIds,
                        ...$this->addressBookIdsForContact($targetContact),
                    ];
                });
        }

        return collect($affectedAddressBookIds)
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @return array<int, int>
     */
    public function removeBidirectionalRelatedNamesForContact(Contact $contact): array
    {
        $payload = is_array($contact->payload) ? $contact->payload : [];
        $rows = $this->normalizeRelatedRowsForSync($payload['related_names'] ?? []);
        $linkedIds = $this->linkedRelatedContactIds($rows);

        if ($linkedIds === []) {
            return [];
        }

        $affectedAddressBookIds = [];

        Contact::query()
            ->whereIn('id', $linkedIds)
            ->where('owner_id', $contact->owner_id)
            ->get()
            ->each(function (Contact $targetContact) use (&$affectedAddressBookIds, $contact): void {
                $targetPayload = is_array($targetContact->payload) ? $targetContact->payload : [];
                $targetRows = $this->normalizeRelatedRowsForSync($targetPayload['related_names'] ?? []);
                $nextTargetRows = array_values(array_filter(
                    $targetRows,
                    fn (array $row): bool => $row['related_contact_id'] !== (int) $contact->id
                ));

                if ($this->relatedRowsEqual($targetRows, $nextTargetRows)) {
                    return;
                }

                $targetPayload['related_names'] = $nextTargetRows;
                $targetContact->payload = $targetPayload;
                $targetContact->save();

                $this->syncAssignmentsForExistingContact($targetContact);
                $affectedAddressBookIds = [
                    ...$affectedAddressBookIds,
                    ...$this->addressBookIdsForContact($targetContact),
                ];
            });

        return collect($affectedAddressBookIds)
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, AddressBook>  $addressBooks
     */
    private function syncAssignments(Contact $contact, Collection $addressBooks): void
    {
        $existing = $contact->assignments()
            ->with(['card', 'addressBook'])
            ->get()
            ->keyBy('address_book_id');

        $desired = $addressBooks->keyBy('id');

        foreach ($existing as $addressBookId => $assignment) {
            if (! $desired->has($addressBookId)) {
                $this->deleteAssignmentCard($assignment);
                $assignment->delete();
            }
        }

        foreach ($addressBooks as $addressBook) {
            /** @var ContactAddressBookAssignment|null $assignment */
            $assignment = $existing->get($addressBook->id);

            if (! $assignment) {
                $this->createAssignment($contact, $addressBook);

                continue;
            }

            $this->upsertAssignmentCard($contact, $addressBook, $assignment);
        }
    }

    private function createAssignment(Contact $contact, AddressBook $addressBook): void
    {
        $cardData = $this->normalizedCardData($contact);
        $this->assertNoUidConflict($addressBook, $contact->uid);

        $uri = $this->nextAvailableCardUri($addressBook, $contact, null, null);
        $etag = md5($cardData);

        $card = Card::query()->create([
            'address_book_id' => $addressBook->id,
            'uri' => $uri,
            'uid' => $contact->uid,
            'etag' => $etag,
            'size' => strlen($cardData),
            'data' => $cardData,
        ]);

        $this->syncService->recordAdded(ShareResourceType::AddressBook, $addressBook->id, $card->uri);
        $this->mirrorService->handleSourceCardUpsert($addressBook, $card);

        $contact->assignments()->create([
            'address_book_id' => $addressBook->id,
            'card_id' => $card->id,
            'card_uri' => $card->uri,
        ]);
    }

    private function upsertAssignmentCard(Contact $contact, AddressBook $addressBook, ContactAddressBookAssignment $assignment): void
    {
        $cardData = $this->normalizedCardData($contact);

        $card = $assignment->card;
        if (! $card) {
            $this->assertNoUidConflict($addressBook, $contact->uid);

            $preferredUri = $assignment->card_uri !== '' ? $assignment->card_uri : null;
            $uri = $this->nextAvailableCardUri($addressBook, $contact, $preferredUri, null);
            $etag = md5($cardData);

            $card = Card::query()->create([
                'address_book_id' => $addressBook->id,
                'uri' => $uri,
                'uid' => $contact->uid,
                'etag' => $etag,
                'size' => strlen($cardData),
                'data' => $cardData,
            ]);

            $assignment->update([
                'card_id' => $card->id,
                'card_uri' => $card->uri,
            ]);

            $this->syncService->recordAdded(ShareResourceType::AddressBook, $addressBook->id, $card->uri);
            $this->mirrorService->handleSourceCardUpsert($addressBook, $card);

            return;
        }

        $this->assertNoUidConflict($addressBook, $contact->uid, $card->id);

        $etag = md5($cardData);

        $card->update([
            'uid' => $contact->uid,
            'etag' => $etag,
            'size' => strlen($cardData),
            'data' => $cardData,
        ]);

        $this->syncService->recordModified(ShareResourceType::AddressBook, $addressBook->id, $card->uri);
        $card->fill([
            'uid' => $contact->uid,
            'etag' => $etag,
            'size' => strlen($cardData),
            'data' => $cardData,
        ]);
        $this->mirrorService->handleSourceCardUpsert($addressBook, $card);

        if ($assignment->card_uri !== $card->uri) {
            $assignment->update([
                'card_uri' => $card->uri,
            ]);
        }
    }

    private function deleteAssignmentCard(ContactAddressBookAssignment $assignment): void
    {
        $card = $assignment->card;
        if (! $card) {
            return;
        }

        $card->delete();

        $this->syncService->recordDeleted(ShareResourceType::AddressBook, $assignment->address_book_id, $card->uri);
        $this->mirrorService->handleSourceCardDeleted($assignment->address_book_id, $card->uri);
    }

    private function assertNoUidConflict(AddressBook $addressBook, string $uid, ?int $exceptCardId = null): void
    {
        $query = Card::query()
            ->where('address_book_id', $addressBook->id)
            ->where('uid', $uid);

        if ($exceptCardId !== null) {
            $query->where('id', '!=', $exceptCardId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'address_book_ids' => [
                    sprintf(
                        'A contact with UID "%s" already exists in "%s".',
                        $uid,
                        $addressBook->display_name,
                    ),
                ],
            ]);
        }
    }

    private function normalizedCardData(Contact $contact): string
    {
        $raw = $this->vCardService->build($contact);
        $normalized = $this->vCardValidator->validateAndNormalize($raw);

        return $normalized['data'];
    }

    private function nextAvailableCardUri(
        AddressBook $addressBook,
        Contact $contact,
        ?string $preferredUri,
        ?int $exceptCardId,
    ): string {
        $candidate = $this->sanitizeCardUri($preferredUri);

        if ($candidate !== null && ! $this->cardUriExists($addressBook->id, $candidate, $exceptCardId)) {
            return $candidate;
        }

        $base = Str::slug($contact->full_name ?? '') ?: 'contact';
        $base .= '-'.substr(sha1($contact->uid), 0, 8);

        $attempt = 0;
        do {
            $suffix = $attempt === 0 ? '' : '-'.$attempt;
            $candidate = $base.$suffix.'.vcf';
            $attempt++;
        } while ($this->cardUriExists($addressBook->id, $candidate, $exceptCardId));

        return $candidate;
    }

    private function sanitizeCardUri(?string $value): ?string
    {
        $uri = trim((string) ($value ?? ''));
        if ($uri === '') {
            return null;
        }

        $uri = preg_replace('/\s+/', '-', $uri) ?? '';
        $uri = trim($uri);
        if ($uri === '') {
            return null;
        }

        return str_ends_with(strtolower($uri), '.vcf') ? $uri : $uri.'.vcf';
    }

    private function cardUriExists(int $addressBookId, string $uri, ?int $exceptCardId): bool
    {
        $query = Card::query()
            ->where('address_book_id', $addressBookId)
            ->where('uri', $uri);

        if ($exceptCardId !== null) {
            $query->where('id', '!=', $exceptCardId);
        }

        return $query->exists();
    }

    private function syncAssignmentsForExistingContact(Contact $contact): void
    {
        $addressBookIds = $this->addressBookIdsForContact($contact);
        if ($addressBookIds === []) {
            return;
        }

        $addressBooksById = AddressBook::query()
            ->whereIn('id', $addressBookIds)
            ->get()
            ->keyBy('id');

        $orderedAddressBooks = collect($addressBookIds)
            ->map(fn (int $id): ?AddressBook => $addressBooksById->get($id))
            ->filter(fn (?AddressBook $book): bool => $book !== null)
            ->values();

        if ($orderedAddressBooks->isEmpty()) {
            return;
        }

        $this->syncAssignments($contact, $orderedAddressBooks);
    }

    /**
     * @param  mixed  $rows
     * @return array<int, array{label:string, custom_label:?string, value:string, related_contact_id:?int}>
     */
    private function normalizeRelatedRowsForSync(mixed $rows): array
    {
        if (! is_array($rows)) {
            return [];
        }

        return collect($rows)
            ->filter(fn (mixed $row): bool => is_array($row))
            ->map(function (array $row): array {
                return [
                    'label' => strtolower($this->normalizeString($row['label'] ?? null) ?? 'other'),
                    'custom_label' => $this->normalizeString($row['custom_label'] ?? null),
                    'value' => $this->normalizeString($row['value'] ?? null) ?? '',
                    'related_contact_id' => $this->normalizeInt($row['related_contact_id'] ?? null),
                ];
            })
            ->filter(fn (array $row): bool => $row['value'] !== '' || $row['related_contact_id'] !== null)
            ->values()
            ->all();
    }

    /**
     * @param  array<int, array{label:string, custom_label:?string, value:string, related_contact_id:?int}>  $rows
     * @return array<int, int>
     */
    private function linkedRelatedContactIds(array $rows): array
    {
        return collect($rows)
            ->map(fn (array $row): ?int => $row['related_contact_id'])
            ->filter(fn (?int $id): bool => $id !== null && $id > 0)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, array{label:string, custom_label:?string, value:string, related_contact_id:?int}>  $targetRows
     * @param  array{label:string, custom_label:?string, value:string, related_contact_id:?int}  $sourceRow
     * @return array<int, array{label:string, custom_label:?string, value:string, related_contact_id:?int}>
     */
    private function upsertReciprocalRelatedRow(
        array $targetRows,
        Contact $sourceContact,
        array $sourceRow,
        string $sourceDisplayName,
    ): array {
        $inverse = $this->inverseLabelForRelatedRow($sourceRow);
        $reciprocalRow = [
            'label' => $inverse['label'],
            'custom_label' => $inverse['custom_label'],
            'value' => $sourceDisplayName,
            'related_contact_id' => (int) $sourceContact->id,
        ];

        $matchingIndices = collect($targetRows)
            ->map(fn (array $row, int $index): array => ['row' => $row, 'index' => $index])
            ->filter(fn (array $item): bool => ($item['row']['related_contact_id'] ?? null) === (int) $sourceContact->id)
            ->pluck('index')
            ->values()
            ->all();

        if ($matchingIndices === []) {
            $targetRows[] = $reciprocalRow;

            return array_values($targetRows);
        }

        $primaryIndex = (int) $matchingIndices[0];
        $existingRow = $targetRows[$primaryIndex];
        $targetRows[$primaryIndex] = $this->mergedReciprocalRow(
            existingRow: $existingRow,
            incomingRow: $reciprocalRow,
        );

        $duplicateIndices = array_slice($matchingIndices, 1);
        if ($duplicateIndices !== []) {
            $targetRows = collect($targetRows)
                ->reject(fn (array $row, int $index): bool => in_array($index, $duplicateIndices, true))
                ->values()
                ->all();
        }

        return array_values($targetRows);
    }

    /**
     * @param  array{label:string, custom_label:?string, value:string, related_contact_id:?int}  $existingRow
     * @param  array{label:string, custom_label:?string, value:string, related_contact_id:?int}  $incomingRow
     * @return array{label:string, custom_label:?string, value:string, related_contact_id:?int}
     */
    private function mergedReciprocalRow(array $existingRow, array $incomingRow): array
    {
        [$existingToken] = $this->relatedLabelTokenAndDisplay($existingRow);
        [$incomingToken] = $this->relatedLabelTokenAndDisplay($incomingRow);

        if (! $this->shouldPreserveExistingSpecificReciprocalLabel($existingToken, $incomingToken)) {
            return $incomingRow;
        }

        return [
            'label' => $existingRow['label'],
            'custom_label' => $existingRow['custom_label'],
            'value' => $incomingRow['value'],
            'related_contact_id' => $incomingRow['related_contact_id'],
        ];
    }

    private function shouldPreserveExistingSpecificReciprocalLabel(
        ?string $existingToken,
        ?string $incomingToken,
    ): bool {
        if ($existingToken === null || $incomingToken === null) {
            return false;
        }

        $existingCanonical = self::RELATED_CANONICAL_LABELS[$existingToken] ?? null;
        $incomingCanonical = self::RELATED_CANONICAL_LABELS[$incomingToken] ?? null;
        if ($existingCanonical === null || $incomingCanonical === null) {
            return false;
        }

        if ($existingCanonical !== $incomingCanonical) {
            return false;
        }

        $incomingIsGeneric = $incomingToken === $incomingCanonical;
        $existingIsSpecific = $existingToken !== $existingCanonical;

        return $incomingIsGeneric && $existingIsSpecific;
    }

    /**
     * @param  array{label:string, custom_label:?string, value:string, related_contact_id:?int}  $row
     */
    private function canonicalRelatedLabelForRow(array $row): ?string
    {
        [$token] = $this->relatedLabelTokenAndDisplay($row);
        if ($token === null) {
            return null;
        }

        return self::RELATED_CANONICAL_LABELS[$token] ?? null;
    }

    /**
     * @param  array<int, array{label:string, custom_label:?string, value:string, related_contact_id:?int}>  $targetRows
     * @param  array{label:string, custom_label:?string, value:string, related_contact_id:?int}  $incomingRow
     * @return array<int, array{label:string, custom_label:?string, value:string, related_contact_id:?int}>
     */
    private function upsertMirroredRelatedRow(array $targetRows, array $incomingRow): array
    {
        $incomingRelatedContactId = $incomingRow['related_contact_id'] ?? null;
        if ($incomingRelatedContactId === null || $incomingRelatedContactId <= 0) {
            return array_values($targetRows);
        }

        $matchingIndices = collect($targetRows)
            ->map(fn (array $row, int $index): array => ['row' => $row, 'index' => $index])
            ->filter(fn (array $item): bool => ($item['row']['related_contact_id'] ?? null) === $incomingRelatedContactId)
            ->pluck('index')
            ->values()
            ->all();

        if ($matchingIndices === []) {
            $targetRows[] = $incomingRow;

            return array_values($targetRows);
        }

        $primaryIndex = (int) $matchingIndices[0];
        $existingRow = $targetRows[$primaryIndex];
        $targetRows[$primaryIndex] = $this->mergedReciprocalRow(
            existingRow: $existingRow,
            incomingRow: $incomingRow,
        );

        $duplicateIndices = array_slice($matchingIndices, 1);
        if ($duplicateIndices !== []) {
            $targetRows = collect($targetRows)
                ->reject(fn (array $row, int $index): bool => in_array($index, $duplicateIndices, true))
                ->values()
                ->all();
        }

        return array_values($targetRows);
    }

    /**
     * @param  array{label:string, custom_label:?string, value:string, related_contact_id:?int}  $row
     * @return array{label:string, custom_label:?string}
     */
    private function inverseLabelForRelatedRow(array $row): array
    {
        [$token, $displayLabel] = $this->relatedLabelTokenAndDisplay($row);
        if ($token === null) {
            return [
                'label' => 'custom',
                'custom_label' => $displayLabel,
            ];
        }

        $inverseToken = self::RELATED_INVERSE_LABELS[$token] ?? $token;
        if (in_array($inverseToken, self::RELATED_SUPPORTED_LABELS, true)) {
            return [
                'label' => $inverseToken,
                'custom_label' => null,
            ];
        }

        return [
            'label' => 'custom',
            'custom_label' => $displayLabel,
        ];
    }

    /**
     * @param  array{label:string, custom_label:?string, value:string, related_contact_id:?int}  $row
     * @return array{0:?string,1:?string}
     */
    private function relatedLabelTokenAndDisplay(array $row): array
    {
        $label = strtolower($this->normalizeString($row['label'] ?? null) ?? 'other');
        if ($label === 'custom') {
            $customLabel = $this->normalizeString($row['custom_label'] ?? null);
            if ($customLabel === null) {
                return [null, null];
            }

            return [
                $this->normalizeRelatedLabelToken($customLabel),
                $customLabel,
            ];
        }

        return [
            $this->normalizeRelatedLabelToken($label) ?? $label,
            $label,
        ];
    }

    private function normalizeRelatedLabelToken(?string $value): ?string
    {
        $normalized = strtolower(trim((string) ($value ?? '')));
        if ($normalized === '') {
            return null;
        }

        $normalized = str_replace(['_', '-', '/', '&'], ' ', $normalized);
        $normalized = trim(preg_replace('/\s+/', ' ', $normalized) ?? '');
        if ($normalized === '') {
            return null;
        }

        return self::RELATED_LABEL_ALIASES[$normalized] ?? null;
    }

    /**
     * @param  array<int, array{label:string, custom_label:?string, value:string, related_contact_id:?int}>  $leftRows
     */
    private function relatedRowsEqual(array $leftRows, mixed $rightRows): bool
    {
        return $leftRows === $this->normalizeRelatedRowsForSync($rightRows);
    }

    private function normalizeString(mixed $value): ?string
    {
        if (! is_scalar($value) && $value !== null) {
            return null;
        }

        $normalized = trim((string) ($value ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value)) {
            return $value;
        }

        if (is_string($value) && preg_match('/^-?\d+$/', $value) === 1) {
            return (int) $value;
        }

        return null;
    }

    /**
     * @param  array<int, int>  $addressBookIds
     */
    private function syncMilestoneCalendarsForAddressBooks(array $addressBookIds): void
    {
        try {
            $this->milestoneCalendarService->syncAddressBooksByIds($addressBookIds);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }
}
