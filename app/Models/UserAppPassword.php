<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserAppPassword extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'token_hash',
        'token_prefix',
        'last_used_at',
        'revoked_at',
    ];

    /**
     * Returns casts.
     */
    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /**
     * Returns user.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Checks whether it is revoked.
     */
    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }
}
