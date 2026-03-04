<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contacts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('uid');
            $table->string('full_name')->nullable();
            $table->json('payload');
            $table->timestamps();

            $table->unique(['owner_id', 'uid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contacts');
    }
};
