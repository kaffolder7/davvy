<?php

namespace App\Services\Dav\Backends;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Card;
use App\Models\ResourceShare;
use App\Services\AddressBookMirrorService;
use App\Services\Contacts\ContactChangeRequestService;
use App\Services\Contacts\ContactMilestoneCalendarService;
use App\Services\Contacts\ManagedContactSyncService;
use App\Services\Dav\DavSyncService;
use App\Services\Dav\VCardValidator;
use App\Services\DavRequestContext;
use App\Services\PrincipalUriService;
use App\Services\ResourceAccessService;
use App\Services\ResourceDeletionService;
use Illuminate\Database\QueryException;
use Illuminate\Support\Str;
use Sabre\CardDAV\Backend\AbstractBackend;
use Sabre\CardDAV\Backend\SyncSupport;
use Sabre\DAV\Exception\BadRequest;
use Sabre\DAV\Exception\Conflict;
use Sabre\DAV\Exception\Forbidden;
use Sabre\DAV\Exception\InvalidSyncToken;
use Sabre\DAV\Exception\NotFound;
use Sabre\DAV\PropPatch;
use Throwable;

class LaravelCardDavBackend extends AbstractBackend implements SyncSupport
{
    public function __construct(
        private readonly PrincipalUriService $principalUriService,
        private readonly ResourceAccessService $accessService,
        private readonly DavRequestContext $davContext,
        private readonly VCardValidator $vCardValidator,
        private readonly DavSyncService $syncService,
        private readonly AddressBookMirrorService $mirrorService,
        private readonly ManagedContactSyncService $managedContactSync,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
        private readonly ContactChangeRequestService $changeRequestService,
        private readonly ResourceDeletionService $resourceDeletion,
    ) {}

    /**
     * Returns address books for user.
     *
     * @param  mixed  $principalUri
     * @return array
     */
    public function getAddressBooksForUser($principalUri): array
    {
        $owner = $this->principalUriService->userFromPrincipalUri($principalUri);

        if (! $owner) {
            return [];
        }

        $own = AddressBook::query()
            ->where('owner_id', $owner->id)
            ->get()
            ->map(fn (AddressBook $addressBook): array => $this->transformAddressBook($addressBook, SharePermission::Admin, $principalUri))
            ->all();

        $shared = ResourceShare::query()
            ->with('addressBook')
            ->where('resource_type', ShareResourceType::AddressBook)
            ->where('shared_with_id', $owner->id)
            ->get()
            ->filter(fn (ResourceShare $share): bool => $share->addressBook !== null)
            ->map(function (ResourceShare $share) use ($principalUri): array {
                return $this->transformAddressBook($share->addressBook, $share->permission, $principalUri);
            })
            ->all();

        return [...$own, ...$shared];
    }

    /**
     * Updates address book.
     *
     * @param  mixed  $addressBookId
     * @param  PropPatch  $propPatch
     * @return void
     */
    public function updateAddressBook($addressBookId, PropPatch $propPatch): void
    {
        $addressBook = AddressBook::query()->find($addressBookId);

        if (! $addressBook) {
            throw new NotFound('Address book not found.');
        }

        $this->assertWritableAddressBook($addressBook);

        $propPatch->handle([
            '{DAV:}displayname',
            '{urn:ietf:params:xml:ns:carddav}addressbook-description',
        ], function (array $mutations) use ($addressBook): bool {
            if (array_key_exists('{DAV:}displayname', $mutations)) {
                $addressBook->display_name = (string) $mutations['{DAV:}displayname'];
            }

            if (array_key_exists('{urn:ietf:params:xml:ns:carddav}addressbook-description', $mutations)) {
                $addressBook->description = $mutations['{urn:ietf:params:xml:ns:carddav}addressbook-description'];
            }

            $addressBook->save();
            $this->milestoneCalendarService->handleAddressBookRenamed($addressBook->fresh());

            return true;
        });
    }

    /**
     * Creates address book.
     *
     * @param  mixed  $principalUri
     * @param  mixed  $url
     * @param  array  $properties
     * @return void
     */
    public function createAddressBook($principalUri, $url, array $properties): void
    {
        $user = $this->principalUriService->userFromPrincipalUri($principalUri);

        if (! $user) {
            throw new NotFound('Principal does not exist.');
        }

        $addressBook = AddressBook::query()->create([
            'owner_id' => $user->id,
            'uri' => Str::slug((string) $url),
            'display_name' => (string) ($properties['{DAV:}displayname'] ?? 'Address Book'),
            'description' => $properties['{urn:ietf:params:xml:ns:carddav}addressbook-description'] ?? null,
            'is_default' => false,
            'is_sharable' => false,
        ]);

        $this->syncService->ensureResource(ShareResourceType::AddressBook, $addressBook->id);
    }

    /**
     * Deletes address book.
     *
     * @param  mixed  $addressBookId
     * @return void
     */
    public function deleteAddressBook($addressBookId): void
    {
        $addressBook = AddressBook::query()->find($addressBookId);

        if (! $addressBook) {
            return;
        }

        $this->assertDeletableAddressBook($addressBook);

        $this->resourceDeletion->deleteAddressBook($addressBook);
    }

    /**
     * Returns cards.
     *
     * @param  mixed  $addressBookId
     * @return array
     */
    public function getCards($addressBookId): array
    {
        $addressBook = $this->loadReadableAddressBook($addressBookId);

        return Card::query()
            ->where('address_book_id', $addressBook->id)
            ->orderBy('id')
            ->get()
            ->map(fn (Card $card): array => $this->transformCard($card, withData: false))
            ->all();
    }

    /**
     * Returns card.
     *
     * @param  mixed  $addressBookId
     * @param  mixed  $cardUri
     * @return array|null
     */
    public function getCard($addressBookId, $cardUri): ?array
    {
        $addressBook = $this->loadReadableAddressBook($addressBookId);

        $card = Card::query()
            ->where('address_book_id', $addressBook->id)
            ->where('uri', $cardUri)
            ->first();

        if (! $card) {
            return null;
        }

        return $this->transformCard($card, withData: true);
    }

    /**
     * Returns multiple cards.
     *
     * @param  mixed  $addressBookId
     * @param  array  $uris
     * @return array
     */
    public function getMultipleCards($addressBookId, array $uris): array
    {
        $addressBook = $this->loadReadableAddressBook($addressBookId);

        return Card::query()
            ->where('address_book_id', $addressBook->id)
            ->whereIn('uri', $uris)
            ->get()
            ->map(fn (Card $card): array => $this->transformCard($card, withData: true))
            ->all();
    }

    /**
     * Creates card.
     *
     * @param  mixed  $addressBookId
     * @param  mixed  $cardUri
     * @param  mixed  $cardData
     * @return string
     */
    public function createCard($addressBookId, $cardUri, $cardData): string
    {
        $addressBook = AddressBook::query()->find($addressBookId);

        if (! $addressBook) {
            throw new NotFound('Address book not found.');
        }

        $this->assertWritableAddressBook($addressBook);

        $existing = Card::query()
            ->where('address_book_id', $addressBook->id)
            ->where('uri', $cardUri)
            ->exists();

        if ($existing) {
            throw new BadRequest('Card already exists for the requested URI.');
        }

        $normalized = $this->vCardValidator->validateAndNormalize((string) $cardData);
        $resourceUid = $normalized['uid'] ?? $this->fallbackUidForLegacyPayload((string) $cardUri);

        if ($this->uidConflictExists($addressBook->id, $resourceUid)) {
            throw new Conflict('A contact with the same UID already exists in this address book.');
        }

        $etag = md5($normalized['data']);

        try {
            $card = Card::query()->create([
                'address_book_id' => $addressBook->id,
                'uri' => $cardUri,
                'uid' => $resourceUid,
                'etag' => $etag,
                'size' => strlen($normalized['data']),
                'data' => $normalized['data'],
            ]);
        } catch (QueryException $exception) {
            if ($this->isUidUniqueConstraintViolation($exception)) {
                throw new Conflict('A contact with the same UID already exists in this address book.');
            }

            throw $exception;
        }

        $this->syncService->recordAdded(ShareResourceType::AddressBook, $addressBook->id, (string) $cardUri);
        $this->mirrorService->handleSourceCardUpsert($addressBook, $card);
        $this->syncManagedContactUpsert($addressBook, $card);

        return '"'.$etag.'"';
    }

    /**
     * Updates card.
     *
     * @param  mixed  $addressBookId
     * @param  mixed  $cardUri
     * @param  mixed  $cardData
     * @return string
     */
    public function updateCard($addressBookId, $cardUri, $cardData): string
    {
        $addressBook = AddressBook::query()->find($addressBookId);

        if (! $addressBook) {
            throw new NotFound('Address book not found.');
        }

        $this->assertWritableAddressBook($addressBook);

        $card = Card::query()
            ->where('address_book_id', $addressBook->id)
            ->where('uri', $cardUri)
            ->first();

        if (! $card) {
            throw new NotFound('Card not found.');
        }

        $user = $this->davContext->getAuthenticatedUser();
        $mirroredEtag = $this->mirrorService->updateSourceFromMirroredCard(
            actor: $user,
            mirroredCard: $card,
            incomingCardData: (string) $cardData,
        );
        if ($mirroredEtag !== null) {
            return '"'.$mirroredEtag.'"';
        }

        $normalized = $this->vCardValidator->validateAndNormalize((string) $cardData);

        if ($user) {
            $queued = $this->changeRequestService->enqueueCardDavUpdateIfNeeded(
                actor: $user,
                addressBook: $addressBook,
                card: $card,
                normalizedCardData: $normalized['data'],
            );

            if ($queued !== null) {
                throw new Conflict('Change submitted for owner/admin approval.');
            }
        }

        $resourceUid = $normalized['uid'] ?? $this->fallbackUidForLegacyPayload((string) $cardUri);

        if ($this->uidConflictExists($addressBook->id, $resourceUid, exceptCardId: $card->id)) {
            throw new Conflict('A contact with the same UID already exists in this address book.');
        }

        $etag = md5($normalized['data']);

        try {
            $card->update([
                'uid' => $resourceUid,
                'etag' => $etag,
                'size' => strlen($normalized['data']),
                'data' => $normalized['data'],
            ]);
        } catch (QueryException $exception) {
            if ($this->isUidUniqueConstraintViolation($exception)) {
                throw new Conflict('A contact with the same UID already exists in this address book.');
            }

            throw $exception;
        }

        $this->syncService->recordModified(ShareResourceType::AddressBook, $addressBook->id, (string) $cardUri);
        $card->fill([
            'uid' => $resourceUid,
            'etag' => $etag,
            'size' => strlen($normalized['data']),
            'data' => $normalized['data'],
        ]);
        $this->mirrorService->handleSourceCardUpsert($addressBook, $card);
        $this->syncManagedContactUpsert($addressBook, $card);

        return '"'.$etag.'"';
    }

    /**
     * Deletes card.
     *
     * @param  mixed  $addressBookId
     * @param  mixed  $cardUri
     * @return void
     */
    public function deleteCard($addressBookId, $cardUri): void
    {
        $addressBook = AddressBook::query()->find($addressBookId);

        if (! $addressBook) {
            return;
        }

        $this->assertWritableAddressBook($addressBook);

        $card = Card::query()
            ->where('address_book_id', $addressBook->id)
            ->where('uri', $cardUri)
            ->first();

        if (! $card) {
            return;
        }

        $user = $this->davContext->getAuthenticatedUser();
        if ($this->mirrorService->deleteSourceFromMirroredCard($user, $card)) {
            return;
        }

        if ($user) {
            $queued = $this->changeRequestService->enqueueCardDavDeleteIfNeeded($user, $addressBook, $card);

            if ($queued !== null) {
                throw new Conflict('Delete submitted for owner/admin approval.');
            }
        }

        $this->syncManagedContactDelete($card);
        $card->delete();

        $this->syncService->recordDeleted(ShareResourceType::AddressBook, $addressBook->id, (string) $cardUri);
        $this->mirrorService->handleSourceCardDeleted($addressBook->id, (string) $cardUri);
    }

    /**
     * Returns changes for address book.
     *
     * @param  mixed  $addressBookId
     * @param  mixed  $syncToken
     * @param  mixed  $syncLevel
     * @param  mixed  $limit
     * @return array
     */
    public function getChangesForAddressBook($addressBookId, $syncToken, $syncLevel, $limit = null): array
    {
        $addressBook = $this->loadReadableAddressBook($addressBookId);

        if ($this->isInitialSyncRequest($syncToken)) {
            return [
                'syncToken' => (string) $this->syncService->currentToken(
                    resourceType: ShareResourceType::AddressBook,
                    resourceId: $addressBook->id,
                ),
                'added' => Card::query()
                    ->where('address_book_id', $addressBook->id)
                    ->orderBy('id')
                    ->pluck('uri')
                    ->all(),
                'modified' => [],
                'deleted' => [],
            ];
        }

        return $this->syncService->getChangesSince(
            resourceType: ShareResourceType::AddressBook,
            resourceId: $addressBook->id,
            syncToken: $this->parseSyncToken($syncToken),
            limit: $limit !== null ? (int) $limit : null,
        );
    }

    /**
     * Returns transform address book.
     *
     * @param  AddressBook  $addressBook
     * @param  SharePermission  $permission
     * @param  string  $principalUri
     * @return array
     */
    private function transformAddressBook(AddressBook $addressBook, SharePermission $permission, string $principalUri): array
    {
        $syncToken = (string) $this->syncService->currentToken(
            resourceType: ShareResourceType::AddressBook,
            resourceId: $addressBook->id,
        );

        return [
            'id' => $addressBook->id,
            'uri' => $addressBook->uri,
            'principaluri' => $principalUri,
            '{DAV:}displayname' => $addressBook->display_name,
            '{urn:ietf:params:xml:ns:carddav}addressbook-description' => $addressBook->description ?? '',
            '{http://sabredav.org/ns}sync-token' => $syncToken,
            '{http://calendarserver.org/ns/}getctag' => $syncToken,
            '{http://sabredav.org/ns}read-only' => ! $permission->canWrite(),
        ];
    }

    /**
     * Checks whether initial sync request.
     *
     * @param  mixed  $syncToken
     * @return bool
     */
    private function isInitialSyncRequest(mixed $syncToken): bool
    {
        if ($syncToken === null) {
            return true;
        }

        return is_string($syncToken) && trim($syncToken) === '';
    }

    /**
     * Returns transform card.
     *
     * @param  Card  $card
     * @param  bool  $withData
     * @return array
     */
    private function transformCard(Card $card, bool $withData): array
    {
        $data = [
            'id' => $card->id,
            'uri' => $card->uri,
            'lastmodified' => $card->updated_at?->timestamp ?? time(),
            'etag' => '"'.$card->etag.'"',
            'size' => $card->size,
        ];

        if ($withData) {
            $data['carddata'] = $card->data;
        }

        return $data;
    }

    /**
     * Returns readable address book.
     *
     * @param  int  $addressBookId
     * @return AddressBook
     */
    private function loadReadableAddressBook(int $addressBookId): AddressBook
    {
        $addressBook = AddressBook::query()->find($addressBookId);

        if (! $addressBook) {
            throw new NotFound('Address book not found.');
        }

        $user = $this->davContext->getAuthenticatedUser();

        if (! $user || ! $this->accessService->userCanReadAddressBook($user, $addressBook)) {
            throw new Forbidden('Read access denied for address book.');
        }

        return $addressBook;
    }

    /**
     * Asserts writable address book.
     *
     * @param  AddressBook  $addressBook
     * @return void
     */
    private function assertWritableAddressBook(AddressBook $addressBook): void
    {
        $user = $this->davContext->getAuthenticatedUser();

        if (! $user || ! $this->accessService->userCanWriteAddressBook($user, $addressBook)) {
            throw new Forbidden('Write access denied for address book.');
        }
    }

    /**
     * Asserts deletable address book.
     *
     * @param  AddressBook  $addressBook
     * @return void
     */
    private function assertDeletableAddressBook(AddressBook $addressBook): void
    {
        $user = $this->davContext->getAuthenticatedUser();

        if (! $user || ! $this->accessService->userCanDeleteAddressBook($user, $addressBook)) {
            throw new Forbidden('Delete access denied for address book.');
        }
    }

    /**
     * Parses sync token.
     *
     * @param  mixed  $syncToken
     * @return int
     */
    private function parseSyncToken(mixed $syncToken): int
    {
        if (is_int($syncToken) && $syncToken >= 0) {
            return $syncToken;
        }

        if (is_string($syncToken)) {
            $token = trim($syncToken);

            if (preg_match('/^\d+$/', $token) === 1) {
                return (int) $token;
            }
        }

        throw new InvalidSyncToken('Sync token format is invalid.');
    }

    /**
     * Checks whether uid conflict exists.
     *
     * @param  int  $addressBookId
     * @param  string  $uid
     * @param  int|null  $exceptCardId
     * @return bool
     */
    private function uidConflictExists(int $addressBookId, string $uid, ?int $exceptCardId = null): bool
    {
        $query = Card::query()
            ->where('address_book_id', $addressBookId)
            ->where('uid', $uid);

        if ($exceptCardId !== null) {
            $query->where('id', '!=', $exceptCardId);
        }

        return $query->exists();
    }

    /**
     * Returns fallback uid for legacy payload.
     *
     * @param  string  $cardUri
     * @return string
     */
    private function fallbackUidForLegacyPayload(string $cardUri): string
    {
        return 'legacy-card-'.sha1($cardUri);
    }

    /**
     * Checks whether uid unique constraint violation.
     *
     * @param  QueryException  $exception
     * @return bool
     */
    private function isUidUniqueConstraintViolation(QueryException $exception): bool
    {
        $message = Str::lower($exception->getMessage());

        return str_contains($message, 'cards_address_book_uid_unique')
            || str_contains($message, 'unique constraint failed: cards.address_book_id, cards.uid');
    }

    /**
     * Synchronizes managed contact upsert.
     *
     * @param  AddressBook  $addressBook
     * @param  Card  $card
     * @return void
     */
    private function syncManagedContactUpsert(AddressBook $addressBook, Card $card): void
    {
        try {
            $this->managedContactSync->syncCardUpsert(
                addressBook: $addressBook,
                card: $card,
                actor: $this->davContext->getAuthenticatedUser(),
            );
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    /**
     * Synchronizes managed contact delete.
     *
     * @param  Card  $card
     * @return void
     */
    private function syncManagedContactDelete(Card $card): void
    {
        try {
            $this->managedContactSync->syncCardDeleted($card);
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
