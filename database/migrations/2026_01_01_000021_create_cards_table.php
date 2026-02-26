<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cards', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('address_book_id')->constrained('address_books')->cascadeOnDelete();
            $table->string('uri');
            $table->string('etag', 64);
            $table->unsignedInteger('size');
            $table->longText('data');
            $table->timestamps();

            $table->unique(['address_book_id', 'uri']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cards');
    }
};
