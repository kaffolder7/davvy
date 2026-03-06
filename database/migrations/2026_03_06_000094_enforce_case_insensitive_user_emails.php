<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('users')) {
            return;
        }

        $duplicateEmails = DB::table('users')
            ->selectRaw('LOWER(email) as normalized_email')
            ->groupByRaw('LOWER(email)')
            ->havingRaw('COUNT(*) > 1')
            ->orderBy('normalized_email')
            ->pluck('normalized_email')
            ->map(static fn (mixed $email): string => (string) $email)
            ->take(5)
            ->all();

        if ($duplicateEmails !== []) {
            throw new RuntimeException(
                'Cannot enforce case-insensitive user email uniqueness. Resolve case-variant duplicates first: '
                .implode(', ', $duplicateEmails)
            );
        }

        DB::statement('UPDATE users SET email = LOWER(email)');

        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users ((LOWER(email)))');

            return;
        }

        if ($driver === 'sqlite') {
            DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email))');
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql' || $driver === 'sqlite') {
            DB::statement('DROP INDEX IF EXISTS users_email_lower_unique');
        }
    }
};
