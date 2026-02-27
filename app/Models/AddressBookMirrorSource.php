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

    public function config(): BelongsTo
    {
        return $this->belongsTo(AddressBookMirrorConfig::class, 'config_id');
    }

    public function sourceAddressBook(): BelongsTo
    {
        return $this->belongsTo(AddressBook::class, 'source_address_book_id');
    }
}
