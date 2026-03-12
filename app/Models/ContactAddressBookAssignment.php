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
     * @return BelongsTo
     */
    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    /**
     * @return BelongsTo
     */
    public function addressBook(): BelongsTo
    {
        return $this->belongsTo(AddressBook::class);
    }

    /**
     * @return BelongsTo
     */
    public function card(): BelongsTo
    {
        return $this->belongsTo(Card::class);
    }
}
