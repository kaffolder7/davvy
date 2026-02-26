<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('calendar_objects', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('calendar_id')->constrained('calendars')->cascadeOnDelete();
            $table->string('uri');
            $table->string('etag', 64);
            $table->unsignedInteger('size');
            $table->string('component_type', 32)->nullable();
            $table->timestamp('first_occurred_at')->nullable();
            $table->timestamp('last_occurred_at')->nullable();
            $table->longText('data');
            $table->timestamps();

            $table->unique(['calendar_id', 'uri']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_objects');
    }
};
