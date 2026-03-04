<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('address_book_contact_milestone_calendars', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('address_book_id')->constrained('address_books')->cascadeOnDelete();
            $table->string('milestone_type', 32);
            $table->boolean('enabled')->default(false);
            $table->foreignId('calendar_id')->nullable()->constrained('calendars')->nullOnDelete();
            $table->string('custom_display_name')->nullable();
            $table->timestamps();

            $table->unique(['address_book_id', 'milestone_type'], 'addr_book_contact_milestones_unique');
            $table->unique('calendar_id', 'addr_book_contact_milestones_calendar_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('address_book_contact_milestone_calendars');
    }
};
