<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calendar_objects', function (Blueprint $table): void {
            $table->string('uid')->nullable()->after('uri');
            $table->index(['calendar_id', 'uid'], 'calendar_objects_calendar_uid_idx');
        });

        Schema::table('cards', function (Blueprint $table): void {
            $table->string('uid')->nullable()->after('uri');
            $table->index(['address_book_id', 'uid'], 'cards_address_book_uid_idx');
        });
    }

    public function down(): void
    {
        Schema::table('cards', function (Blueprint $table): void {
            $table->dropIndex('cards_address_book_uid_idx');
            $table->dropColumn('uid');
        });

        Schema::table('calendar_objects', function (Blueprint $table): void {
            $table->dropIndex('calendar_objects_calendar_uid_idx');
            $table->dropColumn('uid');
        });
    }
};
