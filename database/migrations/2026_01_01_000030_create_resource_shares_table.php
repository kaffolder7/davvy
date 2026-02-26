<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('resource_shares', function (Blueprint $table): void {
            $table->id();
            $table->string('resource_type');
            $table->unsignedBigInteger('resource_id');
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('shared_with_id')->constrained('users')->cascadeOnDelete();
            $table->string('permission');
            $table->timestamps();

            $table->unique(['resource_type', 'resource_id', 'shared_with_id'], 'resource_share_unique');
            $table->index(['shared_with_id', 'resource_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('resource_shares');
    }
};
