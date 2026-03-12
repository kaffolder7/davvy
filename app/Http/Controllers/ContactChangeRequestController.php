<?php

namespace App\Http\Controllers;

use App\Models\ContactChangeRequest;
use App\Services\Contacts\ContactChangeRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContactChangeRequestController extends Controller
{
    public function __construct(
        private readonly ContactChangeRequestService $changeRequestService,
    ) {}

    /**
     * Lists resources.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function index(Request $request): JsonResponse
    {
        $filters = [
            'status' => $request->query('status', 'open'),
            'operation' => $request->query('operation', 'all'),
            'search' => $request->query('search', ''),
            'limit' => $request->query('limit', 200),
        ];

        $rows = $this->changeRequestService
            ->requestsForReviewer($request->user(), $filters)
            ->map(fn (ContactChangeRequest $row): array => $this->serializeRow($row))
            ->all();

        return response()->json([
            'data' => $rows,
        ]);
    }

    /**
     * Returns summary data.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function summary(Request $request): JsonResponse
    {
        return response()->json([
            'needs_review_count' => $this->changeRequestService->pendingReviewCount($request->user()),
        ]);
    }

    /**
     * Approves the request.
     *
     * @param  Request  $request
     * @param  ContactChangeRequest  $contactChangeRequest
     * @return JsonResponse
     */
    public function approve(Request $request, ContactChangeRequest $contactChangeRequest): JsonResponse
    {
        $data = $request->validate([
            'resolved_payload' => ['nullable', 'array'],
            'resolved_address_book_ids' => ['nullable', 'array'],
            'resolved_address_book_ids.*' => ['integer', 'min:1'],
        ]);

        $approved = $this->changeRequestService->approve(
            reviewer: $request->user(),
            request: $contactChangeRequest,
            resolvedPayload: is_array($data['resolved_payload'] ?? null) ? $data['resolved_payload'] : null,
            resolvedAddressBookIds: is_array($data['resolved_address_book_ids'] ?? null)
                ? $data['resolved_address_book_ids']
                : null,
        );

        return response()->json([
            'data' => $this->serializeRow($approved),
        ]);
    }

    /**
     * Denies the request.
     *
     * @param  Request  $request
     * @param  ContactChangeRequest  $contactChangeRequest
     * @return JsonResponse
     */
    public function deny(Request $request, ContactChangeRequest $contactChangeRequest): JsonResponse
    {
        $denied = $this->changeRequestService->deny($request->user(), $contactChangeRequest);

        return response()->json([
            'data' => $this->serializeRow($denied),
        ]);
    }

    /**
     * Processes a bulk action.
     *
     * @param  Request  $request
     * @return JsonResponse
     */
    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:approve,deny'],
            'request_ids' => ['required', 'array', 'min:1'],
            'request_ids.*' => ['integer', 'min:1'],
        ]);

        $summary = $this->changeRequestService->bulkAction(
            reviewer: $request->user(),
            action: (string) $data['action'],
            requestIds: $data['request_ids'],
        );

        return response()->json($summary);
    }

    /**
     * Returns serialize row.
     *
     * @param  ContactChangeRequest  $row
     * @return array
     */
    private function serializeRow(ContactChangeRequest $row): array
    {
        $basePayload = is_array($row->base_payload) ? $row->base_payload : [];
        $requestedPayload = is_array($row->resolved_payload)
            ? $row->resolved_payload
            : (is_array($row->proposed_payload) ? $row->proposed_payload : []);

        return [
            'id' => $row->id,
            'group_uuid' => $row->group_uuid,
            'status' => $row->status?->value ?? (string) $row->status,
            'operation' => $row->operation?->value ?? (string) $row->operation,
            'source' => $row->source,
            'contact' => [
                'id' => $row->contact_id,
                'uid' => $row->contact_uid,
                'display_name' => $row->contact_display_name,
            ],
            'scope_address_book_ids' => is_array($row->scope_address_book_ids) ? $row->scope_address_book_ids : [],
            'base_payload' => $basePayload,
            'base_address_book_ids' => is_array($row->base_address_book_ids) ? $row->base_address_book_ids : [],
            'proposed_payload' => is_array($row->proposed_payload) ? $row->proposed_payload : [],
            'proposed_address_book_ids' => is_array($row->proposed_address_book_ids) ? $row->proposed_address_book_ids : [],
            'resolved_payload' => is_array($row->resolved_payload) ? $row->resolved_payload : null,
            'resolved_address_book_ids' => is_array($row->resolved_address_book_ids) ? $row->resolved_address_book_ids : null,
            'applied_payload' => is_array($row->applied_payload) ? $row->applied_payload : null,
            'applied_address_book_ids' => is_array($row->applied_address_book_ids) ? $row->applied_address_book_ids : null,
            'changed_fields' => $this->changedTopLevelKeys($basePayload, $requestedPayload),
            'status_reason' => $row->status_reason,
            'requester' => $row->requester ? [
                'id' => $row->requester->id,
                'name' => $row->requester->name,
                'email' => $row->requester->email,
            ] : null,
            'approval_owner' => $row->approvalOwner ? [
                'id' => $row->approvalOwner->id,
                'name' => $row->approvalOwner->name,
                'email' => $row->approvalOwner->email,
            ] : null,
            'reviewer' => $row->reviewer ? [
                'id' => $row->reviewer->id,
                'name' => $row->reviewer->name,
                'email' => $row->reviewer->email,
            ] : null,
            'created_at' => $row->created_at?->toIso8601String(),
            'reviewed_at' => $row->reviewed_at?->toIso8601String(),
            'applied_at' => $row->applied_at?->toIso8601String(),
        ];
    }

    /**
     * Returns changed top level keys.
     *
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
     * Checks whether values equal.
     *
     * @param  mixed  $left
     * @param  mixed  $right
     * @return bool
     */
    private function valuesEqual(mixed $left, mixed $right): bool
    {
        return json_encode($left, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            === json_encode($right, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
