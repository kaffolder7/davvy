<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AddressBookContactMilestoneCalendar extends Model
{
    use HasFactory;

    public const TYPE_BIRTHDAY = 'birthday';

    public const TYPE_ANNIVERSARY = 'anniversary';

    protected $fillable = [
        'address_book_id',
        'milestone_type',
        'enabled',
        'calendar_id',
        'custom_display_name',
    ];

    /**
     * Returns casts.
     *
     * @return array
     */
    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
        ];
    }

    /**
     * Returns address book.
     *
     * @return BelongsTo
     */
    public function addressBook(): BelongsTo
    {
        return $this->belongsTo(AddressBook::class);
    }

    /**
     * Returns calendar.
     *
     * @return BelongsTo
     */
    public function calendar(): BelongsTo
    {
        return $this->belongsTo(Calendar::class);
    }
}
