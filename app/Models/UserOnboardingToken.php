<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stores one-time invite and email verification tokens for user onboarding flows.
 */
class UserOnboardingToken extends Model
{
    protected $fillable = [
        'user_id',
        'purpose',
        'token_hash',
        'expires_at',
        'used_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
        ];
    }

    /**
     * Returns the user that owns this onboarding token.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
