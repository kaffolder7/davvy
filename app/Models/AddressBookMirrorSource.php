<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AddressBookMirrorSource extends Model
{
    use HasFactory;

    protected $fillable = [
        'config_id',
        'source_address_book_id',
    ];

    /**
     * Returns the current configuration.
     *
     * @return BelongsTo
     */
    public function config(): BelongsTo
    {
        return $this->belongsTo(AddressBookMirrorConfig::class, 'config_id');
    }

    /**
     * Returns source address book.
     *
     * @return BelongsTo
     */
    public function sourceAddressBook(): BelongsTo
    {
        return $this->belongsTo(AddressBook::class, 'source_address_book_id');
    }
}
