<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Calendar extends Model
{
    use HasFactory;

    protected $fillable = [
        'owner_id',
        'uri',
        'display_name',
        'description',
        'color',
        'timezone',
        'is_default',
        'is_sharable',
    ];

    /**
     * Returns casts.
     *
     * @return array
     */
    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'is_sharable' => 'boolean',
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
     * Returns objects.
     *
     * @return HasMany
     */
    public function objects(): HasMany
    {
        return $this->hasMany(CalendarObject::class);
    }

    /**
     * Returns shares.
     *
     * @return HasMany
     */
    public function shares(): HasMany
    {
        return $this->hasMany(ResourceShare::class, 'resource_id')
            ->where('resource_type', 'calendar');
    }

    /**
     * Returns milestone setting.
     *
     * @return HasOne
     */
    public function milestoneSetting(): HasOne
    {
        return $this->hasOne(AddressBookContactMilestoneCalendar::class, 'calendar_id');
    }
}
