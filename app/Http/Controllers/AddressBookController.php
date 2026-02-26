<?php

namespace App\Http\Controllers;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Services\Dav\DavSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AddressBookController extends Controller
{
    public function __construct(private readonly DavSyncService $syncService)
    {
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'display_name' => ['required', 'string', 'max:255'],
            'uri' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_sharable' => ['boolean'],
        ]);

        $baseUri = Str::slug($data['uri'] ?? $data['display_name']);
        $uri = $this->uniqueUri($request->user()->id, $baseUri);

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

    public function update(Request $request, AddressBook $addressBook): JsonResponse
    {
        $this->authorizeOwnership($request, $addressBook);

        $data = $request->validate([
            'display_name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_sharable' => ['sometimes', 'boolean'],
        ]);

        $addressBook->update($data);

        return response()->json($addressBook->fresh());
    }

    public function destroy(Request $request, AddressBook $addressBook): JsonResponse
    {
        $this->authorizeOwnership($request, $addressBook);

        if ($addressBook->is_default) {
            abort(422, 'Default address books cannot be deleted.');
        }

        $addressBook->delete();

        return response()->json(['ok' => true]);
    }

    private function authorizeOwnership(Request $request, AddressBook $addressBook): void
    {
        $user = $request->user();

        if ($addressBook->owner_id !== $user->id && ! $user->isAdmin()) {
            abort(403, 'You cannot modify this address book.');
        }
    }

    private function uniqueUri(int $ownerId, string $baseUri): string
    {
        $seed = $baseUri !== '' ? $baseUri : 'address-book';
        $uri = $seed;
        $count = 1;

        while (
            AddressBook::query()
                ->where('owner_id', $ownerId)
                ->where('uri', $uri)
                ->exists()
        ) {
            $uri = $seed.'-'.$count;
            $count++;
        }

        return $uri;
    }
}
