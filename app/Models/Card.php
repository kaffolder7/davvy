<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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

    public function addressBook(): BelongsTo
    {
        return $this->belongsTo(AddressBook::class);
    }
}
