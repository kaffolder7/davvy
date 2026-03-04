<?php

namespace App\Http\Controllers;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\ResourceShare;
use App\Models\User;
use App\Services\AddressBookMirrorService;
use App\Services\Contacts\ContactMilestoneCalendarService;
use App\Services\RegistrationSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(
        private readonly RegistrationSettingsService $settings,
        private readonly AddressBookMirrorService $mirrorService,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $ownerShareManagementEnabled = $this->settings->isOwnerShareManagementEnabled();

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

        $ownedAddressBookModels = AddressBook::query()
            ->where('owner_id', $user->id)
            ->orderBy('display_name')
            ->get();

        $milestoneCalendarSettings = $this->milestoneCalendarService
            ->settingsIndexForAddressBooks($ownedAddressBookModels);

        $ownedAddressBooks = $ownedAddressBookModels
            ->map(fn (AddressBook $addressBook): array => [
                'id' => $addressBook->id,
                'uri' => $addressBook->uri,
                'display_name' => $addressBook->display_name,
                'description' => $addressBook->description,
                'is_sharable' => $addressBook->is_sharable,
                'is_default' => $addressBook->is_default,
                'milestone_calendars' => $milestoneCalendarSettings[$addressBook->id] ?? [
                    'birthdays' => [
                        'enabled' => false,
                        'calendar_id' => null,
                        'calendar_uri' => null,
                        'calendar_name' => $addressBook->display_name.' Birthdays',
                        'default_name' => $addressBook->display_name.' Birthdays',
                        'custom_name' => null,
                    ],
                    'anniversaries' => [
                        'enabled' => false,
                        'calendar_id' => null,
                        'calendar_uri' => null,
                        'calendar_name' => $addressBook->display_name.' Anniversaries',
                        'default_name' => $addressBook->display_name.' Anniversaries',
                        'custom_name' => null,
                    ],
                ],
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

        $sharesCreatedByUser = ResourceShare::query()
            ->with('sharedWith')
            ->where('owner_id', $user->id)
            ->orderByDesc('id')
            ->get()
            ->map(function (ResourceShare $share): array {
                return [
                    'id' => $share->id,
                    'resource_type' => $share->resource_type->value,
                    'resource_id' => $share->resource_id,
                    'permission' => $share->permission->value,
                    'shared_with' => [
                        'id' => $share->sharedWith?->id,
                        'name' => $share->sharedWith?->name,
                        'email' => $share->sharedWith?->email,
                    ],
                ];
            })
            ->all();

        $shareTargets = User::query()
            ->where('id', '!=', $user->id)
            ->orderBy('name')
            ->get(['id', 'name', 'email'])
            ->map(fn (User $target): array => [
                'id' => $target->id,
                'name' => $target->name,
                'email' => $target->email,
            ])
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
            'sharing' => [
                'owner_share_management_enabled' => $ownerShareManagementEnabled,
                'can_manage' => $user->isAdmin() || $ownerShareManagementEnabled,
                'targets' => $shareTargets,
                'outgoing' => $sharesCreatedByUser,
            ],
            'apple_compat' => $this->mirrorService->dashboardDataFor($user),
        ]);
    }
}
