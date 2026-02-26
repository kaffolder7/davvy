<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calendars', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('uri');
            $table->string('display_name');
            $table->text('description')->nullable();
            $table->string('color', 16)->nullable();
            $table->string('timezone')->nullable();
            $table->boolean('is_default')->default(false);
            $table->boolean('is_sharable')->default(false);
            $table->timestamps();

            $table->unique(['owner_id', 'uri']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendars');
    }
};
