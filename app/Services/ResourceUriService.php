<?php

namespace App\Services;

use App\Models\AddressBook;
use App\Models\Calendar;
use Illuminate\Support\Str;

class ResourceUriService
{
    /**
     * Returns the next available calendar URI for an owner.
     */
    public function nextCalendarUri(int $ownerId, ?string $candidate, string $fallback = 'calendar'): string
    {
        return $this->nextUniqueUri(
            candidate: $candidate,
            fallback: $fallback,
            exists: fn (string $uri): bool => Calendar::query()
                ->where('owner_id', $ownerId)
                ->where('uri', $uri)
                ->exists(),
        );
    }

    /**
     * Returns the next available address-book URI for an owner.
     */
    public function nextAddressBookUri(int $ownerId, ?string $candidate, string $fallback = 'address-book'): string
    {
        return $this->nextUniqueUri(
            candidate: $candidate,
            fallback: $fallback,
            exists: fn (string $uri): bool => AddressBook::query()
                ->where('owner_id', $ownerId)
                ->where('uri', $uri)
                ->exists(),
        );
    }

    /**
     * Returns next unique URI using an owner-scoped existence callback.
     */
    private function nextUniqueUri(?string $candidate, string $fallback, callable $exists): string
    {
        $candidateSeed = Str::slug((string) $candidate);
        $fallbackSeed = Str::slug($fallback);

        $seed = $candidateSeed !== ''
            ? $candidateSeed
            : ($fallbackSeed !== '' ? $fallbackSeed : 'resource');

        $uri = $seed;
        $suffix = 1;

        while ($exists($uri)) {
            $uri = $seed.'-'.$suffix;
            $suffix++;
        }

        return $uri;
    }
}
