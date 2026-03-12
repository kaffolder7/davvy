<?php

namespace App\Services\Dav;

use App\Services\RegistrationSettingsService;
use DateTimeImmutable;
use Sabre\DAV\Exception\BadRequest;
use Sabre\VObject\Component;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\ParseException;
use Sabre\VObject\Reader;

class IcsValidator
{
    public function __construct(private readonly RegistrationSettingsService $settings) {}

    /**
     * Validates and normalizes the payload.
     *
     * @param  string  $calendarData
     * @return array
     */
    public function validateAndNormalize(string $calendarData): array
    {
        $strictModeEnabled = ! $this->settings->isDavCompatibilityModeEnabled();

        $component = $this->parseVCalendar($calendarData);
        $this->validateCalendarEnvelope($component, $strictModeEnabled);
        if (! $component instanceof VCalendar) {
            throw new BadRequest('Expected VCALENDAR payload.');
        }

        $primaryComponents = $this->primaryComponents($component);
        $componentType = $this->resolvePrimaryType($primaryComponents);
        $uid = $this->validatePrimaryComponents($primaryComponents, $componentType, $strictModeEnabled);

        [$firstOccurredAt, $lastOccurredAt] = $this->detectOccurrenceBounds($component);

        return [
            'data' => $component->serialize(),
            'uid' => $uid,
            'component_type' => $componentType,
            'first_occurred_at' => $firstOccurredAt,
            'last_occurred_at' => $lastOccurredAt,
        ];
    }

    /**
     * Extracts the UID.
     *
     * @param  string  $calendarData
     * @return string|null
     */
    public function extractUid(string $calendarData): ?string
    {
        try {
            $component = $this->parseVCalendar($calendarData);
        } catch (BadRequest) {
            return null;
        }

        $primaryComponents = $this->primaryComponents($component);

        if ($primaryComponents === []) {
            return null;
        }

        $uid = trim((string) ($primaryComponents[0]->UID ?? ''));

        return $uid !== '' ? $uid : null;
    }

    /**
     * @param  string  $calendarData
     * @return VCalendar
     */
    private function parseVCalendar(string $calendarData): VCalendar
    {
        try {
            $component = Reader::read($calendarData);
        } catch (ParseException|\Throwable) {
            throw new BadRequest('Invalid iCalendar payload.');
        }

        if (! $component instanceof VCalendar) {
            throw new BadRequest('Expected VCALENDAR payload.');
        }

        return $component;
    }

    /**
     * @param  VCalendar  $calendar
     * @param  bool  $strictModeEnabled
     * @return void
     */
    private function validateCalendarEnvelope(VCalendar $calendar, bool $strictModeEnabled): void
    {
        if (trim((string) ($calendar->VERSION ?? '')) !== '2.0') {
            throw new BadRequest('VCALENDAR must include VERSION:2.0.');
        }

        if (
            $strictModeEnabled
            && trim((string) ($calendar->PRODID ?? '')) === ''
        ) {
            throw new BadRequest('VCALENDAR must include PRODID.');
        }
    }

    /**
     * @return array<int, Component>
     */
    private function primaryComponents(VCalendar $calendar): array
    {
        $components = [];

        foreach (['VEVENT', 'VTODO', 'VJOURNAL'] as $type) {
            foreach ($calendar->select($type) as $component) {
                if ($component instanceof Component) {
                    $components[] = $component;
                }
            }
        }

        return $components;
    }

    /**
     * @param  array<int, Component>  $components
     */
    private function resolvePrimaryType(array $components): string
    {
        if ($components === []) {
            throw new BadRequest('Calendar payload must include VEVENT, VTODO, or VJOURNAL.');
        }

        $type = $components[0]->name;

        foreach ($components as $component) {
            if ($component->name !== $type) {
                throw new BadRequest('Mixed primary component types in one resource are not supported.');
            }
        }

        return $type;
    }

    /**
     * @param  array<int, Component>  $components
     */
    private function validatePrimaryComponents(array $components, string $componentType, bool $strictModeEnabled): ?string
    {
        $resourceUid = null;
        $recurrenceIds = [];
        $hasMasterComponent = false;

        foreach ($components as $component) {
            $uid = trim((string) ($component->UID ?? ''));

            if ($uid === '' && $strictModeEnabled) {
                throw new BadRequest('Calendar components must include UID.');
            }

            if (
                $strictModeEnabled
                && $uid !== ''
                && $resourceUid !== null
                && $resourceUid !== $uid
            ) {
                throw new BadRequest('All components in a calendar resource must share the same UID.');
            }

            if ($uid !== '') {
                $resourceUid ??= $uid;
            }

            if (
                $strictModeEnabled
                && trim((string) ($component->DTSTAMP ?? '')) === ''
            ) {
                throw new BadRequest($componentType.' components must include DTSTAMP.');
            }

            $this->validateSequence($component);
            $this->validateRRule($component, $strictModeEnabled);

            if (isset($component->{'RECURRENCE-ID'})) {
                $recurrenceId = trim((string) $component->{'RECURRENCE-ID'});

                if ($recurrenceId === '') {
                    throw new BadRequest('RECURRENCE-ID must not be empty.');
                }

                if (isset($recurrenceIds[$recurrenceId])) {
                    throw new BadRequest('Duplicate RECURRENCE-ID values are not allowed in one resource.');
                }

                $recurrenceIds[$recurrenceId] = true;
            } else {
                $hasMasterComponent = true;
            }

            if ($componentType === 'VEVENT') {
                $this->validateEventComponent($component);
            }

            if ($componentType === 'VTODO') {
                $this->validateTodoComponent($component);
            }
        }

        if (
            $strictModeEnabled
            && $recurrenceIds !== []
            && ! $hasMasterComponent
        ) {
            throw new BadRequest('Detached recurrence instances require a master component in the same resource.');
        }

        if ($strictModeEnabled && $resourceUid === null) {
            throw new BadRequest('Calendar components must include UID.');
        }

        return $resourceUid;
    }

    /**
     * @param  Component  $component
     * @return void
     */
    private function validateEventComponent(Component $component): void
    {
        if (! isset($component->DTSTART)) {
            throw new BadRequest('VEVENT components must include DTSTART.');
        }

        if (isset($component->DTEND) && isset($component->DURATION)) {
            throw new BadRequest('VEVENT cannot contain both DTEND and DURATION.');
        }

        $start = $this->safeDateTime($component->DTSTART);
        $end = $this->safeDateTime($component->DTEND ?? null);

        if ($start && $end && $end < $start) {
            throw new BadRequest('VEVENT DTEND must be greater than or equal to DTSTART.');
        }
    }

    /**
     * @param  Component  $component
     * @return void
     */
    private function validateTodoComponent(Component $component): void
    {
        if (isset($component->DUE) && isset($component->DURATION)) {
            throw new BadRequest('VTODO cannot contain both DUE and DURATION.');
        }

        if (isset($component->DURATION) && ! isset($component->DTSTART)) {
            throw new BadRequest('VTODO with DURATION must include DTSTART.');
        }
    }

    /**
     * @param  Component  $component
     * @return void
     */
    private function validateSequence(Component $component): void
    {
        if (! isset($component->SEQUENCE)) {
            return;
        }

        $sequence = trim((string) $component->SEQUENCE);

        if (! preg_match('/^\d+$/', $sequence)) {
            throw new BadRequest('SEQUENCE must be a non-negative integer.');
        }
    }

    /**
     * @param  Component  $component
     * @param  bool  $strictModeEnabled
     * @return void
     */
    private function validateRRule(Component $component, bool $strictModeEnabled): void
    {
        if (! isset($component->RRULE)) {
            return;
        }

        $parts = [];

        foreach (explode(';', (string) $component->RRULE) as $segment) {
            if ($segment === '') {
                continue;
            }

            $pair = explode('=', $segment, 2);

            if (count($pair) !== 2) {
                throw new BadRequest('RRULE segments must be key=value.');
            }

            [$key, $value] = $pair;
            $key = strtoupper(trim($key));
            $value = trim($value);

            if ($key === '' || $value === '') {
                throw new BadRequest('RRULE segments must be key=value.');
            }

            $parts[$key] = $value;
        }

        if (! isset($parts['FREQ'])) {
            throw new BadRequest('RRULE must include FREQ.');
        }

        if (
            $strictModeEnabled
            && isset($parts['COUNT'])
            && isset($parts['UNTIL'])
        ) {
            throw new BadRequest('RRULE cannot include both COUNT and UNTIL.');
        }

        if (
            $strictModeEnabled
            && isset($parts['COUNT'])
            && (! preg_match('/^\d+$/', $parts['COUNT']) || (int) $parts['COUNT'] <= 0)
        ) {
            throw new BadRequest('RRULE COUNT must be a positive integer.');
        }

        if (
            $strictModeEnabled
            && isset($parts['INTERVAL'])
            && (! preg_match('/^\d+$/', $parts['INTERVAL']) || (int) $parts['INTERVAL'] <= 0)
        ) {
            throw new BadRequest('RRULE INTERVAL must be a positive integer.');
        }
    }

    /**
     * @param  VCalendar  $calendar
     * @return array
     */
    private function detectOccurrenceBounds(VCalendar $calendar): array
    {
        $first = null;
        $last = null;

        foreach ($calendar->children() as $child) {
            if (! in_array($child->name, ['VEVENT', 'VTODO', 'VJOURNAL'], true)) {
                continue;
            }

            $start = $this->safeDateTime($child->DTSTART ?? null);
            $end = $this->safeDateTime($child->DTEND ?? ($child->DUE ?? null));

            if ($start && ($first === null || $start < $first)) {
                $first = $start;
            }

            if ($end && ($last === null || $end > $last)) {
                $last = $end;
            }

            if (! $end && $start && ($last === null || $start > $last)) {
                $last = $start;
            }
        }

        return [$first, $last];
    }

    /**
     * @param  mixed  $property
     * @return DateTimeImmutable|null
     */
    private function safeDateTime(mixed $property): ?DateTimeImmutable
    {
        if (! $property) {
            return null;
        }

        try {
            return DateTimeImmutable::createFromInterface($property->getDateTime());
        } catch (\Throwable) {
            return null;
        }
    }
}
