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
        'two_factor_secret',
        'two_factor_backup_codes',
        'two_factor_enabled_at',
        'is_approved',
        'approved_at',
        'approved_by',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret',
        'two_factor_backup_codes',
    ];

    /**
     * @return array
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'two_factor_secret' => 'encrypted',
            'two_factor_backup_codes' => 'array',
            'two_factor_enabled_at' => 'datetime',
            'is_approved' => 'bool',
            'approved_at' => 'datetime',
        ];
    }

    /**
     * @return Attribute
     */
    protected function email(): Attribute
    {
        return Attribute::make(
            set: static fn (mixed $value): string => Str::lower(trim((string) $value)),
        );
    }

    protected static function booted(): void
    {
        static::created(function (User $user): void {
            if ($user->is_approved !== false) {
                app(DefaultResourceProvisioner::class)->provisionFor($user);
            }
        });

        static::updated(function (User $user): void {
            if ($user->wasChanged('is_approved') && $user->is_approved) {
                app(DefaultResourceProvisioner::class)->provisionFor($user);
            }
        });
    }

    /**
     * Returns calendars.
     *
     * @return HasMany
     */
    public function calendars(): HasMany
    {
        return $this->hasMany(Calendar::class, 'owner_id');
    }

    /**
     * Returns address books.
     *
     * @return HasMany
     */
    public function addressBooks(): HasMany
    {
        return $this->hasMany(AddressBook::class, 'owner_id');
    }

    /**
     * Returns contacts.
     *
     * @return HasMany
     */
    public function contacts(): HasMany
    {
        return $this->hasMany(Contact::class, 'owner_id');
    }

    /**
     * Returns incoming shares.
     *
     * @return HasMany
     */
    public function incomingShares(): HasMany
    {
        return $this->hasMany(ResourceShare::class, 'shared_with_id');
    }

    /**
     * Returns address book mirror config.
     *
     * @return HasOne
     */
    public function addressBookMirrorConfig(): HasOne
    {
        return $this->hasOne(AddressBookMirrorConfig::class);
    }

    /**
     * Returns app passwords.
     *
     * @return HasMany
     */
    public function appPasswords(): HasMany
    {
        return $this->hasMany(UserAppPassword::class);
    }

    /**
     * Checks whether it is admin.
     *
     * @return bool
     */
    public function isAdmin(): bool
    {
        return $this->role === Role::Admin;
    }

    /**
     * Returns principal URI.
     *
     * @return string
     */
    public function principalUri(): string
    {
        return 'principals/'.$this->id;
    }

    /**
     * Checks whether two-factor authentication is enabled.
     *
     * @return bool
     */
    public function hasTwoFactorEnabled(): bool
    {
        return $this->two_factor_enabled_at !== null
            && is_string($this->two_factor_secret)
            && trim($this->two_factor_secret) !== '';
    }
}
