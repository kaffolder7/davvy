<?php

namespace App\Http\Controllers;

use App\Enums\ShareResourceType;
use App\Models\Calendar;
use App\Services\Dav\DavSyncService;
use App\Services\ResourceDeletionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CalendarController extends Controller
{
    public function __construct(
        private readonly DavSyncService $syncService,
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
            'color' => ['nullable', 'string', 'max:16'],
            'timezone' => ['nullable', 'string', 'max:255'],
            'is_sharable' => ['boolean'],
        ]);

        $baseUri = Str::slug($data['uri'] ?? $data['display_name']);
        $uri = $this->uniqueUri($request->user()->id, $baseUri);

        $calendar = Calendar::query()->create([
            'owner_id' => $request->user()->id,
            'uri' => $uri,
            'display_name' => $data['display_name'],
            'description' => $data['description'] ?? null,
            'color' => $data['color'] ?? null,
            'timezone' => $data['timezone'] ?? null,
            'is_sharable' => (bool) ($data['is_sharable'] ?? false),
            'is_default' => false,
        ]);
        $this->syncService->ensureResource(ShareResourceType::Calendar, $calendar->id);

        return response()->json($calendar, 201);
    }

    /**
     * Updates an existing resource.
     */
    public function update(Request $request, Calendar $calendar): JsonResponse
    {
        $this->authorizeOwnership($request, $calendar);

        $data = $request->validate([
            'display_name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'color' => ['nullable', 'string', 'max:16'],
            'timezone' => ['nullable', 'string', 'max:255'],
            'is_sharable' => ['sometimes', 'boolean'],
        ]);

        $calendar->update($data);

        return response()->json($calendar->fresh());
    }

    /**
     * Deletes an existing resource.
     */
    public function destroy(Request $request, Calendar $calendar): JsonResponse
    {
        $this->authorizeOwnership($request, $calendar);

        if ($calendar->is_default) {
            abort(422, 'Default calendars cannot be deleted.');
        }

        $this->resourceDeletion->deleteCalendar($calendar);

        return response()->json(['ok' => true]);
    }

    /**
     * Performs the authorize ownership operation.
     */
    private function authorizeOwnership(Request $request, Calendar $calendar): void
    {
        $user = $request->user();

        if ($calendar->owner_id !== $user->id && ! $user->isAdmin()) {
            abort(403, 'You cannot modify this calendar.');
        }
    }

    /**
     * Returns unique URI.
     */
    private function uniqueUri(int $ownerId, string $baseUri): string
    {
        $seed = $baseUri !== '' ? $baseUri : 'calendar';
        $uri = $seed;
        $count = 1;

        while (
            Calendar::query()
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
