<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('dav_resource_sync_states')
            ->where('sync_token', '<', 1)
            ->update([
                'sync_token' => 1,
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        // Intentionally left as a no-op to avoid mutating valid sync history.
    }
};
