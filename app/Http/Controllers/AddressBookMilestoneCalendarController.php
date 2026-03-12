<?php

namespace App\Http\Controllers;

use App\Models\AddressBook;
use App\Services\Contacts\ContactMilestoneCalendarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AddressBookMilestoneCalendarController extends Controller
{
    public function __construct(
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
    ) {}

    /**
     * @param  Request  $request
     * @param  AddressBook  $addressBook
     * @return JsonResponse
     */
    public function update(Request $request, AddressBook $addressBook): JsonResponse
    {
        $data = $request->validate([
            'birthdays_enabled' => ['sometimes', 'boolean'],
            'anniversaries_enabled' => ['sometimes', 'boolean'],
            'birthday_calendar_name' => ['nullable', 'string', 'max:255'],
            'anniversary_calendar_name' => ['nullable', 'string', 'max:255'],
        ]);

        $settings = $this->milestoneCalendarService->updateAddressBookSettings(
            actor: $request->user(),
            addressBook: $addressBook,
            attributes: $data,
        );

        return response()->json([
            'milestone_calendars' => $settings,
        ]);
    }
}
