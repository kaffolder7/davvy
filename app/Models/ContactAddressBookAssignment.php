<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContactAddressBookAssignment extends Model
{
    use HasFactory;

    protected $fillable = [
        'contact_id',
        'address_book_id',
        'card_id',
        'card_uri',
    ];

    /**
     * Returns contact.
     */
    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    /**
     * Returns address book.
     */
    public function addressBook(): BelongsTo
    {
        return $this->belongsTo(AddressBook::class);
    }

    /**
     * Returns card.
     */
    public function card(): BelongsTo
    {
        return $this->belongsTo(Card::class);
    }
}
