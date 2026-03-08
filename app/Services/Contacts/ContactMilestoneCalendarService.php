<?php

namespace App\Services\Contacts;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\AddressBookContactMilestoneCalendar;
use App\Models\AppSetting;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\Contact;
use App\Models\User;
use App\Services\Dav\DavSyncService;
use App\Services\Dav\IcsValidator;
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
    ) {}

    /**
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

    public function handleAddressBookDeleted(AddressBook $addressBook): void
    {
        if (! $this->schemaAvailable()) {
            return;
        }

        $settings = AddressBookContactMilestoneCalendar::query()
            ->with('calendar')
            ->where('address_book_id', $addressBook->id)
            ->get();

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

    private function syncCalendarObjectsForSetting(
        AddressBook $addressBook,
        AddressBookContactMilestoneCalendar $setting,
        Calendar $calendar,
    ): void {
        $desiredObjects = $setting->milestone_type === AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY
            ? $this->desiredBirthdayEvents($addressBook)
            : $this->desiredAnniversaryEvents($addressBook);

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
     * @return array<string, string>
     */
    private function desiredBirthdayEvents(AddressBook $addressBook): array
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

            $uri = $this->managedUri(
                type: AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
                contactId: $contact->id,
            );

            $events[$uri] = $this->buildAnnualAllDayEvent(
                uid: $this->managedUid(
                    type: AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
                    addressBookId: $addressBook->id,
                    contactId: $contact->id,
                ),
                summary: $this->birthdaySummary($contact),
                dateParts: $dateParts,
                addressBookId: $addressBook->id,
                contactId: $contact->id,
                milestoneType: AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
            );
        }

        return $events;
    }

    /**
     * @return array<string, string>
     */
    private function desiredAnniversaryEvents(AddressBook $addressBook): array
    {
        $events = [];

        foreach ($this->contactsForAddressBook($addressBook->id) as $contact) {
            $payload = is_array($contact->payload) ? $contact->payload : [];
            if ($this->contactExcludedFromMilestones($payload)) {
                continue;
            }
            $anniversaries = $this->anniversaryDates($payload);

            foreach ($anniversaries as $anniversary) {
                $suffix = $anniversary['id'];
                $dateParts = $anniversary['date_parts'];
                $uri = $this->managedUri(
                    type: AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
                    contactId: $contact->id,
                    suffix: $suffix,
                );

                $events[$uri] = $this->buildAnnualAllDayEvent(
                    uid: $this->managedUid(
                        type: AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
                        addressBookId: $addressBook->id,
                        contactId: $contact->id,
                        suffix: $suffix,
                    ),
                    summary: $this->anniversarySummary($contact),
                    dateParts: $dateParts,
                    addressBookId: $addressBook->id,
                    contactId: $contact->id,
                    milestoneType: AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
                );
            }
        }

        return $events;
    }

    /**
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
     * @param  array{year:?int,month:int,day:int,effective_year:int}  $dateParts
     */
    private function buildAnnualAllDayEvent(
        string $uid,
        string $summary,
        array $dateParts,
        int $addressBookId,
        int $contactId,
        string $milestoneType,
    ): string {
        $dateValue = sprintf(
            '%04d%02d%02d',
            $dateParts['effective_year'],
            $dateParts['month'],
            $dateParts['day'],
        );

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
            'RRULE:FREQ=YEARLY',
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

    private function birthdaySummary(Contact $contact): string
    {
        return '🎂 '.$this->contactMilestoneName($contact).'\'s Birthday';
    }

    private function anniversarySummary(Contact $contact): string
    {
        return '💍 '.$this->contactMilestoneName($contact).'\'s Anniversary';
    }

    private function contactMilestoneName(Contact $contact): string
    {
        $payload = is_array($contact->payload) ? $contact->payload : [];
        $firstName = $this->normalizeString($payload['first_name'] ?? null);
        $lastName = $this->normalizeString($payload['last_name'] ?? null);
        $name = trim(implode(' ', array_filter([$firstName, $lastName])));

        return $name !== '' ? $name : $this->contactDisplayName($contact);
    }

    private function contactDisplayName(Contact $contact): string
    {
        $name = $this->normalizeString($contact->full_name);
        if ($name !== null && strtolower($name) !== 'unnamed contact') {
            return $name;
        }

        $payload = is_array($contact->payload) ? $contact->payload : [];
        $firstName = $this->normalizeString($payload['first_name'] ?? null);
        $lastName = $this->normalizeString($payload['last_name'] ?? null);
        $company = $this->normalizeString($payload['company'] ?? null);

        $fullName = trim(implode(' ', array_filter([$firstName, $lastName])));

        if ($fullName !== '') {
            return $fullName;
        }

        if ($company !== null) {
            return $company;
        }

        return 'Contact '.$contact->id;
    }

    private function managedUri(string $type, int $contactId, ?string $suffix = null): string
    {
        $base = $this->managedUriPrefix($type).'contact-'.$contactId;
        if ($suffix !== null && $suffix !== '') {
            $base .= '-'.$suffix;
        }

        return $base.'.ics';
    }

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

    private function managedUriPrefix(string $type): string
    {
        return self::MANAGED_URI_PREFIX.$type.'-';
    }

    private function displayNameForSetting(
        AddressBook $addressBook,
        AddressBookContactMilestoneCalendar $setting,
        string $type,
    ): string {
        return $this->normalizeString($setting->custom_display_name)
            ?? $this->defaultCalendarName($addressBook, $type);
    }

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

    private function normalizeString(mixed $value): ?string
    {
        if (! is_scalar($value) && $value !== null) {
            return null;
        }

        $normalized = trim((string) ($value ?? ''));

        return $normalized === '' ? null : $normalized;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function contactExcludedFromMilestones(array $payload): bool
    {
        $value = $payload['exclude_milestone_calendars'] ?? false;

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

    private function escapeIcsText(string $value): string
    {
        return str_replace(
            ['\\', ';', ',', "\r\n", "\r", "\n"],
            ['\\\\', '\;', '\,', '\n', '\n', '\n'],
            $value,
        );
    }

    /**
     * @return array<int, string>
     */
    private function milestoneTypes(): array
    {
        return [
            AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY,
            AddressBookContactMilestoneCalendar::TYPE_ANNIVERSARY,
        ];
    }

    private function settingsKeyForType(string $type): string
    {
        return $type === AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY
            ? 'birthdays'
            : 'anniversaries';
    }

    private function enabledFieldForType(string $type): string
    {
        return $type === AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY
            ? 'birthdays_enabled'
            : 'anniversaries_enabled';
    }

    private function customNameFieldForType(string $type): string
    {
        return $type === AddressBookContactMilestoneCalendar::TYPE_BIRTHDAY
            ? 'birthday_calendar_name'
            : 'anniversary_calendar_name';
    }

    private function markMilestonePurgeControlVisible(?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'milestone_purge_control_visible'],
            ['value' => 'true', 'updated_by' => $actor?->id],
        );
    }

    private function schemaAvailable(): bool
    {
        return Schema::hasTable('address_book_contact_milestone_calendars')
            && Schema::hasTable('contacts')
            && Schema::hasTable('contact_address_book_assignments');
    }
}
