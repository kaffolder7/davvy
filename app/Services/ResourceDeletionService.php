<?php

namespace App\Services;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\ResourceShare;
use App\Services\Contacts\ContactMilestoneCalendarService;
use App\Services\Contacts\ManagedContactSyncService;

class ResourceDeletionService
{
    public function __construct(
        private readonly AddressBookMirrorService $mirrorService,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
        private readonly ManagedContactSyncService $managedContactSync,
    ) {}

    public function deleteAddressBook(AddressBook $addressBook): void
    {
        $this->milestoneCalendarService->handleAddressBookDeleted($addressBook);
        $this->mirrorService->handleSourceAddressBookDeleted($addressBook->id);
        $this->managedContactSync->syncAddressBookDeleted($addressBook);
        $this->deleteSharesForAddressBook($addressBook->id);

        $addressBook->delete();
    }

    public function deleteCalendar(Calendar $calendar): void
    {
        $this->deleteSharesForCalendar($calendar->id);

        $calendar->delete();
    }

    public function deleteSharesForAddressBook(int $addressBookId): void
    {
        ResourceShare::query()
            ->where('resource_type', ShareResourceType::AddressBook->value)
            ->where('resource_id', $addressBookId)
            ->delete();
    }

    public function deleteSharesForCalendar(int $calendarId): void
    {
        ResourceShare::query()
            ->where('resource_type', ShareResourceType::Calendar->value)
            ->where('resource_id', $calendarId)
            ->delete();
    }
}
