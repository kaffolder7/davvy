<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Card extends Model
{
    use HasFactory;

    protected $fillable = [
        'address_book_id',
        'uri',
        'uid',
        'etag',
        'size',
        'data',
    ];

    /**
     * Returns address book.
     */
    public function addressBook(): BelongsTo
    {
        return $this->belongsTo(AddressBook::class);
    }

    /**
     * Returns contact assignment.
     */
    public function contactAssignment(): HasOne
    {
        return $this->hasOne(ContactAddressBookAssignment::class);
    }
}
