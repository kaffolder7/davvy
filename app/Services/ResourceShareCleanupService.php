<?php

namespace App\Services;

use App\Enums\ShareResourceType;
use App\Models\ResourceShare;

class ResourceShareCleanupService
{
    public function deleteAddressBookShares(int|array $addressBookIds): void
    {
        $ids = $this->normalizeIds($addressBookIds);

        if ($ids === []) {
            return;
        }

        ResourceShare::query()
            ->where('resource_type', ShareResourceType::AddressBook->value)
            ->whereIn('resource_id', $ids)
            ->delete();
    }

    public function deleteCalendarShares(int|array $calendarIds): void
    {
        $ids = $this->normalizeIds($calendarIds);

        if ($ids === []) {
            return;
        }

        ResourceShare::query()
            ->where('resource_type', ShareResourceType::Calendar->value)
            ->whereIn('resource_id', $ids)
            ->delete();
    }

    /**
     * @return array<int, int>
     */
    private function normalizeIds(int|array $ids): array
    {
        $values = is_array($ids) ? $ids : [$ids];
        $normalized = [];

        foreach ($values as $value) {
            $id = (int) $value;

            if ($id > 0) {
                $normalized[$id] = true;
            }
        }

        return array_keys($normalized);
    }
}
