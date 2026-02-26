<?php

namespace App\Services\Dav\Backends;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Card;
use App\Models\ResourceShare;
use App\Services\Dav\DavSyncService;
use App\Services\Dav\VCardValidator;
use App\Services\DavRequestContext;
use App\Services\PrincipalUriService;
use App\Services\ResourceAccessService;
use Illuminate\Support\Str;
use Sabre\CardDAV\Backend\AbstractBackend;
use Sabre\DAV\Exception\BadRequest;
use Sabre\DAV\Exception\Forbidden;
use Sabre\DAV\Exception\NotFound;
use Sabre\DAV\PropPatch;

class LaravelCardDavBackend extends AbstractBackend
{
    public function __construct(
        private readonly PrincipalUriService $principalUriService,
        private readonly ResourceAccessService $accessService,
        private readonly DavRequestContext $davContext,
        private readonly VCardValidator $vCardValidator,
        private readonly DavSyncService $syncService,
    ) {
    }

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

            return true;
        });
    }

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

    public function deleteAddressBook($addressBookId): void
    {
        $addressBook = AddressBook::query()->find($addressBookId);

        if (! $addressBook) {
            return;
        }

        $this->assertWritableAddressBook($addressBook);

        $addressBook->delete();
    }

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
        $etag = md5($normalized);

        Card::query()->create([
            'address_book_id' => $addressBook->id,
            'uri' => $cardUri,
            'etag' => $etag,
            'size' => strlen($normalized),
            'data' => $normalized,
        ]);

        $this->syncService->recordAdded(ShareResourceType::AddressBook, $addressBook->id, (string) $cardUri);

        return '"'.$etag.'"';
    }

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

        $normalized = $this->vCardValidator->validateAndNormalize((string) $cardData);
        $etag = md5($normalized);

        $card->update([
            'etag' => $etag,
            'size' => strlen($normalized),
            'data' => $normalized,
        ]);

        $this->syncService->recordModified(ShareResourceType::AddressBook, $addressBook->id, (string) $cardUri);

        return '"'.$etag.'"';
    }

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

        $card->delete();

        $this->syncService->recordDeleted(ShareResourceType::AddressBook, $addressBook->id, (string) $cardUri);
    }

    public function getChangesForAddressBook($addressBookId, $syncToken, $syncLevel, $limit = null): array
    {
        $addressBook = $this->loadReadableAddressBook($addressBookId);

        $token = is_numeric($syncToken) ? (int) $syncToken : 0;

        return $this->syncService->getChangesSince(
            resourceType: ShareResourceType::AddressBook,
            resourceId: $addressBook->id,
            syncToken: $token,
            limit: $limit !== null ? (int) $limit : null,
        );
    }

    private function transformAddressBook(AddressBook $addressBook, SharePermission $permission, string $principalUri): array
    {
        return [
            'id' => $addressBook->id,
            'uri' => $addressBook->uri,
            'principaluri' => $principalUri,
            '{DAV:}displayname' => $addressBook->display_name,
            '{urn:ietf:params:xml:ns:carddav}addressbook-description' => $addressBook->description,
            '{http://sabredav.org/ns}read-only' => ! $permission->canWrite(),
        ];
    }

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

    private function assertWritableAddressBook(AddressBook $addressBook): void
    {
        $user = $this->davContext->getAuthenticatedUser();

        if (! $user || ! $this->accessService->userCanWriteAddressBook($user, $addressBook)) {
            throw new Forbidden('Write access denied for address book.');
        }
    }
}
