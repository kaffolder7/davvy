<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_address_book_assignments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('contact_id')->constrained('contacts')->cascadeOnDelete();
            $table->foreignId('address_book_id')->constrained('address_books')->cascadeOnDelete();
            $table->foreignId('card_id')->nullable()->constrained('cards')->nullOnDelete();
            $table->string('card_uri');
            $table->timestamps();

            $table->unique(['contact_id', 'address_book_id'], 'contact_address_book_unique');
            $table->unique('card_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_address_book_assignments');
    }
};
