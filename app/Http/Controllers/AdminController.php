<?php

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Models\AddressBook;
use App\Models\AddressBookContactMilestoneCalendar;
use App\Models\Calendar;
use App\Models\User;
use App\Services\Contacts\ContactMilestoneCalendarService;
use App\Services\RegistrationSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rules\Password;

class AdminController extends Controller
{
    public function __construct(
        private readonly RegistrationSettingsService $registrationSettings,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
    ) {}

    public function users(): JsonResponse
    {
        $users = User::query()
            ->withCount(['calendars', 'addressBooks'])
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $users]);
    }

    public function createUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', Password::min(8)],
            'role' => ['required', 'in:admin,regular'],
        ]);

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role' => Role::from($data['role']),
        ]);

        return response()->json($user, 201);
    }

    public function sharableResources(): JsonResponse
    {
        $calendars = Calendar::query()
            ->with('owner:id,name,email')
            ->where('is_sharable', true)
            ->orderBy('display_name')
            ->get();

        $addressBooks = AddressBook::query()
            ->with('owner:id,name,email')
            ->where('is_sharable', true)
            ->orderBy('display_name')
            ->get();

        $milestonePurgeAvailable = false;

        if (Schema::hasTable('address_book_contact_milestone_calendars')) {
            $milestonePurgeAvailable = AddressBookContactMilestoneCalendar::query()
                ->where(function ($query): void {
                    $query->where('enabled', true)
                        ->orWhereNotNull('calendar_id');
                })
                ->exists();
        }

        return response()->json([
            'calendars' => $calendars,
            'address_books' => $addressBooks,
            'milestone_purge_available' => $milestonePurgeAvailable,
        ]);
    }

    public function setRegistrationSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $this->registrationSettings->setPublicRegistrationEnabled(
            enabled: (bool) $data['enabled'],
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isPublicRegistrationEnabled(),
        ]);
    }

    public function setOwnerShareManagementSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $this->registrationSettings->setOwnerShareManagementEnabled(
            enabled: (bool) $data['enabled'],
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isOwnerShareManagementEnabled(),
        ]);
    }

    public function setDavCompatibilityModeSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $this->registrationSettings->setDavCompatibilityModeEnabled(
            enabled: (bool) $data['enabled'],
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isDavCompatibilityModeEnabled(),
        ]);
    }

    public function setContactManagementSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        if (
            (bool) $data['enabled']
            && (
                ! Schema::hasTable('contacts')
                || ! Schema::hasTable('contact_address_book_assignments')
            )
        ) {
            abort(422, 'Contact management schema is not available. Run migrations before enabling.');
        }

        $this->registrationSettings->setContactManagementEnabled(
            enabled: (bool) $data['enabled'],
            actor: $request->user()
        );

        return response()->json([
            'enabled' => $this->registrationSettings->isContactManagementEnabled(),
        ]);
    }

    public function contactChangeRequestRetentionSetting(): JsonResponse
    {
        return response()->json([
            'days' => $this->registrationSettings->contactChangeRequestRetentionDays(),
        ]);
    }

    public function setContactChangeRequestRetentionSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'days' => ['required', 'integer', 'min:1', 'max:3650'],
        ]);

        $this->registrationSettings->setContactChangeRequestRetentionDays(
            days: (int) $data['days'],
            actor: $request->user(),
        );

        return response()->json([
            'days' => $this->registrationSettings->contactChangeRequestRetentionDays(),
        ]);
    }

    public function purgeGeneratedMilestoneCalendars(): JsonResponse
    {
        $summary = $this->milestoneCalendarService->purgeGeneratedCalendarsAndDisableSettings();

        return response()->json($summary);
    }
}
