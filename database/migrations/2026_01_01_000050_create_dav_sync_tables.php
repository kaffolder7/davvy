<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dav_resource_sync_states', function (Blueprint $table): void {
            $table->id();
            $table->string('resource_type');
            $table->unsignedBigInteger('resource_id');
            $table->unsignedBigInteger('sync_token')->default(0);
            $table->timestamps();

            $table->unique(['resource_type', 'resource_id'], 'dav_sync_state_unique');
            $table->index(['resource_type', 'resource_id']);
        });

        Schema::create('dav_resource_sync_changes', function (Blueprint $table): void {
            $table->id();
            $table->string('resource_type');
            $table->unsignedBigInteger('resource_id');
            $table->unsignedBigInteger('sync_token');
            $table->string('operation', 16);
            $table->string('uri');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['resource_type', 'resource_id', 'sync_token'], 'dav_sync_changes_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dav_resource_sync_changes');
        Schema::dropIfExists('dav_resource_sync_states');
    }
};
