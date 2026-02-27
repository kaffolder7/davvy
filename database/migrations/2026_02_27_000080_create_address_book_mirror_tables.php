<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('address_book_mirror_configs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('enabled')->default(false);
            $table->timestamps();

            $table->unique('user_id');
        });

        Schema::create('address_book_mirror_sources', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('config_id')
                ->constrained('address_book_mirror_configs')
                ->cascadeOnDelete();
            $table->foreignId('source_address_book_id')
                ->constrained('address_books')
                ->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['config_id', 'source_address_book_id'], 'addr_book_mirror_sources_unique');
        });

        Schema::create('address_book_mirror_links', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('source_address_book_id');
            $table->string('source_card_uri');
            $table->foreignId('mirrored_address_book_id')
                ->constrained('address_books')
                ->cascadeOnDelete();
            $table->foreignId('mirrored_card_id')
                ->constrained('cards')
                ->cascadeOnDelete();
            $table->timestamps();

            $table->unique(
                ['user_id', 'source_address_book_id', 'source_card_uri'],
                'addr_book_mirror_links_source_unique'
            );
            $table->unique('mirrored_card_id');
            $table->index(['source_address_book_id', 'source_card_uri'], 'addr_book_mirror_links_source_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('address_book_mirror_links');
        Schema::dropIfExists('address_book_mirror_sources');
        Schema::dropIfExists('address_book_mirror_configs');
    }
};

