<?php

namespace App\Services\Backups;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\Card;
use App\Models\User;
use App\Services\Contacts\ManagedContactSyncService;
use App\Services\Dav\DavSyncService;
use App\Services\Dav\IcsValidator;
use App\Services\Dav\VCardValidator;
use App\Services\ResourceDeletionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Sabre\VObject\Component;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;
use Throwable;
use ZipArchive;

class BackupRestoreService
{
    public function __construct(
        private readonly IcsValidator $icsValidator,
        private readonly VCardValidator $vCardValidator,
        private readonly DavSyncService $syncService,
        private readonly ManagedContactSyncService $managedContactSync,
        private readonly ResourceDeletionService $resourceDeletion,
    ) {}

    /**
     * @return array{
     *   status:'success',
     *   trigger:string,
     *   mode:'merge'|'replace',
     *   dry_run:bool,
     *   reason:string,
     *   executed_at_utc:string,
     *   manifest:array<string, mixed>|null,
     *   summary:array<string, int|null>,
     *   warnings:array<int, string>
     * }
     */
    public function restoreFromArchive(
        string $archivePath,
        string $mode = 'merge',
        bool $dryRun = false,
        ?int $fallbackOwnerId = null,
        string $trigger = 'manual-cli',
    ): array {
        $normalizedMode = in_array($mode, ['merge', 'replace'], true) ? $mode : null;
        if ($normalizedMode === null) {
            throw new RuntimeException('Restore mode must be "merge" or "replace".');
        }

        if (! is_file($archivePath)) {
            throw new RuntimeException('Backup archive file was not found.');
        }

        $fallbackOwner = null;
        if ($fallbackOwnerId !== null) {
            $fallbackOwner = User::query()->find($fallbackOwnerId);
            if (! $fallbackOwner) {
                throw new RuntimeException('Fallback owner user ID does not exist.');
            }
        }

        $warnings = [];
        [$entries, $manifest, $ownerIdsInArchive] = $this->readArchiveEntries(
            archivePath: $archivePath,
            warnings: $warnings,
        );

        if ($entries === []) {
            throw new RuntimeException('Backup archive does not contain any restorable resources.');
        }

        /** @var array<int, int> $ownerResolution */
        $ownerResolution = [];
        $missingOwners = [];
        foreach ($ownerIdsInArchive as $ownerId) {
            $ownerExists = User::query()->whereKey($ownerId)->exists();

            if ($ownerExists) {
                $ownerResolution[$ownerId] = $ownerId;

                continue;
            }

            if ($fallbackOwner !== null) {
                $ownerResolution[$ownerId] = (int) $fallbackOwner->id;

                continue;
            }

            $missingOwners[] = $ownerId;
            $warnings[] = sprintf(
                'Skipping resources for backup owner ID %d because no matching user exists.',
                $ownerId,
            );
        }

        $processableEntries = collect($entries)
            ->filter(function (array $entry) use ($ownerResolution): bool {
                return isset($ownerResolution[(int) $entry['owner_id']]);
            })
            ->map(function (array $entry) use ($ownerResolution): array {
                $entry['resolved_owner_id'] = $ownerResolution[(int) $entry['owner_id']];

                return $entry;
            })
            ->values()
            ->all();

        if ($processableEntries === []) {
            throw new RuntimeException('No resources can be restored because all backup owners are unresolved.');
        }

        $summary = [
            'files_total' => count($entries),
            'files_processed' => 0,
            'files_skipped' => count($entries) - count($processableEntries),
            'owners_total' => count($ownerIdsInArchive),
            'owners_resolved' => count($ownerResolution),
            'owners_missing' => count($missingOwners),
            'fallback_owner_id' => $fallbackOwner?->id,
            'calendars_created' => 0,
            'calendars_updated' => 0,
            'calendars_deleted' => 0,
            'calendar_objects_created' => 0,
            'calendar_objects_updated' => 0,
            'calendar_objects_deleted' => 0,
            'address_books_created' => 0,
            'address_books_updated' => 0,
            'address_books_deleted' => 0,
            'cards_created' => 0,
            'cards_updated' => 0,
            'cards_deleted' => 0,
            'resources_skipped_invalid' => 0,
            'resources_skipped_owner' => count($entries) - count($processableEntries),
        ];

        $runRestore = function () use (
            $processableEntries,
            $normalizedMode,
            $dryRun,
            &$summary,
            &$warnings,
        ): void {
            $resolvedOwnerIds = collect($processableEntries)
                ->pluck('resolved_owner_id')
                ->map(fn (mixed $id): int => (int) $id)
                ->unique()
                ->values()
                ->all();

            $calendarUriPools = [];
            $addressBookUriPools = [];
            foreach ($resolvedOwnerIds as $ownerId) {
                $calendarUriPools[$ownerId] = $normalizedMode === 'replace'
                    ? []
                    : Calendar::query()
                        ->where('owner_id', $ownerId)
                        ->pluck('uri')
                        ->map(fn (string $uri): string => trim($uri))
                        ->filter()
                        ->values()
                        ->all();

                $addressBookUriPools[$ownerId] = $normalizedMode === 'replace'
                    ? []
                    : AddressBook::query()
                        ->where('owner_id', $ownerId)
                        ->pluck('uri')
                        ->map(fn (string $uri): string => trim($uri))
                        ->filter()
                        ->values()
                        ->all();
            }

            if ($normalizedMode === 'replace') {
                foreach ($resolvedOwnerIds as $ownerId) {
                    $calendars = Calendar::query()
                        ->where('owner_id', $ownerId)
                        ->get();
                    $calendarIds = $calendars
                        ->pluck('id')
                        ->map(fn (mixed $id): int => (int) $id)
                        ->all();
                    $addressBooks = AddressBook::query()
                        ->where('owner_id', $ownerId)
                        ->get();
                    $addressBookIds = $addressBooks
                        ->pluck('id')
                        ->map(fn (mixed $id): int => (int) $id)
                        ->all();

                    if ($calendarIds !== []) {
                        $summary['calendars_deleted'] += count($calendarIds);
                        $summary['calendar_objects_deleted'] += (int) CalendarObject::query()
                            ->whereIn('calendar_id', $calendarIds)
                            ->count();
                    }

                    if ($addressBookIds !== []) {
                        $summary['address_books_deleted'] += count($addressBookIds);
                        $summary['cards_deleted'] += (int) Card::query()
                            ->whereIn('address_book_id', $addressBookIds)
                            ->count();
                    }

                    if ($dryRun) {
                        continue;
                    }

                    foreach ($addressBooks as $addressBook) {
                        $this->resourceDeletion->deleteAddressBook($addressBook);
                    }

                    foreach ($calendars as $calendar) {
                        $this->resourceDeletion->deleteCalendar($calendar);
                    }
                }
            }

            /** @var array<string, array<int, string>> $calendarObjectUriPools */
            $calendarObjectUriPools = [];
            /** @var array<string, array<int, string>> $cardUriPools */
            $cardUriPools = [];

            foreach ($processableEntries as $entry) {
                $summary['files_processed']++;
                $resolvedOwnerId = (int) $entry['resolved_owner_id'];

                if ($entry['type'] === 'calendar') {
                    $calendar = $this->upsertCalendarCollection(
                        ownerId: $resolvedOwnerId,
                        fileStem: (string) $entry['file_stem'],
                        dryRun: $dryRun,
                        mode: $normalizedMode,
                        uriPool: $calendarUriPools[$resolvedOwnerId],
                        summary: $summary,
                    );

                    $calendarKey = $calendar['id'] !== null
                        ? 'calendar:'.$calendar['id']
                        : 'calendar-dry-run:'.$resolvedOwnerId.':'.$calendar['uri'];
                    $calendarObjectUriPools[$calendarKey] ??= $calendar['id'] !== null
                        ? CalendarObject::query()
                            ->where('calendar_id', (int) $calendar['id'])
                            ->pluck('uri')
                            ->map(fn (string $uri): string => trim($uri))
                            ->filter()
                            ->values()
                            ->all()
                        : [];

                    try {
                        $calendarResources = $this->splitCalendarPayload(
                            payload: (string) $entry['contents'],
                            archivePath: (string) $entry['archive_path'],
                        );
                    } catch (Throwable $throwable) {
                        $warnings[] = sprintf(
                            'Skipping calendar payload "%s": %s',
                            $entry['archive_path'],
                            $throwable->getMessage(),
                        );
                        $summary['resources_skipped_invalid']++;

                        continue;
                    }

                    if ($calendarResources === []) {
                        $warnings[] = sprintf(
                            'Skipping calendar payload "%s": no VEVENT/VTODO/VJOURNAL components found.',
                            $entry['archive_path'],
                        );
                        $summary['resources_skipped_invalid']++;

                        continue;
                    }

                    foreach ($calendarResources as $resource) {
                        try {
                            $normalized = $this->icsValidator->validateAndNormalize(
                                (string) $resource['payload'],
                            );
                        } catch (Throwable $throwable) {
                            $warnings[] = sprintf(
                                'Skipping invalid calendar object in "%s": %s',
                                $entry['archive_path'],
                                $throwable->getMessage(),
                            );
                            $summary['resources_skipped_invalid']++;

                            continue;
                        }

                        $resourceUid = $normalized['uid']
                            ?? 'legacy-calendar-'.sha1((string) $resource['uri_candidate']);
                        $existingObject = null;

                        if ($calendar['id'] !== null) {
                            $existingObject = CalendarObject::query()
                                ->where('calendar_id', (int) $calendar['id'])
                                ->where('uid', $resourceUid)
                                ->first();

                            if (! $existingObject) {
                                $fallbackUri = $this->normalizeResourceUri(
                                    candidate: (string) $resource['uri_candidate'],
                                    extension: 'ics',
                                    fallbackStem: 'item',
                                );

                                $existingObject = CalendarObject::query()
                                    ->where('calendar_id', (int) $calendar['id'])
                                    ->where('uri', $fallbackUri)
                                    ->first();
                            }
                        }

                        if ($existingObject) {
                            $summary['calendar_objects_updated']++;

                            if (! $dryRun) {
                                $existingObject->update([
                                    'uid' => $resourceUid,
                                    'etag' => md5($normalized['data']),
                                    'size' => strlen($normalized['data']),
                                    'component_type' => $normalized['component_type'],
                                    'first_occurred_at' => $normalized['first_occurred_at'],
                                    'last_occurred_at' => $normalized['last_occurred_at'],
                                    'data' => $normalized['data'],
                                ]);

                                $this->syncService->recordModified(
                                    ShareResourceType::Calendar,
                                    (int) $calendar['id'],
                                    (string) $existingObject->uri,
                                );
                            }

                            continue;
                        }

                        $resourceUri = $this->nextUniqueResourceUri(
                            candidate: (string) $resource['uri_candidate'],
                            extension: 'ics',
                            fallbackStem: 'item',
                            uriPool: $calendarObjectUriPools[$calendarKey],
                        );
                        $summary['calendar_objects_created']++;

                        if ($dryRun || $calendar['id'] === null) {
                            continue;
                        }

                        CalendarObject::query()->create([
                            'calendar_id' => (int) $calendar['id'],
                            'uri' => $resourceUri,
                            'uid' => $resourceUid,
                            'etag' => md5($normalized['data']),
                            'size' => strlen($normalized['data']),
                            'component_type' => $normalized['component_type'],
                            'first_occurred_at' => $normalized['first_occurred_at'],
                            'last_occurred_at' => $normalized['last_occurred_at'],
                            'data' => $normalized['data'],
                        ]);

                        $this->syncService->recordAdded(
                            ShareResourceType::Calendar,
                            (int) $calendar['id'],
                            $resourceUri,
                        );
                    }

                    continue;
                }

                $addressBook = $this->upsertAddressBookCollection(
                    ownerId: $resolvedOwnerId,
                    fileStem: (string) $entry['file_stem'],
                    dryRun: $dryRun,
                    mode: $normalizedMode,
                    uriPool: $addressBookUriPools[$resolvedOwnerId],
                    summary: $summary,
                );

                $addressBookKey = $addressBook['id'] !== null
                    ? 'address-book:'.$addressBook['id']
                    : 'address-book-dry-run:'.$resolvedOwnerId.':'.$addressBook['uri'];
                $addressBookModel = (! $dryRun && $addressBook['id'] !== null)
                    ? AddressBook::query()->find((int) $addressBook['id'])
                    : null;
                $cardUriPools[$addressBookKey] ??= $addressBook['id'] !== null
                    ? Card::query()
                        ->where('address_book_id', (int) $addressBook['id'])
                        ->pluck('uri')
                        ->map(fn (string $uri): string => trim($uri))
                        ->filter()
                        ->values()
                        ->all()
                    : [];

                try {
                    $cards = $this->splitAddressBookPayload(
                        payload: (string) $entry['contents'],
                        archivePath: (string) $entry['archive_path'],
                    );
                } catch (Throwable $throwable) {
                    $warnings[] = sprintf(
                        'Skipping address-book payload "%s": %s',
                        $entry['archive_path'],
                        $throwable->getMessage(),
                    );
                    $summary['resources_skipped_invalid']++;

                    continue;
                }

                foreach ($cards as $resource) {
                    try {
                        $normalized = $this->vCardValidator->validateAndNormalize(
                            (string) $resource['payload'],
                        );
                    } catch (Throwable $throwable) {
                        $warnings[] = sprintf(
                            'Skipping invalid vCard in "%s": %s',
                            $entry['archive_path'],
                            $throwable->getMessage(),
                        );
                        $summary['resources_skipped_invalid']++;

                        continue;
                    }

                    $resourceUid = $normalized['uid']
                        ?? 'legacy-card-'.sha1((string) $resource['uri_candidate']);
                    $existingCard = null;

                    if ($addressBook['id'] !== null) {
                        $existingCard = Card::query()
                            ->where('address_book_id', (int) $addressBook['id'])
                            ->where('uid', $resourceUid)
                            ->first();

                        if (! $existingCard) {
                            $fallbackUri = $this->normalizeResourceUri(
                                candidate: (string) $resource['uri_candidate'],
                                extension: 'vcf',
                                fallbackStem: 'card',
                            );

                            $existingCard = Card::query()
                                ->where('address_book_id', (int) $addressBook['id'])
                                ->where('uri', $fallbackUri)
                                ->first();
                        }
                    }

                    if ($existingCard) {
                        $summary['cards_updated']++;

                        if (! $dryRun) {
                            $existingCard->update([
                                'uid' => $resourceUid,
                                'etag' => md5($normalized['data']),
                                'size' => strlen($normalized['data']),
                                'data' => $normalized['data'],
                            ]);

                            $this->syncService->recordModified(
                                ShareResourceType::AddressBook,
                                (int) $addressBook['id'],
                                (string) $existingCard->uri,
                            );

                            if ($addressBookModel) {
                                try {
                                    $existingCard->refresh();
                                    $this->managedContactSync->syncCardUpsert(
                                        addressBook: $addressBookModel,
                                        card: $existingCard,
                                    );
                                } catch (Throwable $throwable) {
                                    report($throwable);
                                }
                            }
                        }

                        continue;
                    }

                    $resourceUri = $this->nextUniqueResourceUri(
                        candidate: (string) $resource['uri_candidate'],
                        extension: 'vcf',
                        fallbackStem: 'card',
                        uriPool: $cardUriPools[$addressBookKey],
                    );
                    $summary['cards_created']++;

                    if ($dryRun || $addressBook['id'] === null) {
                        continue;
                    }

                    $card = Card::query()->create([
                        'address_book_id' => (int) $addressBook['id'],
                        'uri' => $resourceUri,
                        'uid' => $resourceUid,
                        'etag' => md5($normalized['data']),
                        'size' => strlen($normalized['data']),
                        'data' => $normalized['data'],
                    ]);

                    $this->syncService->recordAdded(
                        ShareResourceType::AddressBook,
                        (int) $addressBook['id'],
                        $resourceUri,
                    );

                    if ($addressBookModel) {
                        try {
                            $this->managedContactSync->syncCardUpsert(
                                addressBook: $addressBookModel,
                                card: $card,
                            );
                        } catch (Throwable $throwable) {
                            report($throwable);
                        }
                    }
                }
            }
        };

        if ($dryRun) {
            $runRestore();
        } else {
            DB::transaction($runRestore);
        }

        $reason = $dryRun
            ? sprintf(
                'Dry run complete: %d file(s) scanned, %d invalid resource(s) would be skipped.',
                $summary['files_processed'],
                $summary['resources_skipped_invalid'],
            )
            : sprintf(
                'Restore complete: %d calendar(s), %d address book(s), %d object/card record(s) changed.',
                $summary['calendars_created'] + $summary['calendars_updated'],
                $summary['address_books_created'] + $summary['address_books_updated'],
                $summary['calendar_objects_created']
                    + $summary['calendar_objects_updated']
                    + $summary['cards_created']
                    + $summary['cards_updated'],
            );

        return [
            'status' => 'success',
            'trigger' => $trigger,
            'mode' => $normalizedMode,
            'dry_run' => $dryRun,
            'reason' => $reason,
            'executed_at_utc' => now('UTC')->toIso8601String(),
            'manifest' => $manifest,
            'summary' => $summary,
            'warnings' => array_values(array_unique($warnings)),
        ];
    }

    /**
     * @param  array<int, string>  $warnings
     * @return array{
     *   0:array<int, array{
     *     type:'calendar'|'address_book',
     *     archive_path:string,
     *     owner_id:int,
     *     file_stem:string,
     *     contents:string
     *   }>,
     *   1:array<string, mixed>|null,
     *   2:array<int, int>
     * }
     */
    private function readArchiveEntries(string $archivePath, array &$warnings): array
    {
        $zip = new ZipArchive;
        $opened = $zip->open($archivePath);
        if ($opened !== true) {
            throw new RuntimeException('Unable to open backup archive.');
        }

        $entries = [];
        $ownerIds = [];
        $manifest = null;

        try {
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $entryName = $zip->getNameIndex($index);
                if (! is_string($entryName) || $entryName === '' || str_ends_with($entryName, '/')) {
                    continue;
                }

                if ($entryName === 'manifest.json') {
                    $manifestPayload = $zip->getFromIndex($index);
                    if (is_string($manifestPayload)) {
                        $decoded = json_decode($manifestPayload, true);
                        if (is_array($decoded)) {
                            $manifest = $decoded;
                        } else {
                            $warnings[] = 'manifest.json exists but could not be parsed as JSON.';
                        }
                    }

                    continue;
                }

                $matchType = null;
                $ownerId = null;
                $fileStem = null;
                if (preg_match('#^calendars/user-(\d+)/([^/]+)\.ics$#i', $entryName, $matches) === 1) {
                    $matchType = 'calendar';
                    $ownerId = (int) $matches[1];
                    $fileStem = (string) $matches[2];
                } elseif (preg_match('#^address-books/user-(\d+)/([^/]+)\.vcf$#i', $entryName, $matches) === 1) {
                    $matchType = 'address_book';
                    $ownerId = (int) $matches[1];
                    $fileStem = (string) $matches[2];
                } else {
                    continue;
                }

                $contents = $zip->getFromIndex($index);
                if (! is_string($contents)) {
                    $warnings[] = sprintf('Skipping unreadable archive entry "%s".', $entryName);

                    continue;
                }

                $ownerIds[] = $ownerId;
                $entries[] = [
                    'type' => $matchType,
                    'archive_path' => $entryName,
                    'owner_id' => $ownerId,
                    'file_stem' => $fileStem,
                    'contents' => $contents,
                ];
            }
        } finally {
            $zip->close();
        }

        $ownerIds = array_values(array_unique($ownerIds));
        sort($ownerIds);

        return [$entries, $manifest, $ownerIds];
    }

    /**
     * @param  array<int, string>  $uriPool
     * @param  array<string, int|null>  $summary
     * @return array{id:int|null,uri:string,display_name:string}
     */
    private function upsertCalendarCollection(
        int $ownerId,
        string $fileStem,
        bool $dryRun,
        string $mode,
        array &$uriPool,
        array &$summary,
    ): array {
        [$uriBase, $displayName] = $this->collectionIdentityFromStem($fileStem, 'calendar', 'Calendar');

        $existing = $mode === 'merge'
            ? Calendar::query()
                ->where('owner_id', $ownerId)
                ->where('uri', $uriBase)
                ->first()
            : null;

        if ($existing) {
            if ($existing->display_name !== $displayName) {
                $summary['calendars_updated']++;

                if (! $dryRun) {
                    $existing->update(['display_name' => $displayName]);
                }
            }

            if (! in_array($existing->uri, $uriPool, true)) {
                $uriPool[] = $existing->uri;
            }

            if (! $dryRun) {
                $this->syncService->ensureResource(ShareResourceType::Calendar, (int) $existing->id);
            }

            return [
                'id' => (int) $existing->id,
                'uri' => (string) $existing->uri,
                'display_name' => (string) $existing->display_name,
            ];
        }

        $nextUri = $this->nextUniqueCollectionUri($uriBase, $uriPool);
        $summary['calendars_created']++;

        if ($dryRun) {
            return [
                'id' => null,
                'uri' => $nextUri,
                'display_name' => $displayName,
            ];
        }

        $calendar = Calendar::query()->create([
            'owner_id' => $ownerId,
            'uri' => $nextUri,
            'display_name' => $displayName,
            'description' => null,
            'color' => null,
            'timezone' => null,
            'is_default' => false,
            'is_sharable' => false,
        ]);
        $this->syncService->ensureResource(ShareResourceType::Calendar, (int) $calendar->id);

        return [
            'id' => (int) $calendar->id,
            'uri' => $nextUri,
            'display_name' => $displayName,
        ];
    }

    /**
     * @param  array<int, string>  $uriPool
     * @param  array<string, int|null>  $summary
     * @return array{id:int|null,uri:string,display_name:string}
     */
    private function upsertAddressBookCollection(
        int $ownerId,
        string $fileStem,
        bool $dryRun,
        string $mode,
        array &$uriPool,
        array &$summary,
    ): array {
        [$uriBase, $displayName] = $this->collectionIdentityFromStem($fileStem, 'address-book', 'Address Book');

        $existing = $mode === 'merge'
            ? AddressBook::query()
                ->where('owner_id', $ownerId)
                ->where('uri', $uriBase)
                ->first()
            : null;

        if ($existing) {
            if ($existing->display_name !== $displayName) {
                $summary['address_books_updated']++;

                if (! $dryRun) {
                    $existing->update(['display_name' => $displayName]);
                }
            }

            if (! in_array($existing->uri, $uriPool, true)) {
                $uriPool[] = $existing->uri;
            }

            if (! $dryRun) {
                $this->syncService->ensureResource(ShareResourceType::AddressBook, (int) $existing->id);
            }

            return [
                'id' => (int) $existing->id,
                'uri' => (string) $existing->uri,
                'display_name' => (string) $existing->display_name,
            ];
        }

        $nextUri = $this->nextUniqueCollectionUri($uriBase, $uriPool);
        $summary['address_books_created']++;

        if ($dryRun) {
            return [
                'id' => null,
                'uri' => $nextUri,
                'display_name' => $displayName,
            ];
        }

        $addressBook = AddressBook::query()->create([
            'owner_id' => $ownerId,
            'uri' => $nextUri,
            'display_name' => $displayName,
            'description' => null,
            'is_default' => false,
            'is_sharable' => false,
        ]);
        $this->syncService->ensureResource(ShareResourceType::AddressBook, (int) $addressBook->id);

        return [
            'id' => (int) $addressBook->id,
            'uri' => $nextUri,
            'display_name' => $displayName,
        ];
    }

    /**
     * @return array{0:string,1:string}
     */
    private function collectionIdentityFromStem(string $fileStem, string $fallbackUriStem, string $fallbackDisplayName): array
    {
        $rawStem = trim($fileStem);
        $displayStem = $rawStem;

        if (preg_match('/^\d+-(.+)$/', $rawStem, $matches) === 1) {
            $displayStem = (string) ($matches[1] ?? $displayStem);
        }

        // Keep numeric ID prefixes from archive stems in URI generation so
        // same-name collections from the same owner restore as distinct resources.
        $uri = Str::slug($rawStem);
        if ($uri === '') {
            $uri = $fallbackUriStem;
        }

        $displayName = Str::of($displayStem)
            ->replace(['-', '_'], ' ')
            ->squish()
            ->title()
            ->value();
        if ($displayName === '') {
            $displayName = $fallbackDisplayName;
        }

        return [$uri, $displayName];
    }

    /**
     * @param  array<int, string>  $uriPool
     */
    private function nextUniqueCollectionUri(string $baseUri, array &$uriPool): string
    {
        $seed = Str::slug($baseUri);
        if ($seed === '') {
            $seed = 'resource';
        }

        $candidate = $seed;
        $counter = 2;
        while (in_array($candidate, $uriPool, true)) {
            $candidate = $seed.'-'.$counter;
            $counter++;
        }

        $uriPool[] = $candidate;

        return $candidate;
    }

    /**
     * @param  array<int, string>  $uriPool
     */
    private function nextUniqueResourceUri(
        string $candidate,
        string $extension,
        string $fallbackStem,
        array &$uriPool,
    ): string {
        $normalized = $this->normalizeResourceUri($candidate, $extension, $fallbackStem);
        $base = pathinfo($normalized, PATHINFO_FILENAME);
        $ext = pathinfo($normalized, PATHINFO_EXTENSION);

        $next = $normalized;
        $counter = 2;
        while (in_array($next, $uriPool, true)) {
            $next = sprintf('%s-%d.%s', $base, $counter, $ext);
            $counter++;
        }

        $uriPool[] = $next;

        return $next;
    }

    private function normalizeResourceUri(string $candidate, string $extension, string $fallbackStem): string
    {
        $stem = Str::slug(pathinfo(trim($candidate), PATHINFO_FILENAME));
        if ($stem === '') {
            $stem = $fallbackStem;
        }

        $ext = Str::lower(pathinfo(trim($candidate), PATHINFO_EXTENSION));
        if ($ext === '') {
            $ext = $extension;
        }

        return $stem.'.'.$ext;
    }

    /**
     * @return array<int, array{uri_candidate:string,payload:string}>
     */
    private function splitCalendarPayload(string $payload, string $archivePath): array
    {
        $component = Reader::read($payload);
        if (! $component instanceof VCalendar) {
            throw new RuntimeException(sprintf('Entry "%s" does not contain a VCALENDAR payload.', $archivePath));
        }

        $timezones = [];
        foreach ($component->select('VTIMEZONE') as $timezoneComponent) {
            if ($timezoneComponent instanceof Component) {
                $timezones[] = clone $timezoneComponent;
            }
        }

        $primaryComponents = [];
        foreach (['VEVENT', 'VTODO', 'VJOURNAL'] as $type) {
            foreach ($component->select($type) as $child) {
                if ($child instanceof Component) {
                    $primaryComponents[] = clone $child;
                }
            }
        }

        if ($primaryComponents === []) {
            return [];
        }

        $groups = [];
        $counter = 1;
        foreach ($primaryComponents as $child) {
            $uid = trim((string) ($child->UID ?? ''));
            $groupKey = $uid !== '' ? mb_strtolower($uid) : 'item-'.$counter;
            $counter++;

            if (! isset($groups[$groupKey])) {
                $groups[$groupKey] = [
                    'uid' => $uid !== '' ? $uid : null,
                    'components' => [],
                ];
            }

            $groups[$groupKey]['components'][] = $child;
        }

        $resources = [];
        $groupIndex = 1;
        foreach ($groups as $group) {
            $resourceCalendar = new VCalendar([
                'VERSION' => '2.0',
                'PRODID' => '-//Davvy//Backup Restore//EN',
            ]);

            foreach ($timezones as $timezoneComponent) {
                $resourceCalendar->add(clone $timezoneComponent);
            }

            foreach ($group['components'] as $child) {
                $resourceCalendar->add(clone $child);
            }

            $uid = is_string($group['uid']) ? trim($group['uid']) : '';
            $stem = $uid !== ''
                ? (Str::slug($uid) !== '' ? Str::slug($uid) : 'item-'.substr(sha1($uid), 0, 12))
                : 'item-'.$groupIndex;

            $resources[] = [
                'uri_candidate' => $stem.'.ics',
                'payload' => $resourceCalendar->serialize(),
            ];
            $groupIndex++;
        }

        return $resources;
    }

    /**
     * @return array<int, array{uri_candidate:string,payload:string}>
     */
    private function splitAddressBookPayload(string $payload, string $archivePath): array
    {
        $resources = [];

        preg_match_all('/BEGIN:VCARD[\s\S]*?END:VCARD/iu', $payload, $matches);
        $cards = is_array($matches[0] ?? null) ? $matches[0] : [];

        if ($cards === []) {
            throw new RuntimeException(sprintf('Entry "%s" does not contain any VCARD payloads.', $archivePath));
        }

        $index = 1;
        foreach ($cards as $cardPayload) {
            $trimmed = trim((string) $cardPayload);
            if ($trimmed === '') {
                continue;
            }

            $normalizedPayload = $trimmed."\r\n";
            $uid = $this->vCardValidator->extractUid($normalizedPayload);
            $stem = $uid !== null && trim($uid) !== ''
                ? (Str::slug($uid) !== '' ? Str::slug($uid) : 'card-'.substr(sha1($uid), 0, 12))
                : 'card-'.$index;

            $resources[] = [
                'uri_candidate' => $stem.'.vcf',
                'payload' => $normalizedPayload,
            ];
            $index++;
        }

        return $resources;
    }
}
