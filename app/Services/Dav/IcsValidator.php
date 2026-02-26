<?php

namespace App\Services\Dav;

use DateTimeImmutable;
use Sabre\DAV\Exception\BadRequest;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\ParseException;
use Sabre\VObject\Reader;

class IcsValidator
{
    public function validateAndNormalize(string $calendarData): array
    {
        try {
            $component = Reader::read($calendarData);
        } catch (ParseException|\Throwable) {
            throw new BadRequest('Invalid iCalendar payload.');
        }

        if (! $component instanceof VCalendar) {
            throw new BadRequest('Expected VCALENDAR payload.');
        }

        $componentType = $this->detectPrimaryComponentType($component);

        if (! $componentType) {
            throw new BadRequest('Calendar payload must include VEVENT, VTODO, or VJOURNAL.');
        }

        foreach ($component->children() as $child) {
            if (! in_array($child->name, ['VEVENT', 'VTODO', 'VJOURNAL'], true)) {
                continue;
            }

            if (! isset($child->UID) || trim((string) $child->UID) === '') {
                throw new BadRequest('Calendar components must include UID.');
            }
        }

        [$firstOccurredAt, $lastOccurredAt] = $this->detectOccurrenceBounds($component);

        return [
            'data' => $component->serialize(),
            'component_type' => $componentType,
            'first_occurred_at' => $firstOccurredAt,
            'last_occurred_at' => $lastOccurredAt,
        ];
    }

    private function detectPrimaryComponentType(VCalendar $calendar): ?string
    {
        foreach (['VEVENT', 'VTODO', 'VJOURNAL'] as $type) {
            if (count($calendar->select($type)) > 0) {
                return $type;
            }
        }

        return null;
    }

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
