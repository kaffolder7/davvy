<?php

namespace App\Services\Contacts;

use App\Enums\ContactChangeOperation;
use App\Enums\ContactChangeStatus;
use App\Enums\SharePermission;
use App\Models\AddressBook;
use App\Models\Card;
use App\Models\Contact;
use App\Models\ContactChangeRequest;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use App\Services\ResourceAccessService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ContactChangeRequestService
{
    public function __construct(
        private readonly ContactService $contactService,
        private readonly ContactVCardService $vCardService,
        private readonly ResourceAccessService $accessService,
        private readonly RegistrationSettingsService $settingsService,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, int>  $addressBookIds
     * @return array{group_uuid:string,request_ids:array<int,int>,owner_ids:array<int,int>}|null
     */
    public function enqueueWebUpdateIfNeeded(
        User $actor,
        Contact $contact,
        array $payload,
        array $addressBookIds,
    ): ?array {
        if (! $this->contactService->canUserWriteContact($actor, $contact)) {
            abort(403, 'You cannot modify this contact.');
        }

        $this->assertUserCanWriteAddressBooks($actor, $addressBookIds);

        return $this->enqueueIfNeeded(
            actor: $actor,
            contact: $contact,
            operation: ContactChangeOperation::Update,
            proposedPayload: $payload,
            proposedAddressBookIds: $addressBookIds,
            source: 'web',
            meta: [],
        );
    }

    /**
     * @return array{group_uuid:string,request_ids:array<int,int>,owner_ids:array<int,int>}|null
     */
    public function enqueueWebDeleteIfNeeded(User $actor, Contact $contact): ?array
    {
        if (! $this->contactService->canUserWriteContact($actor, $contact)) {
            abort(403, 'You cannot modify this contact.');
        }

        return $this->enqueueIfNeeded(
            actor: $actor,
            contact: $contact,
            operation: ContactChangeOperation::Delete,
            proposedPayload: null,
            proposedAddressBookIds: null,
            source: 'web',
            meta: [],
        );
    }

    /**
     * @return array{group_uuid:string,request_ids:array<int,int>,owner_ids:array<int,int>}|null
     */
    public function enqueueCardDavUpdateIfNeeded(
        User $actor,
        AddressBook $addressBook,
        Card $card,
        string $normalizedCardData,
    ): ?array {
        $assignment = $card->contactAssignment()->with('contact')->first();
        $contact = $assignment?->contact;

        if (! $contact) {
            return null;
        }

        $parsed = $this->vCardService->parse($normalizedCardData);
        if (! is_array($parsed) || ! is_array($parsed['payload'] ?? null)) {
            return null;
        }

        return $this->enqueueIfNeeded(
            actor: $actor,
            contact: $contact,
            operation: ContactChangeOperation::Update,
            proposedPayload: $parsed['payload'],
            proposedAddressBookIds: $this->contactService->addressBookIdsForContact($contact),
            source: 'carddav',
            meta: [
                'address_book_id' => $addressBook->id,
                'card_id' => $card->id,
                'card_uri' => $card->uri,
            ],
        );
    }

    /**
     * @return array{group_uuid:string,request_ids:array<int,int>,owner_ids:array<int,int>}|null
     */
    public function enqueueCardDavDeleteIfNeeded(User $actor, AddressBook $addressBook, Card $card): ?array
    {
        $assignment = $card->contactAssignment()->with('contact')->first();
        $contact = $assignment?->contact;

        if (! $contact) {
            return null;
        }

        return $this->enqueueIfNeeded(
            actor: $actor,
            contact: $contact,
            operation: ContactChangeOperation::Delete,
            proposedPayload: null,
            proposedAddressBookIds: null,
            source: 'carddav',
            meta: [
                'address_book_id' => $addressBook->id,
                'card_id' => $card->id,
                'card_uri' => $card->uri,
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Collection<int, ContactChangeRequest>
     */
    public function requestsForReviewer(User $reviewer, array $filters = []): Collection
    {
        $this->purgeExpiredTerminalRequests();

        $query = ContactChangeRequest::query()
            ->with([
                'requester:id,name,email',
                'approvalOwner:id,name,email',
                'reviewer:id,name,email',
            ])
            ->orderByDesc('id');

        if (! $reviewer->isAdmin()) {
            $query->where('approval_owner_id', $reviewer->id);
        }

        $statusFilter = strtolower((string) ($filters['status'] ?? 'open'));
        $this->applyStatusFilter($query, $statusFilter);

        $operationFilter = strtolower((string) ($filters['operation'] ?? 'all'));
        if (in_array($operationFilter, [ContactChangeOperation::Update->value, ContactChangeOperation::Delete->value], true)) {
            $query->where('operation', $operationFilter);
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('contact_display_name', 'like', '%'.$search.'%')
                    ->orWhere('contact_uid', 'like', '%'.$search.'%')
                    ->orWhereHas('requester', function (Builder $requesterQuery) use ($search): void {
                        $requesterQuery
                            ->where('name', 'like', '%'.$search.'%')
                            ->orWhere('email', 'like', '%'.$search.'%');
                    });
            });
        }

        $limit = (int) ($filters['limit'] ?? 200);
        $query->limit(max(1, min(500, $limit)));

        return $query->get();
    }

    public function pendingReviewCount(User $reviewer): int
    {
        $this->purgeExpiredTerminalRequests();

        $query = ContactChangeRequest::query()
            ->whereIn('status', [
                ContactChangeStatus::Pending->value,
                ContactChangeStatus::ManualMergeNeeded->value,
            ]);

        if (! $reviewer->isAdmin()) {
            $query->where('approval_owner_id', $reviewer->id);
        }

        return (int) $query->count();
    }

    /**
     * @param  array<string, mixed>|null  $resolvedPayload
     * @param  array<int, int>|null  $resolvedAddressBookIds
     */
    public function approve(
        User $reviewer,
        ContactChangeRequest $request,
        ?array $resolvedPayload = null,
        ?array $resolvedAddressBookIds = null,
    ): ContactChangeRequest {
        $this->purgeExpiredTerminalRequests();

        return DB::transaction(function () use ($reviewer, $request, $resolvedPayload, $resolvedAddressBookIds): ContactChangeRequest {
            $lockedRequest = ContactChangeRequest::query()
                ->where('id', $request->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->assertReviewerCanAct($reviewer, $lockedRequest);

            if ($lockedRequest->status->isTerminal()) {
                return $lockedRequest->fresh(['requester', 'approvalOwner', 'reviewer']);
            }

            $groupRows = $this->groupRowsForUpdate($lockedRequest->group_uuid);

            if ($resolvedPayload !== null || $resolvedAddressBookIds !== null) {
                $this->applyResolutionToGroup($lockedRequest->group_uuid, $resolvedPayload, $resolvedAddressBookIds);
                $groupRows = $this->groupRowsForUpdate($lockedRequest->group_uuid);
            }

            if ($groupRows->contains(fn (ContactChangeRequest $row): bool => $row->status === ContactChangeStatus::ManualMergeNeeded)) {
                $hasResolution = $groupRows->contains(
                    fn (ContactChangeRequest $row): bool => is_array($row->resolved_payload)
                        || is_array($row->resolved_address_book_ids)
                );

                if (! $hasResolution) {
                    throw ValidationException::withMessages([
                        'resolved_payload' => ['Resolve merge conflicts before approving this request.'],
                    ]);
                }

                ContactChangeRequest::query()
                    ->where('group_uuid', $lockedRequest->group_uuid)
                    ->where('status', ContactChangeStatus::ManualMergeNeeded->value)
                    ->update([
                        'status' => ContactChangeStatus::Approved->value,
                        'status_reason' => null,
                    ]);

                $groupRows = $this->groupRowsForUpdate($lockedRequest->group_uuid);
            }

            ContactChangeRequest::query()
                ->where('id', $lockedRequest->id)
                ->update([
                    'status' => ContactChangeStatus::Approved->value,
                    'reviewer_id' => $reviewer->id,
                    'reviewed_at' => now(),
                    'status_reason' => null,
                ]);

            $groupRows = $this->groupRowsForUpdate($lockedRequest->group_uuid);

            $allApproved = $groupRows->every(
                fn (ContactChangeRequest $row): bool => $row->status === ContactChangeStatus::Approved
                    || $row->status === ContactChangeStatus::Applied
            );

            if ($allApproved) {
                $this->applyApprovedGroup($groupRows, $reviewer);
            }

            return ContactChangeRequest::query()
                ->with(['requester', 'approvalOwner', 'reviewer'])
                ->findOrFail($lockedRequest->id);
        });
    }

    public function deny(User $reviewer, ContactChangeRequest $request): ContactChangeRequest
    {
        $this->purgeExpiredTerminalRequests();

        return DB::transaction(function () use ($reviewer, $request): ContactChangeRequest {
            $lockedRequest = ContactChangeRequest::query()
                ->where('id', $request->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->assertReviewerCanAct($reviewer, $lockedRequest);

            if ($lockedRequest->status->isTerminal()) {
                return $lockedRequest->fresh(['requester', 'approvalOwner', 'reviewer']);
            }

            ContactChangeRequest::query()
                ->where('group_uuid', $lockedRequest->group_uuid)
                ->whereNotIn('status', [
                    ContactChangeStatus::Applied->value,
                    ContactChangeStatus::Denied->value,
                ])
                ->update([
                    'status' => ContactChangeStatus::Denied->value,
                    'reviewer_id' => $reviewer->id,
                    'reviewed_at' => now(),
                    'status_reason' => 'Denied by reviewer.',
                ]);

            return ContactChangeRequest::query()
                ->with(['requester', 'approvalOwner', 'reviewer'])
                ->findOrFail($lockedRequest->id);
        });
    }

    /**
     * @param  array<int, int>  $requestIds
     * @return array{processed:int,approved:int,denied:int,skipped:int}
     */
    public function bulkAction(User $reviewer, string $action, array $requestIds): array
    {
        $ids = collect($requestIds)
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        $summary = [
            'processed' => 0,
            'approved' => 0,
            'denied' => 0,
            'skipped' => 0,
        ];

        $processedGroups = [];

        $requests = ContactChangeRequest::query()
            ->whereIn('id', $ids)
            ->get();

        foreach ($requests as $request) {
            if (isset($processedGroups[$request->group_uuid])) {
                $summary['skipped']++;

                continue;
            }

            if (! $reviewer->isAdmin() && $request->approval_owner_id !== $reviewer->id) {
                $summary['skipped']++;

                continue;
            }

            $processedGroups[$request->group_uuid] = true;

            try {
                if ($action === 'approve') {
                    $this->approve($reviewer, $request);
                    $summary['approved']++;
                } elseif ($action === 'deny') {
                    $this->deny($reviewer, $request);
                    $summary['denied']++;
                } else {
                    $summary['skipped']++;

                    continue;
                }

                $summary['processed']++;
            } catch (\Throwable) {
                $summary['skipped']++;
            }
        }

        return $summary;
    }

    public function purgeExpiredTerminalRequests(): int
    {
        $retentionDays = $this->settingsService->contactChangeRequestRetentionDays();

        return ContactChangeRequest::query()
            ->whereIn('status', [ContactChangeStatus::Applied->value, ContactChangeStatus::Denied->value])
            ->where('created_at', '<', now()->subDays($retentionDays))
            ->delete();
    }

    /**
     * @param  array<string, mixed>|null  $proposedPayload
     * @param  array<int, int>|null  $proposedAddressBookIds
     * @param  array<string, mixed>  $meta
     * @return array{group_uuid:string,request_ids:array<int,int>,owner_ids:array<int,int>}|null
     */
    private function enqueueIfNeeded(
        User $actor,
        Contact $contact,
        ContactChangeOperation $operation,
        ?array $proposedPayload,
        ?array $proposedAddressBookIds,
        string $source,
        array $meta,
    ): ?array {
        $this->purgeExpiredTerminalRequests();

        if (! $this->settingsService->isContactChangeModerationEnabled()) {
            return null;
        }

        $baseAddressBookIds = $this->normalizeAddressBookIds($this->contactService->addressBookIdsForContact($contact));
        $basePayload = is_array($contact->payload) ? $contact->payload : [];
        $requestedAddressBookIds = $operation === ContactChangeOperation::Update
            ? $this->normalizeAddressBookIds($proposedAddressBookIds ?? $baseAddressBookIds)
            : null;

        $impactedAddressBookIds = $this->normalizeAddressBookIds(
            $operation === ContactChangeOperation::Update
                ? [...$baseAddressBookIds, ...($requestedAddressBookIds ?? [])]
                : $baseAddressBookIds,
        );

        if ($impactedAddressBookIds === []) {
            return null;
        }

        $impactedBooks = AddressBook::query()
            ->whereIn('id', $impactedAddressBookIds)
            ->get()
            ->keyBy('id');

        if ($impactedBooks->count() !== count($impactedAddressBookIds)) {
            throw ValidationException::withMessages([
                'address_book_ids' => ['One or more selected address books could not be found.'],
            ]);
        }

        $queueOwnerIds = $this->queueOwnerIdsFor($actor, $impactedBooks->values());

        if ($queueOwnerIds === []) {
            return null;
        }

        $requestFingerprint = hash('sha256', json_encode([
            'operation' => $operation->value,
            'contact_id' => $contact->id,
            'contact_uid' => $contact->uid,
            'base_updated_at' => $contact->updated_at?->toIso8601String(),
            'base_payload' => $basePayload,
            'base_address_book_ids' => $baseAddressBookIds,
            'proposed_payload' => $proposedPayload,
            'proposed_address_book_ids' => $requestedAddressBookIds,
            'source' => $source,
            'meta' => $meta,
            'queue_owner_ids' => $queueOwnerIds,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        $existing = ContactChangeRequest::query()
            ->where('requester_id', $actor->id)
            ->where('contact_id', $contact->id)
            ->where('operation', $operation->value)
            ->where('request_fingerprint', $requestFingerprint)
            ->whereIn('status', [
                ContactChangeStatus::Pending->value,
                ContactChangeStatus::Approved->value,
                ContactChangeStatus::ManualMergeNeeded->value,
            ])
            ->orderByDesc('id')
            ->first();

        if ($existing) {
            $existingIds = ContactChangeRequest::query()
                ->where('group_uuid', $existing->group_uuid)
                ->pluck('id')
                ->map(fn (mixed $id): int => (int) $id)
                ->all();

            return [
                'group_uuid' => $existing->group_uuid,
                'request_ids' => $existingIds,
                'owner_ids' => $queueOwnerIds,
            ];
        }

        $groupUuid = (string) Str::uuid();
        $rows = [];

        foreach ($queueOwnerIds as $ownerId) {
            $scopeIds = $impactedBooks
                ->filter(fn (AddressBook $book): bool => (int) $book->owner_id === $ownerId)
                ->keys()
                ->map(fn (mixed $id): int => (int) $id)
                ->values()
                ->all();

            $rows[] = ContactChangeRequest::query()->create([
                'group_uuid' => $groupUuid,
                'approval_owner_id' => $ownerId,
                'requester_id' => $actor->id,
                'contact_id' => $contact->id,
                'contact_uid' => $contact->uid,
                'contact_display_name' => $contact->full_name ?: $this->vCardService->displayName($basePayload),
                'operation' => $operation->value,
                'status' => ContactChangeStatus::Pending->value,
                'scope_address_book_ids' => $scopeIds,
                'base_payload' => $basePayload,
                'base_address_book_ids' => $baseAddressBookIds,
                'base_contact_updated_at' => $contact->updated_at,
                'proposed_payload' => $proposedPayload,
                'proposed_address_book_ids' => $requestedAddressBookIds,
                'request_fingerprint' => $requestFingerprint,
                'source' => $source,
                'meta' => $meta !== [] ? $meta : null,
            ]);
        }

        return [
            'group_uuid' => $groupUuid,
            'request_ids' => collect($rows)->pluck('id')->map(fn (mixed $id): int => (int) $id)->all(),
            'owner_ids' => $queueOwnerIds,
        ];
    }

    /**
     * @param  Collection<int, AddressBook>  $addressBooks
     * @return array<int, int>
     */
    private function queueOwnerIdsFor(User $actor, Collection $addressBooks): array
    {
        if ($actor->isAdmin()) {
            return [];
        }

        $ownerIds = [];

        foreach ($addressBooks as $addressBook) {
            $ownerId = (int) $addressBook->owner_id;
            if ($ownerId === $actor->id) {
                continue;
            }

            $permission = $this->accessService->addressBookPermission($actor, $addressBook);
            if ($permission === SharePermission::Admin) {
                continue;
            }

            $ownerIds[$ownerId] = true;
        }

        $keys = array_keys($ownerIds);
        sort($keys);

        return $keys;
    }

    /**
     * @param  array<int, int>  $addressBookIds
     */
    private function assertUserCanWriteAddressBooks(User $actor, array $addressBookIds): void
    {
        $ids = $this->normalizeAddressBookIds($addressBookIds);
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
                    'address_book_ids' => ['You do not have write access to one or more selected address books.'],
                ]);
            }
        }
    }

    private function applyStatusFilter(Builder $query, string $statusFilter): void
    {
        if ($statusFilter === 'all') {
            return;
        }

        if ($statusFilter === 'open') {
            $query->whereIn('status', [
                ContactChangeStatus::Pending->value,
                ContactChangeStatus::Approved->value,
                ContactChangeStatus::ManualMergeNeeded->value,
            ]);

            return;
        }

        if ($statusFilter === 'history') {
            $query->whereIn('status', [
                ContactChangeStatus::Applied->value,
                ContactChangeStatus::Denied->value,
            ]);

            return;
        }

        $known = [
            ContactChangeStatus::Pending->value,
            ContactChangeStatus::Approved->value,
            ContactChangeStatus::Denied->value,
            ContactChangeStatus::ManualMergeNeeded->value,
            ContactChangeStatus::Applied->value,
        ];

        if (in_array($statusFilter, $known, true)) {
            $query->where('status', $statusFilter);

            return;
        }

        $query->where('status', ContactChangeStatus::Pending->value);
    }

    private function assertReviewerCanAct(User $reviewer, ContactChangeRequest $request): void
    {
        if ($reviewer->isAdmin()) {
            return;
        }

        if ((int) $request->approval_owner_id !== $reviewer->id) {
            abort(403, 'You cannot review this request.');
        }
    }

    /**
     * @param  array<string, mixed>|null  $resolvedPayload
     * @param  array<int, int>|null  $resolvedAddressBookIds
     */
    private function applyResolutionToGroup(
        string $groupUuid,
        ?array $resolvedPayload,
        ?array $resolvedAddressBookIds,
    ): void {
        $attributes = [];

        if ($resolvedPayload !== null) {
            $attributes['resolved_payload'] = $resolvedPayload;
        }

        if ($resolvedAddressBookIds !== null) {
            $attributes['resolved_address_book_ids'] = $this->normalizeAddressBookIds($resolvedAddressBookIds);
        }

        if ($attributes === []) {
            return;
        }

        ContactChangeRequest::query()
            ->where('group_uuid', $groupUuid)
            ->whereNotIn('status', [
                ContactChangeStatus::Applied->value,
                ContactChangeStatus::Denied->value,
            ])
            ->update($attributes);
    }

    /**
     * @return Collection<int, ContactChangeRequest>
     */
    private function groupRowsForUpdate(string $groupUuid): Collection
    {
        return ContactChangeRequest::query()
            ->where('group_uuid', $groupUuid)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();
    }

    /**
     * @param  Collection<int, ContactChangeRequest>  $groupRows
     */
    private function applyApprovedGroup(Collection $groupRows, User $reviewer): void
    {
        if ($groupRows->isEmpty()) {
            return;
        }

        /** @var ContactChangeRequest $canonical */
        $canonical = $groupRows->first();
        $operation = $canonical->operation;

        if (! $operation) {
            return;
        }

        if ($operation === ContactChangeOperation::Delete) {
            $this->applyDeleteGroup($groupRows, $reviewer);

            return;
        }

        $this->applyUpdateGroup($groupRows, $reviewer);
    }

    /**
     * @param  Collection<int, ContactChangeRequest>  $groupRows
     */
    private function applyDeleteGroup(Collection $groupRows, User $reviewer): void
    {
        /** @var ContactChangeRequest $canonical */
        $canonical = $groupRows->first();

        $contact = Contact::query()->find($canonical->contact_id);
        if ($contact) {
            $this->contactService->applyApprovedDelete($contact);
        }

        ContactChangeRequest::query()
            ->where('group_uuid', $canonical->group_uuid)
            ->update([
                'status' => ContactChangeStatus::Applied->value,
                'status_reason' => null,
                'reviewer_id' => $reviewer->id,
                'reviewed_at' => now(),
                'applied_at' => now(),
            ]);
    }

    /**
     * @param  Collection<int, ContactChangeRequest>  $groupRows
     */
    private function applyUpdateGroup(Collection $groupRows, User $reviewer): void
    {
        /** @var ContactChangeRequest $canonical */
        $canonical = $groupRows->first();

        $contact = Contact::query()->find($canonical->contact_id);
        if (! $contact) {
            ContactChangeRequest::query()
                ->where('group_uuid', $canonical->group_uuid)
                ->update([
                    'status' => ContactChangeStatus::Denied->value,
                    'status_reason' => 'Contact no longer exists.',
                    'reviewer_id' => $reviewer->id,
                    'reviewed_at' => now(),
                ]);

            return;
        }

        $basePayload = is_array($canonical->base_payload) ? $canonical->base_payload : [];
        $baseAddressBookIds = $this->normalizeAddressBookIds($canonical->base_address_book_ids ?? []);

        $requestedPayload = is_array($canonical->resolved_payload)
            ? $canonical->resolved_payload
            : (is_array($canonical->proposed_payload) ? $canonical->proposed_payload : []);
        $requestedAddressBookIds = $this->normalizeAddressBookIds(
            is_array($canonical->resolved_address_book_ids)
                ? $canonical->resolved_address_book_ids
                : (is_array($canonical->proposed_address_book_ids) ? $canonical->proposed_address_book_ids : $baseAddressBookIds),
        );

        $currentPayload = is_array($contact->payload) ? $contact->payload : [];
        $currentAddressBookIds = $this->normalizeAddressBookIds($this->contactService->addressBookIdsForContact($contact));

        $desiredPayload = $requestedPayload;
        $desiredAddressBookIds = $requestedAddressBookIds;

        $contactUnchanged = $this->valuesEqual($basePayload, $currentPayload)
            && $baseAddressBookIds === $currentAddressBookIds;

        if (! $contactUnchanged && ! $this->isManualResolutionRequest($groupRows)) {
            $proposedChangedKeys = $this->changedTopLevelKeys($basePayload, $requestedPayload);
            $currentChangedKeys = $this->changedTopLevelKeys($basePayload, $currentPayload);

            $overlappingPayloadKeys = array_values(array_intersect($proposedChangedKeys, $currentChangedKeys));
            $assignmentConflict = $this->hasAssignmentConflict(
                $baseAddressBookIds,
                $requestedAddressBookIds,
                $currentAddressBookIds,
            );

            if ($overlappingPayloadKeys !== [] || $assignmentConflict) {
                ContactChangeRequest::query()
                    ->where('group_uuid', $canonical->group_uuid)
                    ->update([
                        'status' => ContactChangeStatus::ManualMergeNeeded->value,
                        'status_reason' => 'Contact changed since request creation. Resolve conflicts before approving.',
                    ]);

                return;
            }

            $desiredPayload = $this->mergePayload($currentPayload, $requestedPayload, $proposedChangedKeys);
            $desiredAddressBookIds = $this->resolveAddressBookIds(
                $baseAddressBookIds,
                $requestedAddressBookIds,
                $currentAddressBookIds,
            );
        }

        $updated = $this->contactService->applyApprovedUpdate(
            contact: $contact,
            payload: $desiredPayload,
            addressBookIds: $desiredAddressBookIds,
        );

        ContactChangeRequest::query()
            ->where('group_uuid', $canonical->group_uuid)
            ->update([
                'status' => ContactChangeStatus::Applied->value,
                'status_reason' => null,
                'reviewer_id' => $reviewer->id,
                'reviewed_at' => now(),
                'applied_at' => now(),
                'applied_payload' => is_array($updated->payload) ? $updated->payload : [],
                'applied_address_book_ids' => $this->normalizeAddressBookIds(
                    $this->contactService->addressBookIdsForContact($updated),
                ),
                'contact_display_name' => $updated->full_name,
            ]);
    }

    /**
     * @param  Collection<int, ContactChangeRequest>  $groupRows
     */
    private function isManualResolutionRequest(Collection $groupRows): bool
    {
        return $groupRows->contains(
            fn (ContactChangeRequest $row): bool => is_array($row->resolved_payload)
                || is_array($row->resolved_address_book_ids)
        );
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>  $updated
     * @return array<int, string>
     */
    private function changedTopLevelKeys(array $base, array $updated): array
    {
        $keys = array_unique([
            ...array_keys($base),
            ...array_keys($updated),
        ]);

        $changed = [];
        foreach ($keys as $key) {
            $baseExists = array_key_exists($key, $base);
            $updatedExists = array_key_exists($key, $updated);
            $baseValue = $baseExists ? $base[$key] : null;
            $updatedValue = $updatedExists ? $updated[$key] : null;

            if (! $baseExists || ! $updatedExists || ! $this->valuesEqual($baseValue, $updatedValue)) {
                $changed[] = (string) $key;
            }
        }

        sort($changed);

        return $changed;
    }

    /**
     * @param  array<string, mixed>  $current
     * @param  array<string, mixed>  $requested
     * @param  array<int, string>  $requestedChangedKeys
     * @return array<string, mixed>
     */
    private function mergePayload(array $current, array $requested, array $requestedChangedKeys): array
    {
        $merged = $current;

        foreach ($requestedChangedKeys as $key) {
            if (array_key_exists($key, $requested)) {
                $merged[$key] = $requested[$key];

                continue;
            }

            unset($merged[$key]);
        }

        return $merged;
    }

    /**
     * @param  array<int, int>  $baseIds
     * @param  array<int, int>  $requestedIds
     * @param  array<int, int>  $currentIds
     */
    private function hasAssignmentConflict(array $baseIds, array $requestedIds, array $currentIds): bool
    {
        $requestedChanged = $baseIds !== $requestedIds;
        $currentChanged = $baseIds !== $currentIds;

        return $requestedChanged && $currentChanged && $requestedIds !== $currentIds;
    }

    /**
     * @param  array<int, int>  $baseIds
     * @param  array<int, int>  $requestedIds
     * @param  array<int, int>  $currentIds
     * @return array<int, int>
     */
    private function resolveAddressBookIds(array $baseIds, array $requestedIds, array $currentIds): array
    {
        $requestedChanged = $baseIds !== $requestedIds;

        if (! $requestedChanged) {
            return $currentIds;
        }

        return $requestedIds;
    }

    private function valuesEqual(mixed $left, mixed $right): bool
    {
        return json_encode($left, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            === json_encode($right, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    /**
     * @param  array<int, mixed>  $addressBookIds
     * @return array<int, int>
     */
    private function normalizeAddressBookIds(array $addressBookIds): array
    {
        $ids = collect($addressBookIds)
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        sort($ids);

        return $ids;
    }
}
