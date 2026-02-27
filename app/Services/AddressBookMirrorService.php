<?php

namespace App\Services;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\AddressBookMirrorConfig;
use App\Models\AddressBookMirrorLink;
use App\Models\Card;
use App\Models\ResourceShare;
use App\Models\User;
use App\Services\Dav\DavSyncService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Sabre\VObject\Component\VCard;
use Sabre\VObject\Reader;
use Throwable;

class AddressBookMirrorService
{
    private const MIRROR_SOURCE_PROPERTY = 'X-DAVVY-MIRROR-SOURCE';

    private const MIRROR_OWNER_PROPERTY = 'X-DAVVY-MIRROR-OWNER';

    public function __construct(private readonly DavSyncService $syncService) {}

    public function dashboardDataFor(User $user): array
    {
        $config = AddressBookMirrorConfig::query()
            ->with('sources')
            ->where('user_id', $user->id)
            ->first();

        $target = $this->resolveTargetAddressBook($user);
        $sourceOptions = $this->eligibleSourceOptionsForUser($user, $target?->id);

        $selected = collect($config?->sources ?? [])
            ->pluck('source_address_book_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->intersect($sourceOptions->pluck('id')->all())
            ->values()
            ->all();

        return [
            'enabled' => (bool) ($config?->enabled ?? false),
            'target_address_book_id' => $target?->id,
            'target_address_book_uri' => $target?->uri,
            'target_display_name' => $target?->display_name,
            'selected_source_ids' => $selected,
            'source_options' => $sourceOptions->all(),
        ];
    }

    public function updateUserConfig(User $user, bool $enabled, array $sourceIds): array
    {
        $target = $this->resolveTargetAddressBook($user);
        $eligible = $this->eligibleSourceOptionsForUser($user, $target?->id);
        $eligibleIds = $eligible->pluck('id')->map(fn (mixed $id): int => (int) $id)->all();

        $sanitizedSourceIds = collect($sourceIds)
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        foreach ($sanitizedSourceIds as $sourceId) {
            if (! in_array($sourceId, $eligibleIds, true)) {
                abort(422, 'One or more selected address books are not eligible for Apple compatibility mirroring.');
            }
        }

        $config = AddressBookMirrorConfig::query()->updateOrCreate(
            ['user_id' => $user->id],
            ['enabled' => $enabled],
        );

        $config->enabled = $enabled;
        $config->save();

        $config->sources()
            ->whereNotIn('source_address_book_id', $sanitizedSourceIds)
            ->delete();

        $existing = $config->sources()->pluck('source_address_book_id')->map(fn (mixed $id): int => (int) $id)->all();
        $toCreate = array_diff($sanitizedSourceIds, $existing);
        foreach ($toCreate as $sourceId) {
            $config->sources()->create([
                'source_address_book_id' => $sourceId,
            ]);
        }

        $this->syncUserConfig($user);

        return $this->dashboardDataFor($user);
    }

    public function syncUserConfig(User $user): void
    {
        $config = AddressBookMirrorConfig::query()
            ->with('sources')
            ->where('user_id', $user->id)
            ->first();

        if (! $config) {
            return;
        }

        $target = $this->resolveTargetAddressBook($user);
        if (! $target) {
            return;
        }

        $eligibleIds = $this->eligibleSourceOptionsForUser($user, $target->id)
            ->pluck('id')
            ->map(fn (mixed $id): int => (int) $id)
            ->all();

        $selectedIds = collect($config->sources)
            ->pluck('source_address_book_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->intersect($eligibleIds)
            ->values()
            ->all();

        if (! $config->enabled || $selectedIds === []) {
            $this->removeMirrorsForUser($user->id);

            return;
        }

        $this->removeMirrorsForUser(
            userId: $user->id,
            exceptSourceAddressBookIds: $selectedIds,
        );

        foreach ($selectedIds as $sourceAddressBookId) {
            $this->syncSourceAddressBookForUser(
                user: $user,
                targetAddressBook: $target,
                sourceAddressBookId: $sourceAddressBookId,
            );
        }
    }

    public function handleSourceCardUpsert(AddressBook $sourceAddressBook, Card $sourceCard): void
    {
        if ($this->isMirrorManagedCard($sourceCard->data)) {
            return;
        }

        $configs = AddressBookMirrorConfig::query()
            ->with('user')
            ->where('enabled', true)
            ->whereHas('sources', fn ($query) => $query->where('source_address_book_id', $sourceAddressBook->id))
            ->get();

        foreach ($configs as $config) {
            $user = $config->user;
            if (! $user) {
                continue;
            }

            $target = $this->resolveTargetAddressBook($user);
            if (! $target || $target->id === $sourceAddressBook->id) {
                continue;
            }

            if (! $this->userCanUseSourceAddressBook($user, $sourceAddressBook->id, $target->id)) {
                $this->removeMirrorsForUser(
                    userId: $user->id,
                    sourceAddressBookIds: [$sourceAddressBook->id],
                );

                continue;
            }

            $this->upsertMirroredCard(
                user: $user,
                targetAddressBook: $target,
                sourceAddressBook: $sourceAddressBook,
                sourceCard: $sourceCard,
            );
        }
    }

    public function handleSourceCardDeleted(int $sourceAddressBookId, string $sourceCardUri): void
    {
        $links = AddressBookMirrorLink::query()
            ->where('source_address_book_id', $sourceAddressBookId)
            ->where('source_card_uri', $sourceCardUri)
            ->get();

        foreach ($links as $link) {
            $this->deleteMirroredLink($link);
        }
    }

    public function handleSourceAddressBookDeleted(int $sourceAddressBookId): void
    {
        $links = AddressBookMirrorLink::query()
            ->where('source_address_book_id', $sourceAddressBookId)
            ->get();

        foreach ($links as $link) {
            $this->deleteMirroredLink($link);
        }
    }

    private function eligibleSourceOptionsForUser(User $user, ?int $targetAddressBookId): Collection
    {
        $owned = AddressBook::query()
            ->where('owner_id', $user->id)
            ->orderBy('display_name')
            ->get()
            ->map(function (AddressBook $addressBook) use ($user): array {
                return [
                    'id' => $addressBook->id,
                    'uri' => $addressBook->uri,
                    'display_name' => $addressBook->display_name,
                    'scope' => 'owned',
                    'owner_name' => $user->name,
                    'owner_email' => $user->email,
                ];
            });

        $shared = ResourceShare::query()
            ->with(['addressBook', 'owner'])
            ->where('resource_type', ShareResourceType::AddressBook)
            ->where('shared_with_id', $user->id)
            ->get()
            ->filter(fn (ResourceShare $share): bool => $share->addressBook !== null)
            ->map(function (ResourceShare $share): array {
                return [
                    'id' => $share->addressBook->id,
                    'uri' => $share->addressBook->uri,
                    'display_name' => $share->addressBook->display_name,
                    'scope' => 'shared',
                    'owner_name' => $share->owner?->name,
                    'owner_email' => $share->owner?->email,
                ];
            });

        return collect([...$owned->all(), ...$shared->all()])
            ->unique('id')
            ->reject(fn (array $item): bool => $targetAddressBookId !== null && $item['id'] === $targetAddressBookId)
            ->sortBy(fn (array $item): string => $item['scope'].'|'.mb_strtolower($item['display_name']))
            ->values();
    }

    private function resolveTargetAddressBook(User $user): ?AddressBook
    {
        $default = AddressBook::query()
            ->where('owner_id', $user->id)
            ->where('is_default', true)
            ->orderBy('id')
            ->first();

        if ($default) {
            return $default;
        }

        return AddressBook::query()
            ->where('owner_id', $user->id)
            ->where('uri', 'contacts')
            ->orderBy('id')
            ->first();
    }

    private function userCanUseSourceAddressBook(User $user, int $sourceAddressBookId, int $targetAddressBookId): bool
    {
        if ($sourceAddressBookId === $targetAddressBookId) {
            return false;
        }

        $ownsAddressBook = AddressBook::query()
            ->where('id', $sourceAddressBookId)
            ->where('owner_id', $user->id)
            ->exists();

        if ($ownsAddressBook) {
            return true;
        }

        return ResourceShare::query()
            ->where('resource_type', ShareResourceType::AddressBook)
            ->where('resource_id', $sourceAddressBookId)
            ->where('shared_with_id', $user->id)
            ->exists();
    }

    private function syncSourceAddressBookForUser(
        User $user,
        AddressBook $targetAddressBook,
        int $sourceAddressBookId,
    ): void {
        if (! $this->userCanUseSourceAddressBook($user, $sourceAddressBookId, $targetAddressBook->id)) {
            $this->removeMirrorsForUser(
                userId: $user->id,
                sourceAddressBookIds: [$sourceAddressBookId],
            );

            return;
        }

        $sourceAddressBook = AddressBook::query()->find($sourceAddressBookId);
        if (! $sourceAddressBook) {
            $this->removeMirrorsForUser(
                userId: $user->id,
                sourceAddressBookIds: [$sourceAddressBookId],
            );

            return;
        }

        $sourceCards = Card::query()
            ->where('address_book_id', $sourceAddressBookId)
            ->orderBy('id')
            ->get();

        $seenUris = [];
        foreach ($sourceCards as $sourceCard) {
            if ($this->isMirrorManagedCard($sourceCard->data)) {
                continue;
            }

            $this->upsertMirroredCard(
                user: $user,
                targetAddressBook: $targetAddressBook,
                sourceAddressBook: $sourceAddressBook,
                sourceCard: $sourceCard,
            );
            $seenUris[$sourceCard->uri] = true;
        }

        $links = AddressBookMirrorLink::query()
            ->where('user_id', $user->id)
            ->where('source_address_book_id', $sourceAddressBookId)
            ->get();

        foreach ($links as $link) {
            if (! isset($seenUris[$link->source_card_uri])) {
                $this->deleteMirroredLink($link);
            }
        }
    }

    private function upsertMirroredCard(
        User $user,
        AddressBook $targetAddressBook,
        AddressBook $sourceAddressBook,
        Card $sourceCard,
    ): void {
        $payload = $this->buildMirroredCardPayload($user, $sourceAddressBook, $sourceCard);
        if (! $payload) {
            return;
        }

        $link = AddressBookMirrorLink::query()
            ->where('user_id', $user->id)
            ->where('source_address_book_id', $sourceAddressBook->id)
            ->where('source_card_uri', $sourceCard->uri)
            ->first();

        $mirroredCard = $link
            ? Card::query()->find($link->mirrored_card_id)
            : null;

        if (! $mirroredCard) {
            $mirroredCard = Card::query()->create([
                'address_book_id' => $targetAddressBook->id,
                'uri' => $payload['uri'],
                'uid' => $payload['uid'],
                'etag' => $payload['etag'],
                'size' => $payload['size'],
                'data' => $payload['data'],
            ]);

            $this->syncService->recordAdded(
                resourceType: ShareResourceType::AddressBook,
                resourceId: $targetAddressBook->id,
                uri: $mirroredCard->uri,
            );
        } else {
            $dirty = $mirroredCard->uid !== $payload['uid']
                || $mirroredCard->etag !== $payload['etag']
                || $mirroredCard->size !== $payload['size']
                || $mirroredCard->data !== $payload['data'];

            if ($dirty) {
                $mirroredCard->update([
                    'uid' => $payload['uid'],
                    'etag' => $payload['etag'],
                    'size' => $payload['size'],
                    'data' => $payload['data'],
                ]);

                $this->syncService->recordModified(
                    resourceType: ShareResourceType::AddressBook,
                    resourceId: $targetAddressBook->id,
                    uri: $mirroredCard->uri,
                );
            }
        }

        if (! $link) {
            AddressBookMirrorLink::query()->create([
                'user_id' => $user->id,
                'source_address_book_id' => $sourceAddressBook->id,
                'source_card_uri' => $sourceCard->uri,
                'mirrored_address_book_id' => $targetAddressBook->id,
                'mirrored_card_id' => $mirroredCard->id,
            ]);

            return;
        }

        if (
            $link->mirrored_card_id !== $mirroredCard->id
            || $link->mirrored_address_book_id !== $targetAddressBook->id
        ) {
            $link->update([
                'mirrored_card_id' => $mirroredCard->id,
                'mirrored_address_book_id' => $targetAddressBook->id,
            ]);
        }
    }

    private function buildMirroredCardPayload(User $user, AddressBook $sourceAddressBook, Card $sourceCard): ?array
    {
        $mirroredUid = $this->mirroredUid($user->id, $sourceAddressBook->id, $sourceCard->uri);
        $mirroredUri = $this->mirroredUri($user->id, $sourceAddressBook->id, $sourceCard->uri);

        try {
            $vcard = Reader::read($sourceCard->data);

            if (! $vcard instanceof VCard) {
                return null;
            }

            $uidProperties = $vcard->select('UID');
            if ($uidProperties !== []) {
                $uidProperties[0]->setValue($mirroredUid);

                foreach (array_slice($uidProperties, 1) as $extraUidProperty) {
                    $extraUidProperty->destroy();
                }
            } else {
                $vcard->add('UID', $mirroredUid);
            }

            foreach ($vcard->select(self::MIRROR_SOURCE_PROPERTY) as $property) {
                $property->destroy();
            }

            foreach ($vcard->select(self::MIRROR_OWNER_PROPERTY) as $property) {
                $property->destroy();
            }

            $vcard->add(self::MIRROR_SOURCE_PROPERTY, $sourceAddressBook->id.'/'.$sourceCard->uri);
            $vcard->add(self::MIRROR_OWNER_PROPERTY, (string) $user->id);

            $data = $vcard->serialize();
            $vcard->destroy();

            return [
                'uri' => $mirroredUri,
                'uid' => $mirroredUid,
                'etag' => md5($data),
                'size' => strlen($data),
                'data' => $data,
            ];
        } catch (Throwable $exception) {
            Log::warning('Skipping Apple compatibility mirror for invalid source card payload.', [
                'source_address_book_id' => $sourceAddressBook->id,
                'source_card_uri' => $sourceCard->uri,
                'error' => $exception->getMessage(),
            ]);

            return null;
        }
    }

    private function mirroredUri(int $userId, int $sourceAddressBookId, string $sourceCardUri): string
    {
        $hash = substr(sha1($userId.'|'.$sourceAddressBookId.'|'.$sourceCardUri), 0, 24);

        return sprintf('mirror-u%d-b%d-%s.vcf', $userId, $sourceAddressBookId, $hash);
    }

    private function mirroredUid(int $userId, int $sourceAddressBookId, string $sourceCardUri): string
    {
        $hash = substr(sha1($userId.'|'.$sourceAddressBookId.'|'.$sourceCardUri), 0, 24);

        return sprintf('davvy-mirror-%d-%d-%s', $userId, $sourceAddressBookId, $hash);
    }

    private function isMirrorManagedCard(string $cardData): bool
    {
        return stripos($cardData, self::MIRROR_SOURCE_PROPERTY.':') !== false;
    }

    private function removeMirrorsForUser(
        int $userId,
        ?array $sourceAddressBookIds = null,
        ?array $exceptSourceAddressBookIds = null,
    ): void {
        $query = AddressBookMirrorLink::query()->where('user_id', $userId);

        if ($sourceAddressBookIds !== null) {
            $query->whereIn('source_address_book_id', $sourceAddressBookIds);
        }

        if ($exceptSourceAddressBookIds !== null) {
            $query->whereNotIn('source_address_book_id', $exceptSourceAddressBookIds);
        }

        $links = $query->get();
        foreach ($links as $link) {
            $this->deleteMirroredLink($link);
        }
    }

    private function deleteMirroredLink(AddressBookMirrorLink $link): void
    {
        $mirroredCard = Card::query()->find($link->mirrored_card_id);
        if ($mirroredCard) {
            $uri = $mirroredCard->uri;
            $resourceId = $mirroredCard->address_book_id;

            $mirroredCard->delete();

            $this->syncService->recordDeleted(
                resourceType: ShareResourceType::AddressBook,
                resourceId: $resourceId,
                uri: $uri,
            );
        }

        $link->delete();
    }
}
