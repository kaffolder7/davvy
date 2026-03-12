<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Contact extends Model
{
    use HasFactory;

    protected $fillable = [
        'owner_id',
        'uid',
        'full_name',
        'payload',
    ];

    /**
     * Returns casts.
     *
     * @return array
     */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
        ];
    }

    /**
     * Returns owner.
     *
     * @return BelongsTo
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /**
     * Returns assignments.
     *
     * @return HasMany
     */
    public function assignments(): HasMany
    {
        return $this->hasMany(ContactAddressBookAssignment::class);
    }
}
