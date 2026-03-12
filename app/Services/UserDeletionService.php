<?php

namespace App\Services;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\Contact;
use App\Models\ResourceShare;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class UserDeletionService
{
    public function __construct(
        private readonly ResourceDeletionService $resourceDeletion,
    ) {}

    /**
     * @return array{
     *   deleted_user_id:int,
     *   transferred_to_user_id:?int,
     *   transferred:array{
     *     calendars:int,
     *     address_books:int,
     *     contacts:int,
     *     shares_reassigned:int,
     *     shares_removed:int
     *   }
     * }
     */
    public function deleteUser(User $user, ?int $transferOwnerId = null): array
    {
        $deletedUserId = (int) $user->id;
        $deletedUserEmail = (string) $user->email;
        $summary = [
            'calendars' => 0,
            'address_books' => 0,
            'contacts' => 0,
            'shares_reassigned' => 0,
            'shares_removed' => 0,
        ];

        DB::transaction(function () use (
            $deletedUserId,
            $deletedUserEmail,
            $transferOwnerId,
            &$summary
        ): void {
            if ($transferOwnerId !== null) {
                $summary = $this->transferOwnedResources($deletedUserId, $transferOwnerId);
            } else {
                $this->deleteOwnedResources($deletedUserId);
            }

            User::query()->whereKey($deletedUserId)->delete();
            DB::table('sessions')->where('user_id', $deletedUserId)->delete();
            DB::table('password_reset_tokens')->where('email', $deletedUserEmail)->delete();
        });

        return [
            'deleted_user_id' => $deletedUserId,
            'transferred_to_user_id' => $transferOwnerId,
            'transferred' => $summary,
        ];
    }

    /**
     * @param  int  $ownerId
     * @return void
     */
    private function deleteOwnedResources(int $ownerId): void
    {
        $addressBooks = AddressBook::query()
            ->where('owner_id', $ownerId)
            ->get();
        $calendars = Calendar::query()
            ->where('owner_id', $ownerId)
            ->get();

        foreach ($addressBooks as $addressBook) {
            $this->resourceDeletion->deleteAddressBook($addressBook);
        }

        foreach ($calendars as $calendar) {
            $this->resourceDeletion->deleteCalendar($calendar);
        }
    }

    /**
     * @return array{calendars:int,address_books:int,contacts:int,shares_reassigned:int,shares_removed:int}
     */
    private function transferOwnedResources(int $sourceUserId, int $targetUserId): array
    {
        $calendarUriLookup = [];
        Calendar::query()
            ->where('owner_id', $targetUserId)
            ->pluck('uri')
            ->each(function (mixed $uri) use (&$calendarUriLookup): void {
                $calendarUriLookup[(string) $uri] = true;
            });

        $addressBookUriLookup = [];
        AddressBook::query()
            ->where('owner_id', $targetUserId)
            ->pluck('uri')
            ->each(function (mixed $uri) use (&$addressBookUriLookup): void {
                $addressBookUriLookup[(string) $uri] = true;
            });

        $targetContactUidLookup = [];
        Contact::query()
            ->where('owner_id', $targetUserId)
            ->pluck('uid')
            ->each(function (mixed $uid) use (&$targetContactUidLookup): void {
                $targetContactUidLookup[(string) $uid] = true;
            });

        $calendarIds = [];
        $addressBookIds = [];
        $calendarCount = 0;
        $addressBookCount = 0;
        $contactCount = 0;

        $targetHasDefaultCalendar = Calendar::query()
            ->where('owner_id', $targetUserId)
            ->where('is_default', true)
            ->exists();
        $targetHasDefaultAddressBook = AddressBook::query()
            ->where('owner_id', $targetUserId)
            ->where('is_default', true)
            ->exists();

        $sourceCalendars = Calendar::query()
            ->where('owner_id', $sourceUserId)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        foreach ($sourceCalendars as $calendar) {
            $nextUri = $this->nextUniqueIdentifier(
                seed: (string) $calendar->uri,
                fallback: 'calendar',
                lookup: $calendarUriLookup,
            );

            $updates = [
                'owner_id' => $targetUserId,
                'uri' => $nextUri,
            ];

            if ((bool) $calendar->is_default) {
                if ($targetHasDefaultCalendar) {
                    $updates['is_default'] = false;
                } else {
                    $targetHasDefaultCalendar = true;
                }
            }

            $calendar->update($updates);
            $calendarIds[] = (int) $calendar->id;
            $calendarCount++;
        }

        $sourceAddressBooks = AddressBook::query()
            ->where('owner_id', $sourceUserId)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        foreach ($sourceAddressBooks as $addressBook) {
            $nextUri = $this->nextUniqueIdentifier(
                seed: (string) $addressBook->uri,
                fallback: 'address-book',
                lookup: $addressBookUriLookup,
            );

            $updates = [
                'owner_id' => $targetUserId,
                'uri' => $nextUri,
            ];

            if ((bool) $addressBook->is_default) {
                if ($targetHasDefaultAddressBook) {
                    $updates['is_default'] = false;
                } else {
                    $targetHasDefaultAddressBook = true;
                }
            }

            $addressBook->update($updates);
            $addressBookIds[] = (int) $addressBook->id;
            $addressBookCount++;
        }

        $sourceContacts = Contact::query()
            ->where('owner_id', $sourceUserId)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        $conflictingContactUidCount = $sourceContacts
            ->filter(function (Contact $contact) use ($targetContactUidLookup): bool {
                return isset($targetContactUidLookup[(string) $contact->uid]);
            })
            ->count();

        if ($conflictingContactUidCount > 0) {
            abort(
                422,
                "Cannot transfer ownership because {$conflictingContactUidCount} contact UID conflict(s) exist between source and target owners."
            );
        }

        foreach ($sourceContacts as $contact) {
            $contact->update([
                'owner_id' => $targetUserId,
            ]);
            $contactCount++;
        }

        $sharesReassigned = 0;
        $sharesRemoved = 0;

        if ($calendarIds !== []) {
            $sharesReassigned += ResourceShare::query()
                ->where('owner_id', $sourceUserId)
                ->where('resource_type', ShareResourceType::Calendar->value)
                ->whereIn('resource_id', $calendarIds)
                ->update(['owner_id' => $targetUserId]);

            $sharesRemoved += ResourceShare::query()
                ->where('resource_type', ShareResourceType::Calendar->value)
                ->whereIn('resource_id', $calendarIds)
                ->where('shared_with_id', $targetUserId)
                ->delete();
        }

        if ($addressBookIds !== []) {
            $sharesReassigned += ResourceShare::query()
                ->where('owner_id', $sourceUserId)
                ->where('resource_type', ShareResourceType::AddressBook->value)
                ->whereIn('resource_id', $addressBookIds)
                ->update(['owner_id' => $targetUserId]);

            $sharesRemoved += ResourceShare::query()
                ->where('resource_type', ShareResourceType::AddressBook->value)
                ->whereIn('resource_id', $addressBookIds)
                ->where('shared_with_id', $targetUserId)
                ->delete();
        }

        return [
            'calendars' => $calendarCount,
            'address_books' => $addressBookCount,
            'contacts' => $contactCount,
            'shares_reassigned' => $sharesReassigned,
            'shares_removed' => $sharesRemoved,
        ];
    }

    /**
     * @param  array<string, bool>  $lookup
     */
    private function nextUniqueIdentifier(string $seed, string $fallback, array &$lookup): string
    {
        $base = $seed !== '' ? $seed : $fallback;
        $candidate = $base;
        $suffix = 1;

        while (isset($lookup[$candidate])) {
            $candidate = $base.'-'.$suffix;
            $suffix++;
        }

        $lookup[$candidate] = true;

        return $candidate;
    }
}
