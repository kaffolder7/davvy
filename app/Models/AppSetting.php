<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    public $incrementing = false;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $fillable = [
        'key',
        'value',
        'updated_by',
    ];

    public static function publicRegistrationEnabled(): bool
    {
        return self::booleanSetting(
            key: 'public_registration_enabled',
            default: (bool) config('services.registration.enabled', false),
        );
    }

    public static function ownerShareManagementEnabled(): bool
    {
        return self::booleanSetting(
            key: 'owner_share_management_enabled',
            default: (bool) config('services.sharing.owner_management_enabled', true),
        );
    }

    public static function davCompatibilityModeEnabled(): bool
    {
        return self::booleanSetting(
            key: 'dav_compatibility_mode_enabled',
            default: (bool) config('services.dav.compatibility_mode_enabled', false),
        );
    }

    public static function contactManagementEnabled(): bool
    {
        return self::booleanSetting(
            key: 'contact_management_enabled',
            default: (bool) config('services.contacts.management_enabled', false),
        );
    }

    public static function contactChangeRequestRetentionDays(): int
    {
        return self::integerSetting(
            key: 'contact_change_request_retention_days',
            default: (int) config('services.contacts.change_request_retention_days', 90),
            min: 1,
            max: 3650,
        );
    }

    private static function booleanSetting(string $key, bool $default): bool
    {
        $setting = self::query()->find($key);

        if (! $setting) {
            return $default;
        }

        return filter_var($setting->value, FILTER_VALIDATE_BOOL);
    }

    private static function integerSetting(string $key, int $default, int $min, int $max): int
    {
        $setting = self::query()->find($key);
        if (! $setting) {
            return $default;
        }

        $value = filter_var($setting->value, FILTER_VALIDATE_INT);
        if ($value === false) {
            return $default;
        }

        return max($min, min($max, $value));
    }
}
