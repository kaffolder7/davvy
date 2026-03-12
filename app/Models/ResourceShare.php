<?php

namespace App\Models;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResourceShare extends Model
{
    use HasFactory;

    protected $fillable = [
        'resource_type',
        'resource_id',
        'owner_id',
        'shared_with_id',
        'permission',
    ];

    /**
     * @return array
     */
    protected function casts(): array
    {
        return [
            'resource_type' => ShareResourceType::class,
            'permission' => SharePermission::class,
        ];
    }

    /**
     * @return BelongsTo
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /**
     * @return BelongsTo
     */
    public function sharedWith(): BelongsTo
    {
        return $this->belongsTo(User::class, 'shared_with_id');
    }

    /**
     * @return BelongsTo
     */
    public function calendar(): BelongsTo
    {
        return $this->belongsTo(Calendar::class, 'resource_id');
    }

    /**
     * @return BelongsTo
     */
    public function addressBook(): BelongsTo
    {
        return $this->belongsTo(AddressBook::class, 'resource_id');
    }
}
