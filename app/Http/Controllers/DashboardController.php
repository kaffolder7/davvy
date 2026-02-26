<?php

namespace App\Http\Controllers;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\ResourceShare;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $ownedCalendars = Calendar::query()
            ->where('owner_id', $user->id)
            ->orderBy('display_name')
            ->get()
            ->map(fn (Calendar $calendar): array => [
                'id' => $calendar->id,
                'uri' => $calendar->uri,
                'display_name' => $calendar->display_name,
                'description' => $calendar->description,
                'color' => $calendar->color,
                'timezone' => $calendar->timezone,
                'is_sharable' => $calendar->is_sharable,
                'is_default' => $calendar->is_default,
            ])
            ->all();

        $ownedAddressBooks = AddressBook::query()
            ->where('owner_id', $user->id)
            ->orderBy('display_name')
            ->get()
            ->map(fn (AddressBook $addressBook): array => [
                'id' => $addressBook->id,
                'uri' => $addressBook->uri,
                'display_name' => $addressBook->display_name,
                'description' => $addressBook->description,
                'is_sharable' => $addressBook->is_sharable,
                'is_default' => $addressBook->is_default,
            ])
            ->all();

        $shares = ResourceShare::query()
            ->with(['owner', 'calendar', 'addressBook'])
            ->where('shared_with_id', $user->id)
            ->get();

        $sharedCalendars = $shares
            ->where('resource_type', ShareResourceType::Calendar)
            ->filter(fn (ResourceShare $share): bool => $share->calendar !== null)
            ->values()
            ->map(function (ResourceShare $share): array {
                return [
                    'share_id' => $share->id,
                    'id' => $share->calendar->id,
                    'uri' => $share->calendar->uri,
                    'display_name' => $share->calendar->display_name,
                    'owner_name' => $share->owner?->name,
                    'owner_email' => $share->owner?->email,
                    'permission' => $share->permission->value,
                ];
            })
            ->all();

        $sharedAddressBooks = $shares
            ->where('resource_type', ShareResourceType::AddressBook)
            ->filter(fn (ResourceShare $share): bool => $share->addressBook !== null)
            ->values()
            ->map(function (ResourceShare $share): array {
                return [
                    'share_id' => $share->id,
                    'id' => $share->addressBook->id,
                    'uri' => $share->addressBook->uri,
                    'display_name' => $share->addressBook->display_name,
                    'owner_name' => $share->owner?->name,
                    'owner_email' => $share->owner?->email,
                    'permission' => $share->permission->value,
                ];
            })
            ->all();

        return response()->json([
            'owned' => [
                'calendars' => $ownedCalendars,
                'address_books' => $ownedAddressBooks,
            ],
            'shared' => [
                'calendars' => $sharedCalendars,
                'address_books' => $sharedAddressBooks,
            ],
        ]);
    }
}
