<?php

namespace App\Models;

use App\Enums\ContactChangeOperation;
use App\Enums\ContactChangeStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContactChangeRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'group_uuid',
        'approval_owner_id',
        'requester_id',
        'reviewer_id',
        'contact_id',
        'contact_uid',
        'contact_display_name',
        'operation',
        'status',
        'scope_address_book_ids',
        'base_payload',
        'base_address_book_ids',
        'base_contact_updated_at',
        'proposed_payload',
        'proposed_address_book_ids',
        'resolved_payload',
        'resolved_address_book_ids',
        'applied_payload',
        'applied_address_book_ids',
        'request_fingerprint',
        'source',
        'meta',
        'status_reason',
        'reviewed_at',
        'applied_at',
    ];

    /**
     * @return array
     */
    protected function casts(): array
    {
        return [
            'operation' => ContactChangeOperation::class,
            'status' => ContactChangeStatus::class,
            'scope_address_book_ids' => 'array',
            'base_payload' => 'array',
            'base_address_book_ids' => 'array',
            'base_contact_updated_at' => 'datetime',
            'proposed_payload' => 'array',
            'proposed_address_book_ids' => 'array',
            'resolved_payload' => 'array',
            'resolved_address_book_ids' => 'array',
            'applied_payload' => 'array',
            'applied_address_book_ids' => 'array',
            'meta' => 'array',
            'reviewed_at' => 'datetime',
            'applied_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo
     */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    /**
     * @return BelongsTo
     */
    public function approvalOwner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approval_owner_id');
    }

    /**
     * @return BelongsTo
     */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }
}
