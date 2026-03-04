<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_change_requests', function (Blueprint $table): void {
            $table->id();
            $table->uuid('group_uuid');
            $table->foreignId('approval_owner_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('requester_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reviewer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('contact_id')->nullable();
            $table->string('contact_uid')->nullable();
            $table->string('contact_display_name')->nullable();
            $table->string('operation', 24);
            $table->string('status', 32);
            $table->json('scope_address_book_ids');
            $table->json('base_payload')->nullable();
            $table->json('base_address_book_ids')->nullable();
            $table->timestamp('base_contact_updated_at')->nullable();
            $table->json('proposed_payload')->nullable();
            $table->json('proposed_address_book_ids')->nullable();
            $table->json('resolved_payload')->nullable();
            $table->json('resolved_address_book_ids')->nullable();
            $table->json('applied_payload')->nullable();
            $table->json('applied_address_book_ids')->nullable();
            $table->string('request_fingerprint', 64);
            $table->string('source', 32)->default('web');
            $table->json('meta')->nullable();
            $table->text('status_reason')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('applied_at')->nullable();
            $table->timestamps();

            $table->index('group_uuid');
            $table->index(['approval_owner_id', 'status'], 'contact_change_requests_owner_status_idx');
            $table->index(['requester_id', 'status'], 'contact_change_requests_requester_status_idx');
            $table->index(['contact_id', 'status'], 'contact_change_requests_contact_status_idx');
            $table->index('request_fingerprint');
            $table->index(['group_uuid', 'status'], 'contact_change_requests_group_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_change_requests');
    }
};
