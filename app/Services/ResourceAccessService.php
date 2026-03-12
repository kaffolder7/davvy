<?php

namespace App\Services;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\ResourceShare;
use App\Models\User;

class ResourceAccessService
{
    /**
     * @param  User  $user
     * @param  Calendar  $calendar
     * @return SharePermission|null
     */
    public function calendarPermission(User $user, Calendar $calendar): ?SharePermission
    {
        if ($calendar->owner_id === $user->id) {
            return SharePermission::Admin;
        }

        $share = ResourceShare::query()
            ->where('resource_type', ShareResourceType::Calendar)
            ->where('resource_id', $calendar->id)
            ->where('shared_with_id', $user->id)
            ->first();

        return $share?->permission;
    }

    /**
     * @param  User  $user
     * @param  AddressBook  $addressBook
     * @return SharePermission|null
     */
    public function addressBookPermission(User $user, AddressBook $addressBook): ?SharePermission
    {
        if ($addressBook->owner_id === $user->id) {
            return SharePermission::Admin;
        }

        $share = ResourceShare::query()
            ->where('resource_type', ShareResourceType::AddressBook)
            ->where('resource_id', $addressBook->id)
            ->where('shared_with_id', $user->id)
            ->first();

        return $share?->permission;
    }

    /**
     * @param  User  $user
     * @param  Calendar  $calendar
     * @return bool
     */
    public function userCanReadCalendar(User $user, Calendar $calendar): bool
    {
        return $this->calendarPermission($user, $calendar) !== null;
    }

    /**
     * @param  User  $user
     * @param  Calendar  $calendar
     * @return bool
     */
    public function userCanWriteCalendar(User $user, Calendar $calendar): bool
    {
        $permission = $this->calendarPermission($user, $calendar);

        return $permission?->canWrite() ?? false;
    }

    /**
     * @param  User  $user
     * @param  Calendar  $calendar
     * @return bool
     */
    public function userCanDeleteCalendar(User $user, Calendar $calendar): bool
    {
        $permission = $this->calendarPermission($user, $calendar);

        return $permission?->canDelete() ?? false;
    }

    /**
     * @param  User  $user
     * @param  AddressBook  $addressBook
     * @return bool
     */
    public function userCanReadAddressBook(User $user, AddressBook $addressBook): bool
    {
        return $this->addressBookPermission($user, $addressBook) !== null;
    }

    /**
     * @param  User  $user
     * @param  AddressBook  $addressBook
     * @return bool
     */
    public function userCanWriteAddressBook(User $user, AddressBook $addressBook): bool
    {
        $permission = $this->addressBookPermission($user, $addressBook);

        return $permission?->canWrite() ?? false;
    }

    /**
     * @param  User  $user
     * @param  AddressBook  $addressBook
     * @return bool
     */
    public function userCanDeleteAddressBook(User $user, AddressBook $addressBook): bool
    {
        $permission = $this->addressBookPermission($user, $addressBook);

        return $permission?->canDelete() ?? false;
    }
}
