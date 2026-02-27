<?php

namespace App\Http\Controllers;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\ResourceShare;
use App\Models\User;
use App\Services\AddressBookMirrorService;
use App\Services\RegistrationSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShareController extends Controller
{
    public function __construct(
        private readonly RegistrationSettingsService $settings,
        private readonly AddressBookMirrorService $mirrorService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = ResourceShare::query()
            ->with(['owner', 'sharedWith'])
            ->orderByDesc('id');

        if (! $user->isAdmin()) {
            $this->assertOwnerShareManagementAllowed();
            $query->where('owner_id', $user->id);
        }

        $shares = $query->get()
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
        $actor = $request->user();

        $data = $request->validate([
            'resource_type' => ['required', 'in:calendar,address_book'],
            'resource_id' => ['required', 'integer', 'min:1'],
            'shared_with_id' => ['required', 'integer', 'exists:users,id'],
            'permission' => ['required', 'in:read_only,editor,admin'],
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

        if (! $actor->isAdmin()) {
            $this->assertOwnerShareManagementAllowed();

            if ($resourceOwnerId !== $actor->id) {
                abort(403, 'You can only manage shares for resources you own.');
            }
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

        if ($resourceType === ShareResourceType::AddressBook) {
            $this->mirrorService->syncUserConfig($target);
        }

        return response()->json($share->fresh(), 201);
    }

    public function destroy(Request $request, ResourceShare $share): JsonResponse
    {
        $actor = $request->user();

        if (! $actor->isAdmin()) {
            $this->assertOwnerShareManagementAllowed();

            if ($share->owner_id !== $actor->id) {
                abort(403, 'You can only remove shares for resources you own.');
            }
        }

        $sharedWith = $share->sharedWith;
        $resourceType = $share->resource_type;

        $share->delete();

        if ($resourceType === ShareResourceType::AddressBook && $sharedWith) {
            $this->mirrorService->syncUserConfig($sharedWith);
        }

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

    private function assertOwnerShareManagementAllowed(): void
    {
        if (! $this->settings->isOwnerShareManagementEnabled()) {
            abort(403, 'Resource owner share management is currently disabled by admins.');
        }
    }
}
