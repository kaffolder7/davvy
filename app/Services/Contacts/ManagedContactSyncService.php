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

    public function syncCardUpsert(AddressBook $addressBook, Card $card, ?User $actor = null): void
    {
        if (! $this->schemaAvailable()) {
            return;
        }

        $parsed = $this->vCardService->parse($card->data);
        if ($parsed === null) {
            return;
        }

        $uid = $this->cleanString($card->uid) ?? $this->cleanString($parsed['uid'] ?? null);
        if ($uid === null) {
            return;
        }

        $payload = is_array($parsed['payload'] ?? null) ? $parsed['payload'] : [];
        $fullName = $this->vCardService->displayName($payload);
        $hintContactId = $this->toInteger($parsed['managed_contact_id'] ?? null);
        $hintOwnerId = $this->toInteger($parsed['managed_owner_id'] ?? null);

        DB::transaction(function () use (
            $addressBook,
            $card,
            $actor,
            $uid,
            $payload,
            $fullName,
            $hintContactId,
            $hintOwnerId
        ): void {
            $assignment = ContactAddressBookAssignment::query()
                ->with('contact')
                ->where('card_id', $card->id)
                ->first();

            $ownerId = $assignment?->contact?->owner_id
                ?? $hintOwnerId
                ?? $actor?->id
                ?? $addressBook->owner_id;

            if ($ownerId === null) {
                return;
            }

            $assignmentContact = $assignment?->contact;
            $targetContact = null;

            if ($assignmentContact && $assignmentContact->owner_id === $ownerId) {
                $targetContact = $assignmentContact;
            }

            $uidContact = Contact::query()
                ->where('owner_id', $ownerId)
                ->where('uid', $uid)
                ->first();
            if ($uidContact) {
                $targetContact = $uidContact;
            }

            if ($targetContact === null && $hintContactId !== null) {
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

            if ($oldContactId !== null && $oldContactId !== $targetContact->id) {
                $this->deleteContactIfOrphaned($oldContactId);
            }
        });

        $this->syncMilestoneCalendarsForAddressBooks([$addressBook->id]);
    }

    public function syncCardDeleted(Card $card): void
    {
        if (! $this->schemaAvailable()) {
            return;
        }

        $affectedAddressBookId = null;

        DB::transaction(function () use ($card, &$affectedAddressBookId): void {
            $assignment = ContactAddressBookAssignment::query()
                ->where('card_id', $card->id)
                ->first();

            if (! $assignment) {
                return;
            }

            $affectedAddressBookId = (int) $assignment->address_book_id;
            $contactId = (int) $assignment->contact_id;
            $assignment->delete();
            $this->deleteContactIfOrphaned($contactId);
        });

        if ($affectedAddressBookId !== null) {
            $this->syncMilestoneCalendarsForAddressBooks([$affectedAddressBookId]);
        }
    }

    private function deleteContactIfOrphaned(int $contactId): void
    {
        $hasAssignments = ContactAddressBookAssignment::query()
            ->where('contact_id', $contactId)
            ->exists();

        if (! $hasAssignments) {
            Contact::query()->where('id', $contactId)->delete();
        }
    }

    private function schemaAvailable(): bool
    {
        return Schema::hasTable('contacts') && Schema::hasTable('contact_address_book_assignments');
    }

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

    private function cleanString(mixed $value): ?string
    {
        if (! is_scalar($value) && $value !== null) {
            return null;
        }

        $normalized = trim((string) ($value ?? ''));

        return $normalized === '' ? null : $normalized;
    }

    /**
     * @param  array<int, int>  $addressBookIds
     */
    private function syncMilestoneCalendarsForAddressBooks(array $addressBookIds): void
    {
        try {
            $this->milestoneCalendarService->syncAddressBooksByIds($addressBookIds);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }
}
