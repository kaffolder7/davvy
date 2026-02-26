<?php

namespace App\Http\Controllers;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\ResourceShare;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShareController extends Controller
{
    public function index(): JsonResponse
    {
        $shares = ResourceShare::query()
            ->with(['owner', 'sharedWith'])
            ->orderByDesc('id')
            ->get()
            ->map(function (ResourceShare $share): array {
                return [
                    'id' => $share->id,
                    'resource_type' => $share->resource_type->value,
                    'resource_id' => $share->resource_id,
                    'permission' => $share->permission->value,
                    'owner' => [
                        'id' => $share->owner?->id,
                        'name' => $share->owner?->name,
                        'email' => $share->owner?->email,
                    ],
                    'shared_with' => [
                        'id' => $share->sharedWith?->id,
                        'name' => $share->sharedWith?->name,
                        'email' => $share->sharedWith?->email,
                    ],
                ];
            })
            ->all();

        return response()->json(['data' => $shares]);
    }

    public function upsert(Request $request): JsonResponse
    {
        $data = $request->validate([
            'resource_type' => ['required', 'in:calendar,address_book'],
            'resource_id' => ['required', 'integer', 'min:1'],
            'shared_with_id' => ['required', 'integer', 'exists:users,id'],
            'permission' => ['required', 'in:read_only,admin'],
        ]);

        $target = User::query()->findOrFail($data['shared_with_id']);

        $resourceType = ShareResourceType::from($data['resource_type']);
        [$resourceOwnerId, $isSharable] = $this->resourceOwnershipAndSharableState($resourceType, (int) $data['resource_id']);

        if (! $isSharable) {
            abort(422, 'Resource must be marked as sharable before assigning access.');
        }

        if ($target->id === $resourceOwnerId) {
            abort(422, 'You cannot share a resource with its owner.');
        }

        $share = ResourceShare::query()->updateOrCreate(
            [
                'resource_type' => $resourceType,
                'resource_id' => $data['resource_id'],
                'shared_with_id' => $target->id,
            ],
            [
                'owner_id' => $resourceOwnerId,
                'permission' => SharePermission::from($data['permission']),
            ]
        );

        return response()->json($share->fresh(), 201);
    }

    public function destroy(ResourceShare $share): JsonResponse
    {
        $share->delete();

        return response()->json(['ok' => true]);
    }

    private function resourceOwnershipAndSharableState(ShareResourceType $type, int $resourceId): array
    {
        if ($type === ShareResourceType::Calendar) {
            $calendar = Calendar::query()->findOrFail($resourceId);

            return [$calendar->owner_id, $calendar->is_sharable];
        }

        $addressBook = AddressBook::query()->findOrFail($resourceId);

        return [$addressBook->owner_id, $addressBook->is_sharable];
    }
}
