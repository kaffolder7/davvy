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
        $setting = self::query()->find('public_registration_enabled');

        if (! $setting) {
            return (bool) config('services.registration.enabled', false);
        }

        return filter_var($setting->value, FILTER_VALIDATE_BOOL);
    }
}
