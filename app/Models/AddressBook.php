<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AddressBook extends Model
{
    use HasFactory;

    protected $fillable = [
        'owner_id',
        'uri',
        'display_name',
        'description',
        'is_default',
        'is_sharable',
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'is_sharable' => 'boolean',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function cards(): HasMany
    {
        return $this->hasMany(Card::class);
    }

    public function shares(): HasMany
    {
        return $this->hasMany(ResourceShare::class, 'resource_id')
            ->where('resource_type', 'address_book');
    }
}
