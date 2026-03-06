<?php

namespace App\Models;

use App\Enums\Role;
use App\Services\DefaultResourceProvisioner;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

class User extends Authenticatable
{
    use HasFactory;
    use Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
        ];
    }

    protected function email(): Attribute
    {
        return Attribute::make(
            set: static fn (mixed $value): string => Str::lower(trim((string) $value)),
        );
    }

    protected static function booted(): void
    {
        static::created(function (User $user): void {
            app(DefaultResourceProvisioner::class)->provisionFor($user);
        });
    }

    public function calendars(): HasMany
    {
        return $this->hasMany(Calendar::class, 'owner_id');
    }

    public function addressBooks(): HasMany
    {
        return $this->hasMany(AddressBook::class, 'owner_id');
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(Contact::class, 'owner_id');
    }

    public function incomingShares(): HasMany
    {
        return $this->hasMany(ResourceShare::class, 'shared_with_id');
    }

    public function addressBookMirrorConfig(): HasOne
    {
        return $this->hasOne(AddressBookMirrorConfig::class);
    }

    public function isAdmin(): bool
    {
        return $this->role === Role::Admin;
    }

    public function principalUri(): string
    {
        return 'principals/'.$this->id;
    }
}
