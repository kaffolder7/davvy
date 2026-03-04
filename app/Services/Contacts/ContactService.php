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
        $contacts = Contact::query()
            ->where('owner_id', $actor->id)
            ->with(['assignments.addressBook'])
            ->orderBy('full_name')
            ->orderBy('id')
            ->get();

        foreach ($contacts as $contact) {
            $this->pruneInaccessibleAssignments($actor, $contact);
        }

        return $contacts->map(fn (Contact $contact): Contact => $contact->fresh(['assignments.addressBook']));
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
     * @param  array<string, mixed>  $payload
     * @param  array<int, int>  $addressBookIds
     */
    public function create(User $actor, array $payload, array $addressBookIds): Contact
    {
        $addressBooks = $this->writableAddressBookModels($actor, $addressBookIds);

        $created = DB::transaction(function () use ($actor, $payload, $addressBooks): Contact {
            $contact = Contact::query()->create([
                'owner_id' => $actor->id,
                'uid' => (string) Str::uuid(),
                'full_name' => $this->vCardService->displayName($payload),
                'payload' => $payload,
            ]);

            $this->syncAssignments($contact, $addressBooks);

            return $contact->fresh(['assignments.addressBook']);
        });

        $this->syncMilestoneCalendarsForAddressBooks(
            $addressBooks->pluck('id')->map(fn (mixed $id): int => (int) $id)->all(),
        );

        return $created;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, int>  $addressBookIds
     */
    public function update(User $actor, Contact $contact, array $payload, array $addressBookIds): Contact
    {
        $this->assertOwnership($actor, $contact);
        $this->pruneInaccessibleAssignments($actor, $contact);

        $currentAddressBookIds = $contact->assignments()
            ->pluck('address_book_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->all();
        $addressBooks = $this->writableAddressBookModels($actor, $addressBookIds);

        $updated = DB::transaction(function () use ($contact, $payload, $addressBooks): Contact {
            $contact->update([
                'full_name' => $this->vCardService->displayName($payload),
                'payload' => $payload,
            ]);

            $this->syncAssignments($contact, $addressBooks);

            return $contact->fresh(['assignments.addressBook']);
        });

        $this->syncMilestoneCalendarsForAddressBooks([
            ...$currentAddressBookIds,
            ...$addressBooks->pluck('id')->map(fn (mixed $id): int => (int) $id)->all(),
        ]);

        return $updated;
    }

    public function delete(User $actor, Contact $contact): void
    {
        $this->assertOwnership($actor, $contact);
        $this->pruneInaccessibleAssignments($actor, $contact);

        $assignedAddressBookIds = $contact->assignments()
            ->pluck('address_book_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->all();

        DB::transaction(function () use ($contact): void {
            $assignments = $contact->assignments()->with(['card', 'addressBook'])->get();

            foreach ($assignments as $assignment) {
                $this->deleteAssignmentCard($assignment);
                $assignment->delete();
            }

            $contact->delete();
        });

        $this->syncMilestoneCalendarsForAddressBooks($assignedAddressBookIds);
    }

    private function assertOwnership(User $actor, Contact $contact): void
    {
        if ($contact->owner_id !== $actor->id) {
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

    private function pruneInaccessibleAssignments(User $actor, Contact $contact): void
    {
        $assignments = $contact->assignments()->with('addressBook')->get();

        foreach ($assignments as $assignment) {
            $addressBook = $assignment->addressBook;
            if (! $addressBook || ! $this->accessService->userCanWriteAddressBook($actor, $addressBook)) {
                $assignment->delete();
            }
        }
    }
}
