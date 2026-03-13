<?php

namespace App\Http\Controllers;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Services\Contacts\ContactMilestoneCalendarService;
use App\Services\Dav\DavSyncService;
use App\Services\ResourceUriService;
use App\Services\ResourceDeletionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AddressBookController extends Controller
{
    public function __construct(
        private readonly DavSyncService $syncService,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
        private readonly ResourceUriService $resourceUriService,
        private readonly ResourceDeletionService $resourceDeletion,
    ) {}

    /**
     * Creates a new resource.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'display_name' => ['required', 'string', 'max:255'],
            'uri' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_sharable' => ['boolean'],
        ]);

        $uri = $this->resourceUriService->nextAddressBookUri(
            ownerId: (int) $request->user()->id,
            candidate: (string) ($data['uri'] ?? $data['display_name']),
        );

        $addressBook = AddressBook::query()->create([
            'owner_id' => $request->user()->id,
            'uri' => $uri,
            'display_name' => $data['display_name'],
            'description' => $data['description'] ?? null,
            'is_sharable' => (bool) ($data['is_sharable'] ?? false),
            'is_default' => false,
        ]);
        $this->syncService->ensureResource(ShareResourceType::AddressBook, $addressBook->id);

        return response()->json($addressBook, 201);
    }

    /**
     * Updates an existing resource.
     */
    public function update(Request $request, AddressBook $addressBook): JsonResponse
    {
        $this->authorizeOwnership($request, $addressBook);

        $data = $request->validate([
            'display_name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_sharable' => ['sometimes', 'boolean'],
        ]);

        $addressBook->update($data);

        if (array_key_exists('display_name', $data)) {
            $this->milestoneCalendarService->handleAddressBookRenamed($addressBook->fresh());
        }

        return response()->json($addressBook->fresh());
    }

    /**
     * Deletes an existing resource.
     */
    public function destroy(Request $request, AddressBook $addressBook): JsonResponse
    {
        $this->authorizeOwnership($request, $addressBook);

        if ($addressBook->is_default) {
            abort(422, 'Default address books cannot be deleted.');
        }

        $this->resourceDeletion->deleteAddressBook($addressBook);

        return response()->json(['ok' => true]);
    }

    /**
     * Performs the authorize ownership operation.
     */
    private function authorizeOwnership(Request $request, AddressBook $addressBook): void
    {
        $user = $request->user();

        if ($addressBook->owner_id !== $user->id && ! $user->isAdmin()) {
            abort(403, 'You cannot modify this address book.');
        }
    }

}
