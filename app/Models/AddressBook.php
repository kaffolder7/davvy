<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

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

    public function contactAssignments(): HasMany
    {
        return $this->hasMany(ContactAddressBookAssignment::class);
    }

    public function milestoneCalendars(): HasMany
    {
        return $this->hasMany(AddressBookContactMilestoneCalendar::class);
    }

    public function contacts(): HasManyThrough
    {
        return $this->hasManyThrough(
            Contact::class,
            ContactAddressBookAssignment::class,
            'address_book_id',
            'id',
            'id',
            'contact_id',
        );
    }

    public function shares(): HasMany
    {
        return $this->hasMany(ResourceShare::class, 'resource_id')
            ->where('resource_type', 'address_book');
    }
}
