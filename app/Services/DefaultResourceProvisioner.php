<?php

namespace App\Services;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\User;
use App\Services\Dav\DavSyncService;
use Illuminate\Support\Str;

class DefaultResourceProvisioner
{
    public function __construct(private readonly DavSyncService $syncService) {}

    public function provisionFor(User $user): void
    {
        $calendar = Calendar::query()
            ->where('owner_id', $user->id)
            ->where('is_default', true)
            ->first();

        if (! $calendar) {
            $calendarUri = $this->uniqueUri(
                base: 'personal-calendar',
                exists: fn (string $uri): bool => Calendar::query()
                    ->where('owner_id', $user->id)
                    ->where('uri', $uri)
                    ->exists()
            );

            $calendar = Calendar::query()->create([
                'owner_id' => $user->id,
                'uri' => $calendarUri,
                'display_name' => config('dav.default_calendar_name', 'Personal Calendar'),
                'description' => 'Automatically created personal calendar.',
                'is_default' => true,
                'is_sharable' => false,
            ]);
        }

        $this->syncService->ensureResource(ShareResourceType::Calendar, $calendar->id);

        $addressBook = AddressBook::query()
            ->where('owner_id', $user->id)
            ->where('is_default', true)
            ->first();

        if (! $addressBook) {
            $addressBookUri = $this->uniqueUri(
                base: 'contacts',
                exists: fn (string $uri): bool => AddressBook::query()
                    ->where('owner_id', $user->id)
                    ->where('uri', $uri)
                    ->exists()
            );

            $addressBook = AddressBook::query()->create([
                'owner_id' => $user->id,
                'uri' => $addressBookUri,
                'display_name' => config('dav.default_address_book_name', 'Contacts'),
                'description' => 'Automatically created contacts address book.',
                'is_default' => true,
                'is_sharable' => false,
            ]);
        }

        $this->syncService->ensureResource(ShareResourceType::AddressBook, $addressBook->id);
    }

    private function uniqueUri(string $base, callable $exists): string
    {
        $candidate = Str::slug($base);
        $suffix = 1;

        while ($exists($candidate)) {
            $candidate = Str::slug($base).'-'.$suffix;
            $suffix++;
        }

        return $candidate;
    }
}
