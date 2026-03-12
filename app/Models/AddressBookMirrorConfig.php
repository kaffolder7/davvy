<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AddressBookMirrorConfig extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'enabled',
    ];

    /**
     * Returns casts.
     */
    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
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
     * Returns sources.
     */
    public function sources(): HasMany
    {
        return $this->hasMany(AddressBookMirrorSource::class, 'config_id');
    }
}
