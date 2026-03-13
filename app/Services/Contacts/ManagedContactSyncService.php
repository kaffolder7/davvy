<?php

namespace App\Services\Contacts;

use App\Models\AddressBook;
use App\Models\Card;
use App\Models\Contact;
use App\Models\ContactAddressBookAssignment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ManagedContactSyncService
{
    public function __construct(
        private readonly ContactVCardService $vCardService,
        private readonly ContactMilestoneCalendarService $milestoneCalendarService,
    ) {}

    /**
     * Applies CardDAV upsert payloads to managed contacts.
     */
    public function syncCardUpsert(
        AddressBook $addressBook,
        Card $card,
        ?User $actor = null,
    ): void {
        if (! $this->schemaAvailable()) {
            return;
        }

        $parsed = $this->vCardService->parse($card->data);
        if ($parsed === null) {
            return;
        }

        $uid =
            $this->cleanString($card->uid) ??
            $this->cleanString($parsed['uid'] ?? null);
        if ($uid === null) {
            return;
        }

        $payload = is_array($parsed['payload'] ?? null)
            ? $parsed['payload']
            : [];
        $fullName = $this->vCardService->displayName($payload);
        $hintContactId = $this->toInteger(
            $parsed['managed_contact_id'] ?? null,
        );
        $trustManagedMetadataHints = $actor === null;

        $relatedAddressBookIds = [];

        DB::transaction(function () use (
            $addressBook,
            $card,
            $actor,
            $uid,
            $payload,
            $fullName,
            $hintContactId,
            $trustManagedMetadataHints,
            &$relatedAddressBookIds,
        ): void {
            $assignment = ContactAddressBookAssignment::query()
                ->with('contact')
                ->where('card_id', $card->id)
                ->first();

            $ownerId = (int) ($assignment?->contact?->owner_id ?? $addressBook->owner_id);

            if ($ownerId < 1) {
                return;
            }

            $assignmentContact = $assignment?->contact;
            $targetContact = null;
            $previousPayload = [];

            if (
                $assignmentContact &&
                $assignmentContact->owner_id === $ownerId
            ) {
                $targetContact = $assignmentContact;
            }

            $uidContact = Contact::query()
                ->where('owner_id', $ownerId)
                ->where('uid', $uid)
                ->first();
            if ($uidContact) {
                $targetContact = $uidContact;
            }

            if ($targetContact === null && $hintContactId !== null && $trustManagedMetadataHints) {
                $hintContact = Contact::query()
                    ->where('id', $hintContactId)
                    ->where('owner_id', $ownerId)
                    ->first();
                if ($hintContact) {
                    $targetContact = $hintContact;
                }
            }

            if ($targetContact === null && $assignmentContact !== null) {
                $targetContact = $assignmentContact;
            }

            if ($targetContact === null) {
                $targetContact = Contact::query()->create([
                    'owner_id' => $ownerId,
                    'uid' => $uid,
                    'full_name' => $fullName,
                    'payload' => $payload,
                ]);
            } else {
                $previousPayload = is_array($targetContact->payload)
                    ? $targetContact->payload
                    : [];

                if ($targetContact->uid !== $uid) {
                    $conflict = Contact::query()
                        ->where('owner_id', $ownerId)
                        ->where('uid', $uid)
                        ->where('id', '!=', $targetContact->id)
                        ->first();

                    if ($conflict) {
                        $targetContact = $conflict;
                    } else {
                        $targetContact->uid = $uid;
                    }
                }

                $targetContact->full_name = $fullName;
                $targetContact->payload = $payload;
                $targetContact->save();
            }

            $oldContactId = $assignment?->contact_id;

            if ($assignment) {
                $targetAssignmentForBook = ContactAddressBookAssignment::query()
                    ->where('contact_id', $targetContact->id)
                    ->where('address_book_id', $addressBook->id)
                    ->where('id', '!=', $assignment->id)
                    ->first();

                if ($targetAssignmentForBook) {
                    $targetAssignmentForBook->delete();
                }

                $assignment->update([
                    'contact_id' => $targetContact->id,
                    'address_book_id' => $addressBook->id,
                    'card_id' => $card->id,
                    'card_uri' => $card->uri,
                ]);
            } else {
                $targetAssignmentForBook = ContactAddressBookAssignment::query()
                    ->where('contact_id', $targetContact->id)
                    ->where('address_book_id', $addressBook->id)
                    ->first();

                if ($targetAssignmentForBook) {
                    $targetAssignmentForBook->update([
                        'card_id' => $card->id,
                        'card_uri' => $card->uri,
                    ]);
                } else {
                    ContactAddressBookAssignment::query()->create([
                        'contact_id' => $targetContact->id,
                        'address_book_id' => $addressBook->id,
                        'card_id' => $card->id,
                        'card_uri' => $card->uri,
                    ]);
                }
            }

            if (
                $oldContactId !== null &&
                $oldContactId !== $targetContact->id
            ) {
                $relatedAddressBookIds = [
                    ...$relatedAddressBookIds,
                    ...$this->deleteContactIfOrphaned($oldContactId),
                ];
            }

            $relatedAddressBookIds = [
                ...$relatedAddressBookIds,
                ...$this->contactService()->syncBidirectionalRelatedNamesForContact(
                    $targetContact,
                    $previousPayload,
                ),
            ];
        });

        $this->syncMilestoneCalendarsForAddressBooks([
            $addressBook->id,
            ...is_array($relatedAddressBookIds) ? $relatedAddressBookIds : [],
        ]);
    }

    /**
     * Removes managed contacts associated with a deleted CardDAV card.
     */
    public function syncCardDeleted(Card $card): void
    {
        if (! $this->schemaAvailable()) {
            return;
        }

        $affectedAddressBookId = null;
        $relatedAddressBookIds = [];

        DB::transaction(function () use (
            $card,
            &$affectedAddressBookId,
            &$relatedAddressBookIds,
        ): void {
            $assignment = ContactAddressBookAssignment::query()
                ->where('card_id', $card->id)
                ->first();

            if (! $assignment) {
                return;
            }

            $affectedAddressBookId = (int) $assignment->address_book_id;
            $contactId = (int) $assignment->contact_id;
            $assignment->delete();
            $relatedAddressBookIds = $this->deleteContactIfOrphaned($contactId);
        });

        if ($affectedAddressBookId !== null) {
            $this->syncMilestoneCalendarsForAddressBooks([
                $affectedAddressBookId,
                ...is_array($relatedAddressBookIds)
                    ? $relatedAddressBookIds
                    : [],
            ]);
        }
    }

    /**
     * Removes managed contacts after source address-book deletion.
     */
    public function syncAddressBookDeleted(AddressBook $addressBook): void
    {
        if (! $this->schemaAvailable()) {
            return;
        }

        $contactIds = ContactAddressBookAssignment::query()
            ->where('address_book_id', $addressBook->id)
            ->pluck('contact_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        if ($contactIds === []) {
            return;
        }

        $relatedAddressBookIds = [];

        DB::transaction(function () use (
            $addressBook,
            $contactIds,
            &$relatedAddressBookIds,
        ): void {
            ContactAddressBookAssignment::query()
                ->where('address_book_id', $addressBook->id)
                ->delete();

            foreach ($contactIds as $contactId) {
                $relatedAddressBookIds = [
                    ...$relatedAddressBookIds,
                    ...$this->deleteContactIfOrphaned((int) $contactId),
                ];
            }
        });

        $this->syncMilestoneCalendarsForAddressBooks([
            $addressBook->id,
            ...is_array($relatedAddressBookIds) ? $relatedAddressBookIds : [],
        ]);
    }

    /**
     * Deletes contact if orphaned.
     *
     * @return array<int, int>
     */
    private function deleteContactIfOrphaned(int $contactId): array
    {
        $hasAssignments = ContactAddressBookAssignment::query()
            ->where('contact_id', $contactId)
            ->exists();

        if ($hasAssignments) {
            return [];
        }

        $contact = Contact::query()->find($contactId);
        if (! $contact) {
            return [];
        }

        $relatedAddressBookIds = $this->contactService()->removeBidirectionalRelatedNamesForContact(
            $contact,
        );
        $contact->delete();

        return $relatedAddressBookIds;
    }

    /**
     * Returns contact service.
     */
    private function contactService(): ContactService
    {
        return app(ContactService::class);
    }

    /**
     * Checks whether schema available.
     */
    private function schemaAvailable(): bool
    {
        return Schema::hasTable('contacts') &&
            Schema::hasTable('contact_address_book_assignments');
    }

    /**
     * Returns to integer.
     */
    private function toInteger(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value)) {
            return $value;
        }

        if (is_string($value) && preg_match('/^-?\d+$/', $value) === 1) {
            return (int) $value;
        }

        return null;
    }

    /**
     * Returns clean string.
     */
    private function cleanString(mixed $value): ?string
    {
        if (! is_scalar($value) && $value !== null) {
            return null;
        }

        $normalized = trim((string) ($value ?? ''));

        return $normalized === '' ? null : $normalized;
    }

    /**
     * Synchronizes milestone calendars for address books.
     *
     * @param  array<int, int>  $addressBookIds
     */
    private function syncMilestoneCalendarsForAddressBooks(
        array $addressBookIds,
    ): void {
        try {
            $this->milestoneCalendarService->syncAddressBooksByIds(
                $addressBookIds,
            );
        } catch (\Throwable $exception) {
            report($exception);
        }
    }
}
