<?php

namespace App\Services;

use App\Models\AddressBook;
use App\Models\Calendar;
use App\Services\Contacts\ContactMilestoneCalendarService;
use App\Services\Contacts\ManagedContactSyncService;

class ResourceDeletionService
{
    public function __construct(
        private readonly AddressBookMirrorService $mirrorService,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
        private readonly ManagedContactSyncService $managedContactSync,
        private readonly ResourceShareCleanupService $shareCleanup,
    ) {}

    /**
     * Deletes address book.
     *
     * @param  AddressBook  $addressBook
     * @return void
     */
    public function deleteAddressBook(AddressBook $addressBook): void
    {
        $this->milestoneCalendarService->handleAddressBookDeleted($addressBook);
        $this->mirrorService->handleSourceAddressBookDeleted($addressBook->id);
        $this->managedContactSync->syncAddressBookDeleted($addressBook);
        $this->shareCleanup->deleteAddressBookShares($addressBook->id);

        $addressBook->delete();
    }

    /**
     * Deletes calendar.
     *
     * @param  Calendar  $calendar
     * @return void
     */
    public function deleteCalendar(Calendar $calendar): void
    {
        $this->shareCleanup->deleteCalendarShares($calendar->id);

        $calendar->delete();
    }
}
