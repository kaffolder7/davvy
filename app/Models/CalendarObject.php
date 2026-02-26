<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CalendarObject extends Model
{
    use HasFactory;

    protected $fillable = [
        'calendar_id',
        'uri',
        'etag',
        'size',
        'component_type',
        'first_occurred_at',
        'last_occurred_at',
        'data',
    ];

    protected function casts(): array
    {
        return [
            'first_occurred_at' => 'datetime',
            'last_occurred_at' => 'datetime',
        ];
    }

    public function calendar(): BelongsTo
    {
        return $this->belongsTo(Calendar::class);
    }
}
