<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('calendar_objects') || ! Schema::hasTable('cards')) {
            return;
        }

        DB::statement("UPDATE calendar_objects SET uid = NULL WHERE uid = ''");
        DB::statement("UPDATE cards SET uid = NULL WHERE uid = ''");

        $calendarDuplicates = DB::table('calendar_objects')
            ->selectRaw('calendar_id, uid, COUNT(*) as duplicate_count')
            ->whereNotNull('uid')
            ->groupBy('calendar_id', 'uid')
            ->havingRaw('COUNT(*) > 1')
            ->orderBy('calendar_id')
            ->orderBy('uid')
            ->limit(5)
            ->get();

        if ($calendarDuplicates->isNotEmpty()) {
            $examples = $calendarDuplicates
                ->map(static fn (object $row): string => sprintf(
                    'calendar_id=%d uid=%s count=%d',
                    (int) $row->calendar_id,
                    (string) $row->uid,
                    (int) $row->duplicate_count,
                ))
                ->implode('; ');

            throw new RuntimeException(
                'Cannot enforce UID uniqueness for calendar objects. Resolve duplicate UIDs first: '.$examples
            );
        }

        $cardDuplicates = DB::table('cards')
            ->selectRaw('address_book_id, uid, COUNT(*) as duplicate_count')
            ->whereNotNull('uid')
            ->groupBy('address_book_id', 'uid')
            ->havingRaw('COUNT(*) > 1')
            ->orderBy('address_book_id')
            ->orderBy('uid')
            ->limit(5)
            ->get();

        if ($cardDuplicates->isNotEmpty()) {
            $examples = $cardDuplicates
                ->map(static fn (object $row): string => sprintf(
                    'address_book_id=%d uid=%s count=%d',
                    (int) $row->address_book_id,
                    (string) $row->uid,
                    (int) $row->duplicate_count,
                ))
                ->implode('; ');

            throw new RuntimeException(
                'Cannot enforce UID uniqueness for cards. Resolve duplicate UIDs first: '.$examples
            );
        }

        $driver = DB::getDriverName();

        if ($driver === 'pgsql' || $driver === 'sqlite') {
            DB::statement('DROP INDEX IF EXISTS calendar_objects_calendar_uid_idx');
            DB::statement('DROP INDEX IF EXISTS cards_address_book_uid_idx');

            DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS calendar_objects_calendar_uid_unique ON calendar_objects (calendar_id, uid) WHERE uid IS NOT NULL');
            DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS cards_address_book_uid_unique ON cards (address_book_id, uid) WHERE uid IS NOT NULL');
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('calendar_objects') || ! Schema::hasTable('cards')) {
            return;
        }

        $driver = DB::getDriverName();

        if ($driver === 'pgsql' || $driver === 'sqlite') {
            DB::statement('DROP INDEX IF EXISTS calendar_objects_calendar_uid_unique');
            DB::statement('DROP INDEX IF EXISTS cards_address_book_uid_unique');

            DB::statement('CREATE INDEX IF NOT EXISTS calendar_objects_calendar_uid_idx ON calendar_objects (calendar_id, uid)');
            DB::statement('CREATE INDEX IF NOT EXISTS cards_address_book_uid_idx ON cards (address_book_id, uid)');
        }
    }
};
