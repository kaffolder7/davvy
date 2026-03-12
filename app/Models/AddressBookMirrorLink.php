<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AddressBookMirrorLink extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'source_address_book_id',
        'source_card_uri',
        'mirrored_address_book_id',
        'mirrored_card_id',
    ];

    /**
     * Returns user.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Returns mirrored address book.
     */
    public function mirroredAddressBook(): BelongsTo
    {
        return $this->belongsTo(AddressBook::class, 'mirrored_address_book_id');
    }

    /**
     * Returns mirrored card.
     */
    public function mirroredCard(): BelongsTo
    {
        return $this->belongsTo(Card::class, 'mirrored_card_id');
    }
}
