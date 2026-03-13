<?php

namespace App\Services\Contacts;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\AddressBookContactMilestoneCalendar;
use App\Models\AppSetting;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\Card;
use App\Models\Contact;
use App\Models\ContactAddressBookAssignment;
use App\Models\User;
use App\Services\Dav\DavSyncService;
use App\Services\Dav\IcsValidator;
use App\Services\ResourceShareCleanupService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class ContactMilestoneCalendarService
{
    private const FALLBACK_YEAR = 2000;

    private const MANAGED_URI_PREFIX = 'davvy-milestone-';

    public function __construct(
        private readonly DavSyncService $syncService,
        private readonly IcsValidator $icsValidator,
        private readonly ContactVCardService $contactVCardService,
        private readonly ResourceShareCleanupService $shareCleanup,
    ) {}

    /**
     * Returns milestone settings for the given address books.
     *
     * @param  Collection<int, AddressBook>  $addressBooks
     * @return array<int, array<string, mixed>>
     */
    public function settingsIndexForAddressBooks(Collection $addressBooks): array
    {
        if (! $this->schemaAvailable()) {
            return [];
        }

        $books = $addressBooks
            ->filter(fn (mixed $book): bool => $book instanceof AddressBook)
            ->values();

        if ($books->isEmpty()) {
            return [];
        }

        $settingsByAddressBook = AddressBookContactMilestoneCalendar::query()
            ->with('calendar')
            ->whereIn('address_book_id', $books->pluck('id')->all())
            ->get()
            ->groupBy('address_book_id');

        $index = [];
        foreach ($books as $addressBook) {
            $settings = $settingsByAddressBook->get($addressBook->id, collect());
            $index[$addressBook->id] = $this->serializeSettingsForAddressBook($addressBook, $settings);
        }

        return $index;
    }

    /**
     * Updates milestone settings for selected address books.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    public function updateAddressBookSettings(User $actor, AddressBook $addressBook, array $attributes): array
    {
        if (! $this->schemaAvailable()) {
            abort(422, 'Milestone calendar schema is not available. Run migrations before enabling milestone calendars.');
        }

        if ($addressBook->owner_id !== $actor->id && ! $actor->isAdmin()) {
            abort(403, 'You cannot modify milestone calendar settings for this address book.');
        }

        $existing = AddressBookContactMilestoneCalendar::query()
            ->with('calendar')
            ->where('address_book_id', $addressBook->id)
            ->get()
            ->keyBy('milestone_type');

        $shouldSyncAddressBook = false;

        foreach ($this->milestoneTypes() as $type) {
            $enabledField = $this->enabledFieldForType($type);
            $nameField = $this->customNameFieldForType($type);

            if (
                ! array_key_exists($enabledField, $attributes)
                && ! array_key_exists($nameField, $attributes)
                && ! $existing->has($type)
            ) {
                continue;
            }

            /** @var AddressBookContactMilestoneCalendar $setting */
            $setting = $existing->get($type) ?? new AddressBookContactMilestoneCalendar([
                'address_book_id' => $addressBook->id,
                'milestone_type' => $type,
                'enabled' => false,
            ]);

            if (array_key_exists($enabledField, $attributes)) {
                $setting->enabled = (bool) $attributes[$enabledField];
            }

            if (array_key_exists($nameField, $attributes)) {
                $setting->custom_display_name = $this->normalizeString($attributes[$nameField] ?? null);
            }

            $setting->save();
            $setting->loadMissing('calendar');

            if ($setting->enabled) {
                $calendar = $this->ensureCalendarForSetting($addressBook, $setting, $type);
                $setting->setRelation('calendar', $calendar);
            }

            $this->syncCalendarDisplayName($addressBook, $setting, $type);

            if ($setting->enabled) {
                $shouldSyncAddressBook = true;
                $this->markMilestonePurgeControlVisible($actor);
            }
        }

        if ($shouldSyncAddressBook) {
            $this->syncAddressBooksByIds([$addressBook->id]);
        }

        return $this->settingsIndexForAddressBooks(collect([$addressBook]))[$addressBook->id];
    }

    /**
     * Synchronizes generated milestone calendar names after address-book rename.
     */
    public function handleAddressBookRenamed(AddressBook $addressBook): void
    {
        if (! $this->schemaAvailable()) {
            return;
        }

        $settings = AddressBookContactMilestoneCalendar::query()
            ->with('calendar')
            ->where('address_book_id', $addressBook->id)
            ->get();

        foreach ($settings as $setting) {
            if ($this->normalizeString($setting->custom_display_name) !== null) {
                continue;
            }

            $this->syncCalendarDisplayName($addressBook, $setting, $setting->milestone_type);
        }
    }

    /**
     * Removes generated milestone calendars after address-book deletion.
     */
    public function handleAddressBookDeleted(AddressBook $addressBook): void
    {
        if (! $this->schemaAvailable()) {
            return;
        }

        $settings = AddressBookContactMilestoneCalendar::query()
            ->with('calendar')
            ->where('address_book_id', $addressBook->id)
            ->get();

        $calendarIds = $settings
            ->pluck('calendar_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        $this->shareCleanup->deleteCalendarShares($calendarIds);

        foreach ($settings as $setting) {
            if ($setting->calendar) {
                $setting->calendar->delete();
            }
        }

        AddressBookContactMilestoneCalendar::query()
            ->where('address_book_id', $addressBook->id)
            ->delete();
    }

    /**
     * Deletes generated milestone calendars and disables milestone settings.
     *
     * @return array{purged_calendar_count:int,purged_event_count:int,disabled_setting_count:int}
     */
    public function purgeGeneratedCalendarsAndDisableSettings(): array
    {
        if (! Schema::hasTable('address_book_contact_milestone_calendars')) {
            abort(422, 'Milestone calendar schema is not available. Run migrations before purging milestone calendars.');
        }

        return DB::transaction(function (): array {
            $calendarIds = AddressBookContactMilestoneCalendar::query()
                ->whereNotNull('calendar_id')
                ->pluck('calendar_id')
                ->map(fn (mixed $id): int => (int) $id)
                ->filter(fn (int $id): bool => $id > 0)
                ->unique()
                ->values()
                ->all();

            $purgedEventCount = $calendarIds === []
                ? 0
                : CalendarObject::query()
                    ->whereIn('calendar_id', $calendarIds)
                    ->count();

            $purgedCalendarCount = count($calendarIds);

            if ($calendarIds !== []) {
                $this->shareCleanup->deleteCalendarShares($calendarIds);

                Calendar::query()
                    ->whereIn('id', $calendarIds)
                    ->get()
                    ->each(function (Calendar $calendar): void {
                        $calendar->delete();
                    });

                DB::table('dav_resource_sync_changes')
                    ->where('resource_type', ShareResourceType::Calendar->value)
                    ->whereIn('resource_id', $calendarIds)
                    ->delete();

                DB::table('dav_resource_sync_states')
                    ->where('resource_type', ShareResourceType::Calendar->value)
                    ->whereIn('resource_id', $calendarIds)
                    ->delete();
            }

            $disabledSettingCount = AddressBookContactMilestoneCalendar::query()
                ->where(function ($query): void {
                    $query->where('enabled', true)
                        ->orWhereNotNull('calendar_id');
                })
                ->update([
                    'enabled' => false,
                    'calendar_id' => null,
                    'updated_at' => now(),
                ]);

            return [
                'purged_calendar_count' => $purgedCalendarCount,
                'purged_event_count' => $purgedEventCount,
                'disabled_setting_count' => $disabledSettingCount,
            ];
        });
    }

    /**
     * Regenerates milestone calendars for the selected address books.
     *
     * @param  array<int, int>  $addressBookIds
     */
    public function syncAddressBooksByIds(array $addressBookIds): void
    {
        if (! $this->schemaAvailable()) {
            return;
        }

        $ids = collect($addressBookIds)
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($ids === []) {
            return;
        }

        $addressBooks = AddressBook::query()
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        $settings = AddressBookContactMilestoneCalendar::query()
            ->with('calendar')
            ->whereIn('address_book_id', $ids)
            ->where('enabled', true)
            ->get();

        foreach ($settings as $setting) {
            $addressBook = $addressBooks->get($setting->address_book_id);
            if (! $addressBook) {
                continue;
            }

            if (! in_array($setting->milestone_type, $this->milestoneTypes(), true)) {
                continue;
            }

            try {
                $this->reconcileLegacyCardsForAddressBook($addressBook);
                $calendar = $this->ensureCalendarForSetting($addressBook, $setting, $setting->milestone_type);
                $setting->setRelation('calendar', $calendar);
                $this->syncCalendarDisplayName($addressBook, $setting, $setting->milestone_type);
                $this->syncCalendarObjectsForSetting($addressBook, $setting, $calendar);
            } catch (Throwable $exception) {
                report($exception);
            }
        }
    }

    /**
     * Returns serialize settings for address book.
     *
     * @param  Collection<int, AddressBookContactMilestoneCalendar>  $settings
     * @return array<string, mixed>
     */
    private function serializeSettingsForAddressBook(AddressBook $addressBook, Collection $settings): array
    {
        $serialized = [];

        foreach ($this->milestoneTypes() as $type) {
            /** @var AddressBookContactMilestoneCalendar|null $setting */
            $setting = $settings->firstWhere('milestone_type', $type);
            $customName = $this->normalizeString($setting?->custom_display_name);
            $defaultName = $this->defaultCalendarName($addressBook, $type);
            $calendar = $setting?->calendar;

            $serialized[$this->settingsKeyForType($type)] = [
                'enabled' => (bool) ($setting?->enabled ?? false),
                'calendar_id' => $setting?->calendar_id,
                'calendar_uri' => $calendar?->uri,
                'calendar_name' => $calendar?->display_name ?? ($customName ?? $defaultName),
                'default_name' => $defaultName,
                'custom_name' => $customName,
            ];
        }

        return $serialized;
    }

    /**
     * Ensures calendar for setting.
     */
    private function ensureCalendarForSetting(
        AddressBook $addressBook,
        AddressBookContactMilestoneCalendar $setting,
        string $type,
    ): Calendar {
        $calendar = $setting->calendar;

        if ($calendar && $calendar->owner_id === $addressBook->owner_id) {
            return $calendar;
        }

        if ($calendar && $calendar->owner_id !== $addressBook->owner_id) {
            $setting->calendar_id = null;
            $setting->save();
        }

        $displayName = $this->displayNameForSetting($addressBook, $setting, $type);
        $uriBase = Str::slug($addressBook->uri.'-'.$this->settingsKeyForType($type));
        $uri = $this->uniqueCalendarUri($addressBook->owner_id, $uriBase);

        $calendar = Calendar::query()->create([
            'owner_id' => $addressBook->owner_id,
            'uri' => $uri,
            'display_name' => $displayName,
            'description' => sprintf(
                'Automatically generated %s calendar for %s.',
                $this->settingsKeyForType($type),
                $addressBook->display_name,
            ),
            'is_default' => false,
            'is_sharable' => false,
        ]);

        $this->syncService->ensureResource(ShareResourceType::Calendar, $calendar->id);

        $setting->calendar_id = $calendar->id;
        $setting->save();

        return $calendar;
    }

    /**
     * Synchronizes calendar display name.
     */
    private function syncCalendarDisplayName(
        AddressBook $addressBook,
        AddressBookContactMilestoneCalendar $setting,
        string $type,
    ): void {
        $calendar = $setting->calendar;
        if (! $calendar) {
            return;
        }

        $nextName = $this->displayNameForSetting($addressBook, $setting, $type);
        if ($calendar->display_name === $nextName) {
            return;
        }

        $calendar->update([
            'display_name' => $nextName,
        ]);
    }

    /**
     * Synchronizes calendar objects for setting.
     */
    private function syncCalendarObjectsForSetting(
        AddressBook $addressBook,
        AddressBookContactMilestoneCalendar $setting,
        Calendar $calendar,
    ): void {
        $generationYears = AppSetting::milestoneCalendarGenerationYears();
        $desiredObjects = $setting->milestone_type === AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY
            ? $this->desiredBirthdayEvents($addressBook, $generationYears)
            : $this->desiredAnniversaryEvents($addressBook, $generationYears);

        $managedPrefix = $this->managedUriPrefix($setting->milestone_type);

        $existingObjects = CalendarObject::query()
            ->where('calendar_id', $calendar->id)
            ->where('uri', 'like', $managedPrefix.'%')
            ->get()
            ->keyBy('uri');

        foreach ($desiredObjects as $uri => $data) {
            $existing = $existingObjects->pull($uri);
            $this->upsertCalendarObject($calendar, $uri, $data, $existing);
        }

        foreach ($existingObjects as $staleObject) {
            $staleObject->delete();
            $this->syncService->recordDeleted(
                resourceType: ShareResourceType::Calendar,
                resourceId: $calendar->id,
                uri: $staleObject->uri,
            );
        }
    }

    /**
     * Performs the upsert calendar object operation.
     */
    private function upsertCalendarObject(
        Calendar $calendar,
        string $uri,
        string $rawData,
        ?CalendarObject $existingObject = null,
    ): void {
        $normalized = $this->icsValidator->validateAndNormalize($rawData);
        $etag = md5($normalized['data']);
        $size = strlen($normalized['data']);
        $uid = $this->normalizeString($normalized['uid'] ?? null);

        if ($existingObject) {
            $dirty = $existingObject->uid !== $uid
                || $existingObject->etag !== $etag
                || $existingObject->size !== $size
                || $existingObject->component_type !== ($normalized['component_type'] ?? null)
                || $existingObject->data !== $normalized['data'];

            if (! $dirty) {
                return;
            }

            $existingObject->update([
                'uid' => $uid,
                'etag' => $etag,
                'size' => $size,
                'component_type' => $normalized['component_type'] ?? null,
                'first_occurred_at' => $normalized['first_occurred_at'] ?? null,
                'last_occurred_at' => $normalized['last_occurred_at'] ?? null,
                'data' => $normalized['data'],
            ]);

            $this->syncService->recordModified(
                resourceType: ShareResourceType::Calendar,
                resourceId: $calendar->id,
                uri: $uri,
            );

            return;
        }

        CalendarObject::query()->create([
            'calendar_id' => $calendar->id,
            'uri' => $uri,
            'uid' => $uid,
            'etag' => $etag,
            'size' => $size,
            'component_type' => $normalized['component_type'] ?? null,
            'first_occurred_at' => $normalized['first_occurred_at'] ?? null,
            'last_occurred_at' => $normalized['last_occurred_at'] ?? null,
            'data' => $normalized['data'],
        ]);

        $this->syncService->recordAdded(
            resourceType: ShareResourceType::Calendar,
            resourceId: $calendar->id,
            uri: $uri,
        );
    }

    /**
     * Returns desired birthday events.
     *
     * @return array<string, string>
     */
    private function desiredBirthdayEvents(AddressBook $addressBook, int $generationYears): array
    {
        $events = [];

        foreach ($this->contactsForAddressBook($addressBook->id) as $contact) {
            $payload = is_array($contact->payload) ? $contact->payload : [];
            if ($this->contactExcludedFromMilestones($payload)) {
                continue;
            }
            $dateParts = $this->normalizeDateParts($payload['birthday'] ?? null);
            if (! $dateParts) {
                continue;
            }

            $contactName = $this->birthdayMilestoneName($contact);
            if ($contactName === null) {
                continue;
            }

            foreach ($this->upcomingOccurrenceYears($dateParts, $generationYears) as $occurrenceYear) {
                $yearSuffix = (string) $occurrenceYear;
                $uri = $this->managedUri(
                    type: AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
                    contactId: $contact->id,
                    suffix: $yearSuffix,
                );

                $events[$uri] = $this->buildAllDayEvent(
                    uid: $this->managedUid(
                        type: AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
                        addressBookId: $addressBook->id,
                        contactId: $contact->id,
                        suffix: $yearSuffix,
                    ),
                    summary: $this->birthdaySummary(
                        contactName: $contactName,
                        baseYear: $dateParts['year'],
                        occurrenceYear: $occurrenceYear,
                    ),
                    year: $occurrenceYear,
                    month: $dateParts['month'],
                    day: $dateParts['day'],
                    addressBookId: $addressBook->id,
                    contactId: $contact->id,
                    milestoneType: AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
                );
            }
        }

        return $events;
    }

    /**
     * Returns desired anniversary events.
     *
     * @return array<string, string>
     */
    private function desiredAnniversaryEvents(AddressBook $addressBook, int $generationYears): array
    {
        $events = [];
        $anniversariesByDate = [];

        foreach ($this->contactsForAddressBook($addressBook->id) as $contact) {
            $payload = is_array($contact->payload) ? $contact->payload : [];
            if ($this->contactExcludedFromMilestones($payload)) {
                continue;
            }

            $contactName = $this->anniversaryMilestoneName($contact);
            if ($contactName === null) {
                continue;
            }

            $anniversaries = $this->anniversaryDates($payload);
            if ($anniversaries === []) {
                continue;
            }

            $contactNameKeys = $this->anniversaryContactNameKeys($contact, $payload, $contactName);
            $relatedNameKeys = $this->anniversaryRelatedNameKeys($payload);
            $firstName = $this->anniversaryFirstName($payload, $contactName);
            $lastName = $this->anniversaryLastName($payload, $contactName);
            $isHeadOfHousehold = $this->payloadBoolean($payload['head_of_household'] ?? false);

            foreach ($anniversaries as $anniversary) {
                $dateParts = $anniversary['date_parts'];
                $dateKey = $this->anniversaryDateKey($dateParts);

                $anniversariesByDate[$dateKey][] = [
                    'entry_key' => $contact->id.':'.$anniversary['id'],
                    'contact' => $contact,
                    'anniversary' => $anniversary,
                    'contact_name' => $contactName,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'is_head_of_household' => $isHeadOfHousehold,
                    'contact_name_keys' => $contactNameKeys,
                    'related_name_keys' => $relatedNameKeys,
                ];
            }
        }

        $pairedEntryKeys = [];

        foreach ($anniversariesByDate as $entries) {
            foreach ($this->anniversaryPairsForDateEntries($entries) as $pair) {
                $left = $pair['left'];
                $right = $pair['right'];

                $pairedEntryKeys[$left['entry_key']] = true;
                $pairedEntryKeys[$right['entry_key']] = true;

                [$primary, $secondary] = $this->orderedAnniversaryPairEntries($left, $right);
                $primaryDateParts = $primary['anniversary']['date_parts'];
                $secondaryDateParts = $secondary['anniversary']['date_parts'];
                $baseYear = $primaryDateParts['year'] ?? $secondaryDateParts['year'];

                foreach ($this->upcomingOccurrenceYears($primaryDateParts, $generationYears) as $occurrenceYear) {
                    $suffix = $this->anniversaryPairSuffix($left, $right, $occurrenceYear);
                    $primaryContact = $primary['contact'];
                    $primaryContactId = (int) $primaryContact->id;
                    $uri = $this->managedUri(
                        type: AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
                        contactId: $primaryContactId,
                        suffix: $suffix,
                    );

                    $events[$uri] = $this->buildAllDayEvent(
                        uid: $this->managedUid(
                            type: AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
                            addressBookId: $addressBook->id,
                            contactId: $primaryContactId,
                            suffix: $suffix,
                        ),
                        summary: $this->anniversaryPairSummary(
                            primaryEntry: $primary,
                            secondaryEntry: $secondary,
                            baseYear: $baseYear,
                            occurrenceYear: $occurrenceYear,
                        ),
                        year: $occurrenceYear,
                        month: $primaryDateParts['month'],
                        day: $primaryDateParts['day'],
                        addressBookId: $addressBook->id,
                        contactId: $primaryContactId,
                        milestoneType: AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
                    );
                }
            }
        }

        foreach ($anniversariesByDate as $entries) {
            foreach ($entries as $entry) {
                if (isset($pairedEntryKeys[$entry['entry_key']])) {
                    continue;
                }

                $contact = $entry['contact'];
                $contactId = (int) $contact->id;
                $anniversary = $entry['anniversary'];
                $dateParts = $anniversary['date_parts'];

                foreach ($this->upcomingOccurrenceYears($dateParts, $generationYears) as $occurrenceYear) {
                    $suffix = $anniversary['id'].'-'.$occurrenceYear;
                    $uri = $this->managedUri(
                        type: AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
                        contactId: $contactId,
                        suffix: $suffix,
                    );

                    $events[$uri] = $this->buildAllDayEvent(
                        uid: $this->managedUid(
                            type: AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
                            addressBookId: $addressBook->id,
                            contactId: $contactId,
                            suffix: $suffix,
                        ),
                        summary: $this->anniversarySummary(
                            contactName: $entry['contact_name'],
                            baseYear: $dateParts['year'],
                            occurrenceYear: $occurrenceYear,
                        ),
                        year: $occurrenceYear,
                        month: $dateParts['month'],
                        day: $dateParts['day'],
                        addressBookId: $addressBook->id,
                        contactId: $contactId,
                        milestoneType: AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
                    );
                }
            }
        }

        return $events;
    }

    /**
     * Returns anniversary date key.
     *
     * @param  array{year:?int,month:int,day:int,effective_year:int}  $dateParts
     */
    private function anniversaryDateKey(array $dateParts): string
    {
        return sprintf('%02d-%02d', $dateParts['month'], $dateParts['day']);
    }

    /**
     * Returns anniversary related name keys.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, bool>
     */
    private function anniversaryRelatedNameKeys(array $payload): array
    {
        $rows = is_array($payload['related_names'] ?? null) ? $payload['related_names'] : [];
        $keys = [];

        foreach ($rows as $row) {
            if (! is_array($row) || ! $this->isSpouseLikeRelatedNameRow($row)) {
                continue;
            }

            $key = $this->anniversaryNameKey($row['value'] ?? null);
            if ($key === null) {
                continue;
            }

            $keys[$key] = true;

            $relatedContactKey = $this->anniversaryContactIdKey($row['related_contact_id'] ?? null);
            if ($relatedContactKey !== null) {
                $keys[$relatedContactKey] = true;
            }
        }

        return $keys;
    }

    /**
     * Checks whether spouse like related name row.
     *
     * @param  array<string, mixed>  $row
     */
    private function isSpouseLikeRelatedNameRow(array $row): bool
    {
        $label = str_replace(['_', '-'], ' ', Str::lower(trim((string) ($row['label'] ?? ''))));
        $customLabel = str_replace(['_', '-'], ' ', Str::lower(trim((string) ($row['custom_label'] ?? ''))));

        if (preg_match('/\b(spouse|partner|husband|wife|boyfriend|girlfriend|fiance|fiancee)\b/', $label) === 1) {
            return true;
        }

        return preg_match('/\b(spouse|partner|husband|wife|boyfriend|girlfriend|fiance|fiancee)\b/', $customLabel) === 1;
    }

    /**
     * Returns anniversary contact name keys.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, bool>
     */
    private function anniversaryContactNameKeys(Contact $contact, array $payload, string $contactName): array
    {
        $keys = [];

        $contactIdKey = $this->anniversaryContactIdKey($contact->id);
        if ($contactIdKey !== null) {
            $keys[$contactIdKey] = true;
        }

        $this->addAnniversaryNameKey($keys, $contactName);
        $this->addAnniversaryNameKey($keys, $contact->full_name);

        $firstName = $this->normalizeString($payload['first_name'] ?? null);
        $lastName = $this->normalizeString($payload['last_name'] ?? null);
        if ($firstName !== null && $lastName !== null) {
            $this->addAnniversaryNameKey($keys, $firstName.' '.$lastName);
        }

        return $keys;
    }

    /**
     * Returns anniversary contact ID key.
     */
    private function anniversaryContactIdKey(mixed $value): ?string
    {
        $contactId = $this->toInteger($value);
        if ($contactId === null || $contactId <= 0) {
            return null;
        }

        return 'id:'.$contactId;
    }

    /**
     * Performs the add anniversary name key operation.
     *
     * @param  array<string, bool>  $keys
     */
    private function addAnniversaryNameKey(array &$keys, mixed $value): void
    {
        $key = $this->anniversaryNameKey($value);
        if ($key === null) {
            return;
        }

        $keys[$key] = true;
    }

    /**
     * Returns anniversary name key.
     */
    private function anniversaryNameKey(mixed $value): ?string
    {
        $normalized = $this->normalizeString($value);
        if ($normalized === null) {
            return null;
        }

        $key = Str::lower($normalized);
        $key = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $key) ?? '';
        $key = trim(preg_replace('/\s+/', ' ', $key) ?? '');

        return $key !== '' ? $key : null;
    }

    /**
     * Returns anniversary first name.
     *
     * @param  array<string, mixed>  $payload
     */
    private function anniversaryFirstName(array $payload, string $contactName): string
    {
        $firstName = $this->preferredFirstMilestoneName(
            payload: $payload,
            preferNickname: $this->anniversaryPrioritizesNicknameInTitle(),
        );
        if ($firstName !== null) {
            return $firstName;
        }

        return $this->firstNameToken($contactName) ?? $contactName;
    }

    /**
     * Returns anniversary last name.
     *
     * @param  array<string, mixed>  $payload
     */
    private function anniversaryLastName(array $payload, string $contactName): ?string
    {
        $lastName = $this->normalizeString($payload['last_name'] ?? null);
        if ($lastName !== null) {
            return $lastName;
        }

        $pieces = preg_split('/\s+/', $contactName) ?: [];
        if (count($pieces) < 2) {
            return null;
        }

        return $pieces[count($pieces) - 1];
    }

    /**
     * Returns anniversary pairs for date entries.
     *
     * @param  array<int, array<string, mixed>>  $entries
     * @return array<int, array{left:array<string, mixed>, right:array<string, mixed>}>
     */
    private function anniversaryPairsForDateEntries(array $entries): array
    {
        $pairs = [];
        $available = array_fill_keys(array_keys($entries), true);
        $entryCount = count($entries);

        for ($leftIndex = 0; $leftIndex < $entryCount; $leftIndex++) {
            if (! isset($available[$leftIndex])) {
                continue;
            }

            $left = $entries[$leftIndex];
            $matchedRightIndex = null;

            for ($rightIndex = $leftIndex + 1; $rightIndex < $entryCount; $rightIndex++) {
                if (! isset($available[$rightIndex])) {
                    continue;
                }

                $right = $entries[$rightIndex];
                if (! $this->entriesAreMutuallyMarried($left, $right)) {
                    continue;
                }

                $matchedRightIndex = $rightIndex;
                break;
            }

            if ($matchedRightIndex === null) {
                continue;
            }

            $pairs[] = [
                'left' => $left,
                'right' => $entries[$matchedRightIndex],
            ];

            unset($available[$leftIndex], $available[$matchedRightIndex]);
        }

        return $pairs;
    }

    /**
     * Checks whether entries are mutually married.
     *
     * @param  array<string, mixed>  $left
     * @param  array<string, mixed>  $right
     */
    private function entriesAreMutuallyMarried(array $left, array $right): bool
    {
        return $this->entryReferencesOtherAsSpouse($left, $right)
            && $this->entryReferencesOtherAsSpouse($right, $left);
    }

    /**
     * Checks whether entry references other as spouse.
     *
     * @param  array<string, mixed>  $source
     * @param  array<string, mixed>  $target
     */
    private function entryReferencesOtherAsSpouse(array $source, array $target): bool
    {
        /** @var array<string, bool> $sourceRelatedNames */
        $sourceRelatedNames = $source['related_name_keys'];
        /** @var array<string, bool> $targetNameKeys */
        $targetNameKeys = $target['contact_name_keys'];

        foreach ($targetNameKeys as $nameKey => $present) {
            if (! $present) {
                continue;
            }

            if (isset($sourceRelatedNames[$nameKey])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Returns ordered anniversary pair entries.
     *
     * @param  array<string, mixed>  $left
     * @param  array<string, mixed>  $right
     * @return array{0:array<string, mixed>,1:array<string, mixed>}
     */
    private function orderedAnniversaryPairEntries(array $left, array $right): array
    {
        $leftHeadOfHousehold = (bool) ($left['is_head_of_household'] ?? false);
        $rightHeadOfHousehold = (bool) ($right['is_head_of_household'] ?? false);

        if ($leftHeadOfHousehold !== $rightHeadOfHousehold) {
            return $leftHeadOfHousehold ? [$left, $right] : [$right, $left];
        }

        $leftContactId = (int) ($left['contact']?->id ?? 0);
        $rightContactId = (int) ($right['contact']?->id ?? 0);

        return $leftContactId <= $rightContactId
            ? [$left, $right]
            : [$right, $left];
    }

    /**
     * Returns anniversary pair suffix.
     *
     * @param  array<string, mixed>  $left
     * @param  array<string, mixed>  $right
     */
    private function anniversaryPairSuffix(array $left, array $right, int $occurrenceYear): string
    {
        $pairKeys = [
            ((int) ($left['contact']?->id ?? 0)).'-'.((string) ($left['anniversary']['id'] ?? '0')),
            ((int) ($right['contact']?->id ?? 0)).'-'.((string) ($right['anniversary']['id'] ?? '0')),
        ];
        sort($pairKeys, SORT_STRING);

        return 'couple-'.implode('--', $pairKeys).'-'.$occurrenceYear;
    }

    /**
     * Returns anniversary pair summary.
     *
     * @param  array<string, mixed>  $primaryEntry
     * @param  array<string, mixed>  $secondaryEntry
     */
    private function anniversaryPairSummary(
        array $primaryEntry,
        array $secondaryEntry,
        ?int $baseYear,
        int $occurrenceYear,
    ): string {
        $primaryFirstName = trim((string) ($primaryEntry['first_name'] ?? ''));
        $secondaryFirstName = trim((string) ($secondaryEntry['first_name'] ?? ''));
        $primaryLastName = $this->normalizeString($primaryEntry['last_name'] ?? null);

        $name = trim($primaryFirstName.' & '.$secondaryFirstName);
        if ($this->anniversaryPairIncludesLastNameInTitle() && $primaryLastName !== null) {
            $name = trim($name.' '.$primaryLastName);
        }

        if ($name === '') {
            $name = trim((string) ($primaryEntry['contact_name'] ?? 'Anniversary'));
        }

        $possessiveName = $this->milestonePossessiveName($name);
        $ordinal = $this->milestoneOrdinal($baseYear, $occurrenceYear);

        return $ordinal !== null
            ? '💍 '.$possessiveName.' '.$ordinal.' Anniversary'
            : '💍 '.$possessiveName.' Anniversary';
    }

    /**
     * Determines whether anniversary pair titles should include a last name.
     */
    private function anniversaryPairIncludesLastNameInTitle(): bool
    {
        return (bool) config('services.contacts.anniversary_pair_include_last_name', false);
    }

    /**
     * Returns contacts for address book.
     *
     * @return Collection<int, Contact>
     */
    private function contactsForAddressBook(int $addressBookId): Collection
    {
        return Contact::query()
            ->whereHas('assignments', fn ($query) => $query->where('address_book_id', $addressBookId))
            ->orderBy('id')
            ->get();
    }

    /**
     * Returns anniversary dates.
     *
     * @param  array<string, mixed>  $payload
     * @return array<int, array{id:string, date_parts:array{year:?int,month:int,day:int,effective_year:int}} >
     */
    private function anniversaryDates(array $payload): array
    {
        $rows = is_array($payload['dates'] ?? null) ? $payload['dates'] : [];
        $occurrences = [];
        $dateCounts = [];

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $label = strtolower(trim((string) ($row['label'] ?? '')));
            if ($label !== AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY) {
                continue;
            }

            $dateParts = $this->normalizeDateParts($row);
            if (! $dateParts) {
                continue;
            }

            $dateId = sprintf(
                '%04d-%02d-%02d',
                $dateParts['year'] ?? 0,
                $dateParts['month'],
                $dateParts['day'],
            );
            $dateCounts[$dateId] = ($dateCounts[$dateId] ?? 0) + 1;

            $occurrences[] = [
                'id' => $dateId.'-'.$dateCounts[$dateId],
                'date_parts' => $dateParts,
            ];
        }

        return $occurrences;
    }

    /**
     * Normalizes date parts.
     *
     * @param  array<string, mixed>|mixed  $value
     * @return array{year:?int,month:int,day:int,effective_year:int}|null
     */
    private function normalizeDateParts(mixed $value): ?array
    {
        if (! is_array($value)) {
            return null;
        }

        $month = $this->toInteger($value['month'] ?? null);
        $day = $this->toInteger($value['day'] ?? null);
        $year = $this->toInteger($value['year'] ?? null);

        if ($month === null || $day === null) {
            return null;
        }

        if ($month < 1 || $month > 12 || $day < 1 || $day > 31) {
            return null;
        }

        if (! checkdate($month, $day, self::FALLBACK_YEAR)) {
            return null;
        }

        if ($year !== null && ($year < 1 || $year > 9999)) {
            $year = null;
        }

        return [
            'year' => $year,
            'month' => $month,
            'day' => $day,
            'effective_year' => $year ?? self::FALLBACK_YEAR,
        ];
    }

    /**
     * Builds all day event.
     */
    private function buildAllDayEvent(
        string $uid,
        string $summary,
        int $year,
        int $month,
        int $day,
        int $addressBookId,
        int $contactId,
        string $milestoneType,
    ): string {
        $dateValue = sprintf('%04d%02d%02d', $year, $month, $day);

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Davvy//Contact Milestones//EN',
            'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT',
            'UID:'.$uid,
            'DTSTAMP:'.now()->utc()->format('Ymd\THis\Z'),
            'SUMMARY:'.$this->escapeIcsText($summary),
            'DTSTART;VALUE=DATE:'.$dateValue,
            'TRANSP:TRANSPARENT',
            'X-DAVVY-SOURCE-ADDRESS-BOOK-ID:'.$addressBookId,
            'X-DAVVY-SOURCE-CONTACT-ID:'.$contactId,
            'X-DAVVY-MILESTONE-TYPE:'.strtoupper($milestoneType),
            'END:VEVENT',
            'END:VCALENDAR',
            '',
        ];

        return implode("\r\n", $lines);
    }

    /**
     * Returns birthday summary.
     */
    private function birthdaySummary(string $contactName, ?int $baseYear, int $occurrenceYear): string
    {
        $possessiveName = $this->milestonePossessiveName($contactName);
        $ordinal = $this->milestoneOrdinal($baseYear, $occurrenceYear);

        return $ordinal !== null
            ? '🎂 '.$possessiveName.' '.$ordinal.' Birthday'
            : '🎂 '.$possessiveName.' Birthday';
    }

    /**
     * Returns anniversary summary.
     */
    private function anniversarySummary(string $contactName, ?int $baseYear, int $occurrenceYear): string
    {
        $possessiveName = $this->milestonePossessiveName($contactName);
        $ordinal = $this->milestoneOrdinal($baseYear, $occurrenceYear);

        return $ordinal !== null
            ? '💍 '.$possessiveName.' '.$ordinal.' Anniversary'
            : '💍 '.$possessiveName.' Anniversary';
    }

    /**
     * Returns milestone-safe possessive name.
     */
    private function milestonePossessiveName(string $name): string
    {
        $trimmed = trim($name);
        if ($trimmed === '') {
            return '';
        }

        return preg_match('/s$/iu', $trimmed) === 1
            ? $trimmed.'\''
            : $trimmed.'\'s';
    }

    /**
     * Returns birthday contact milestone name.
     */
    private function birthdayMilestoneName(Contact $contact): ?string
    {
        $payload = is_array($contact->payload) ? $contact->payload : [];
        $firstName = $this->preferredFirstMilestoneName(
            payload: $payload,
            preferNickname: $this->birthdayPrioritizesNicknameInTitle(),
        );
        $lastName = $this->normalizeString($payload['last_name'] ?? null);
        $includeLastName = $this->birthdayIncludesLastNameInTitle();

        if ($includeLastName) {
            $name = trim(implode(' ', array_filter([$firstName, $lastName])));
            if ($name !== '') {
                return $name;
            }
        } elseif ($firstName !== null) {
            return $firstName;
        }

        $fullName = $this->normalizeString($contact->full_name);
        if ($fullName !== null && strtolower($fullName) !== 'unnamed contact') {
            if ($includeLastName) {
                return $fullName;
            }

            $firstToken = $this->firstNameToken($fullName);
            if ($firstToken !== null) {
                return $firstToken;
            }
        }

        return $this->normalizeString($payload['company'] ?? null);
    }

    /**
     * Determines whether birthday titles should include a last name.
     */
    private function birthdayIncludesLastNameInTitle(): bool
    {
        return (bool) config('services.contacts.birthday_include_last_name', true);
    }

    /**
     * Determines whether birthday titles should prioritize nickname before first name.
     */
    private function birthdayPrioritizesNicknameInTitle(): bool
    {
        return (bool) config('services.contacts.birthday_prioritize_nickname', true);
    }

    /**
     * Returns anniversary contact milestone name.
     */
    private function anniversaryMilestoneName(Contact $contact): ?string
    {
        if (! $this->anniversaryPrioritizesNicknameInTitle()) {
            return $this->contactMilestoneName($contact);
        }

        $payload = is_array($contact->payload) ? $contact->payload : [];
        $firstName = $this->preferredFirstMilestoneName(
            payload: $payload,
            preferNickname: true,
        );
        $lastName = $this->normalizeString($payload['last_name'] ?? null);
        $name = trim(implode(' ', array_filter([$firstName, $lastName])));

        if ($name !== '') {
            return $name;
        }

        $fullName = $this->normalizeString($contact->full_name);
        if ($fullName !== null && strtolower($fullName) !== 'unnamed contact') {
            return $fullName;
        }

        return $this->normalizeString($payload['company'] ?? null);
    }

    /**
     * Determines whether anniversary titles should prioritize nickname before first name.
     */
    private function anniversaryPrioritizesNicknameInTitle(): bool
    {
        return (bool) config('services.contacts.anniversary_prioritize_nickname', true);
    }

    /**
     * Returns contact milestone name.
     */
    private function contactMilestoneName(Contact $contact): ?string
    {
        $fullName = $this->normalizeString($contact->full_name);
        if ($fullName !== null && strtolower($fullName) !== 'unnamed contact') {
            return $fullName;
        }

        $payload = is_array($contact->payload) ? $contact->payload : [];
        $name = $this->firstLastMilestoneName($payload);

        if ($name !== '') {
            return $name;
        }

        return $this->normalizeString($payload['company'] ?? null);
    }

    /**
     * Returns first + last milestone name.
     *
     * @param  array<string, mixed>  $payload
     */
    private function firstLastMilestoneName(array $payload): string
    {
        $firstName = $this->normalizeString($payload['first_name'] ?? null);
        $lastName = $this->normalizeString($payload['last_name'] ?? null);

        return trim(implode(' ', array_filter([$firstName, $lastName])));
    }

    /**
     * Returns preferred first milestone name.
     *
     * @param  array<string, mixed>  $payload
     */
    private function preferredFirstMilestoneName(array $payload, bool $preferNickname): ?string
    {
        if ($preferNickname) {
            $nickname = $this->normalizeString($payload['nickname'] ?? null);
            if ($nickname !== null) {
                return $nickname;
            }
        }

        return $this->normalizeString($payload['first_name'] ?? null);
    }

    /**
     * Returns first token for a display-like name.
     */
    private function firstNameToken(string $name): ?string
    {
        $pieces = preg_split('/\s+/', trim($name)) ?: [];
        $firstToken = trim((string) ($pieces[0] ?? ''));

        return $firstToken !== '' ? $firstToken : null;
    }

    /**
     * Performs the reconcile legacy cards for address book operation.
     */
    private function reconcileLegacyCardsForAddressBook(AddressBook $addressBook): void
    {
        if (! Schema::hasTable('cards')) {
            return;
        }

        $orphanCards = Card::query()
            ->where('address_book_id', $addressBook->id)
            ->whereNotExists(function ($query): void {
                $query->select(DB::raw(1))
                    ->from('contact_address_book_assignments')
                    ->whereColumn('contact_address_book_assignments.card_id', 'cards.id');
            })
            ->orderBy('id')
            ->get();

        foreach ($orphanCards as $card) {
            $this->upsertLegacyManagedContact($addressBook, $card);
        }
    }

    /**
     * Performs the upsert legacy managed contact operation.
     */
    private function upsertLegacyManagedContact(AddressBook $addressBook, Card $card): void
    {
        $parsed = $this->contactVCardService->parse($card->data);
        if ($parsed === null) {
            return;
        }

        $uid = $this->normalizeString($card->uid) ?? $this->normalizeString($parsed['uid'] ?? null);
        if ($uid === null) {
            return;
        }

        $payload = is_array($parsed['payload'] ?? null) ? $parsed['payload'] : [];
        $fullName = $this->contactVCardService->displayName($payload);
        $ownerId = (int) $addressBook->owner_id;
        $hintContactId = $this->toInteger($parsed['managed_contact_id'] ?? null);

        DB::transaction(function () use (
            $addressBook,
            $card,
            $uid,
            $payload,
            $fullName,
            $ownerId,
            $hintContactId
        ): void {
            $targetContact = Contact::query()
                ->where('owner_id', $ownerId)
                ->where('uid', $uid)
                ->first();

            if ($targetContact === null && $hintContactId !== null) {
                $targetContact = Contact::query()
                    ->where('id', $hintContactId)
                    ->where('owner_id', $ownerId)
                    ->first();
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

            $assignment = ContactAddressBookAssignment::query()
                ->where('contact_id', $targetContact->id)
                ->where('address_book_id', $addressBook->id)
                ->first();

            if ($assignment) {
                $assignment->update([
                    'card_id' => $card->id,
                    'card_uri' => $card->uri,
                ]);

                return;
            }

            ContactAddressBookAssignment::query()->create([
                'contact_id' => $targetContact->id,
                'address_book_id' => $addressBook->id,
                'card_id' => $card->id,
                'card_uri' => $card->uri,
            ]);
        });
    }

    /**
     * Returns upcoming occurrence years.
     *
     * @param  array{year:?int,month:int,day:int,effective_year:int}  $dateParts
     * @return array<int, int>
     */
    private function upcomingOccurrenceYears(array $dateParts, int $generationYears): array
    {
        $targetCount = max(1, $generationYears);
        $today = now()->startOfDay();
        $candidateYear = (int) $today->year;
        $maxYear = $candidateYear + max(50, $targetCount * 6);
        $years = [];

        while ($candidateYear <= $maxYear && count($years) < $targetCount) {
            if (! checkdate($dateParts['month'], $dateParts['day'], $candidateYear)) {
                $candidateYear++;

                continue;
            }

            $occurrenceDate = $today->copy()->setDate(
                $candidateYear,
                $dateParts['month'],
                $dateParts['day'],
            );
            if ($occurrenceDate->lt($today)) {
                $candidateYear++;

                continue;
            }

            $years[] = $candidateYear;
            $candidateYear++;
        }

        return $years;
    }

    /**
     * Returns milestone ordinal.
     */
    private function milestoneOrdinal(?int $baseYear, int $occurrenceYear): ?string
    {
        if ($baseYear === null) {
            return null;
        }

        $number = $occurrenceYear - $baseYear;
        if ($number <= 0) {
            return null;
        }

        $suffix = 'th';
        if (! in_array($number % 100, [11, 12, 13], true)) {
            $suffix = match ($number % 10) {
                1 => 'st',
                2 => 'nd',
                3 => 'rd',
                default => 'th',
            };
        }

        return $number.$suffix;
    }

    /**
     * Returns managed URI.
     */
    private function managedUri(string $type, int $contactId, ?string $suffix = null): string
    {
        $base = $this->managedUriPrefix($type).'contact-'.$contactId;
        if ($suffix !== null && $suffix !== '') {
            $base .= '-'.$suffix;
        }

        return $base.'.ics';
    }

    /**
     * Returns managed uid.
     */
    private function managedUid(
        string $type,
        int $addressBookId,
        int $contactId,
        ?string $suffix = null,
    ): string {
        $base = sprintf('davvy-milestone-%s-book-%d-contact-%d', $type, $addressBookId, $contactId);
        if ($suffix !== null && $suffix !== '') {
            $base .= '-'.$suffix;
        }

        return $base;
    }

    /**
     * Returns managed URI prefix.
     */
    private function managedUriPrefix(string $type): string
    {
        return self::MANAGED_URI_PREFIX.$type.'-';
    }

    /**
     * Returns display name for setting.
     */
    private function displayNameForSetting(
        AddressBook $addressBook,
        AddressBookContactMilestoneCalendar $setting,
        string $type,
    ): string {
        return $this->normalizeString($setting->custom_display_name)
            ?? $this->defaultCalendarName($addressBook, $type);
    }

    /**
     * Returns default calendar name.
     */
    private function defaultCalendarName(AddressBook $addressBook, string $type): string
    {
        return sprintf(
            '%s %s',
            trim((string) $addressBook->display_name),
            $type === AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY
                ? 'Birthdays'
                : 'Anniversaries',
        );
    }

    /**
     * Returns unique calendar URI.
     */
    private function uniqueCalendarUri(int $ownerId, string $baseUri): string
    {
        $seed = trim((string) $baseUri) !== '' ? trim((string) $baseUri) : 'calendar';
        $candidate = $seed;
        $suffix = 1;

        while (
            Calendar::query()
                ->where('owner_id', $ownerId)
                ->where('uri', $candidate)
                ->exists()
        ) {
            $candidate = $seed.'-'.$suffix;
            $suffix++;
        }

        return $candidate;
    }

    /**
     * Normalizes string.
     */
    private function normalizeString(mixed $value): ?string
    {
        if (! is_scalar($value) && $value !== null) {
            return null;
        }

        $normalized = trim((string) ($value ?? ''));

        return $normalized === '' ? null : $normalized;
    }

    /**
     * Checks whether contact excluded from milestones.
     *
     * @param  array<string, mixed>  $payload
     */
    private function contactExcludedFromMilestones(array $payload): bool
    {
        return $this->payloadBoolean($payload['exclude_milestone_calendars'] ?? false);
    }

    /**
     * Checks whether payload boolean.
     */
    private function payloadBoolean(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value)) {
            return $value !== 0;
        }

        if (is_string($value)) {
            return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'on'], true);
        }

        return false;
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
     * Returns escape ICS text.
     */
    private function escapeIcsText(string $value): string
    {
        return str_replace(
            ['\\', ';', ',', "\r\n", "\r", "\n"],
            ['\\\\', '\;', '\,', '\n', '\n', '\n'],
            $value,
        );
    }

    /**
     * Returns milestone types.
     *
     * @return array<int, string>
     */
    private function milestoneTypes(): array
    {
        return [
            AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
            AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
        ];
    }

    /**
     * Returns settings key for type.
     */
    private function settingsKeyForType(string $type): string
    {
        return $type === AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY
            ? 'birthdays'
            : 'anniversaries';
    }

    /**
     * Returns enabled field for type.
     */
    private function enabledFieldForType(string $type): string
    {
        return $type === AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY
            ? 'birthdays_enabled'
            : 'anniversaries_enabled';
    }

    /**
     * Returns custom name field for type.
     */
    private function customNameFieldForType(string $type): string
    {
        return $type === AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY
            ? 'birthday_calendar_name'
            : 'anniversary_calendar_name';
    }

    /**
     * Marks milestone purge control visible.
     */
    private function markMilestonePurgeControlVisible(?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'milestone_purge_control_visible'],
            ['value' => 'true', 'updated_by' => $actor?->id],
        );
    }

    /**
     * Checks whether schema available.
     */
    private function schemaAvailable(): bool
    {
        return Schema::hasTable('address_book_contact_milestone_calendars')
            && Schema::hasTable('contacts')
            && Schema::hasTable('contact_address_book_assignments');
    }
}
