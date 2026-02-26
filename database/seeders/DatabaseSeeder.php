<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\AppSetting;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $adminEmail = env('DEFAULT_ADMIN_EMAIL', 'admin@davvy.local');
        $adminPassword = env('DEFAULT_ADMIN_PASSWORD', 'ChangeMe123!');

        User::query()->updateOrCreate(
            ['email' => $adminEmail],
            [
                'name' => 'Davvy Admin',
                'password' => $adminPassword,
                'role' => Role::Admin,
            ]
        );

        $settings = app(RegistrationSettingsService::class);
        $settings->setPublicRegistrationEnabled(false, null);
        $settings->setOwnerShareManagementEnabled(
            enabled: (bool) env('ENABLE_OWNER_SHARE_MANAGEMENT', true),
            actor: null
        );

        AppSetting::query()->updateOrCreate(['key' => 'public_registration_enabled'], ['value' => 'false']);
        AppSetting::query()->updateOrCreate(
            ['key' => 'owner_share_management_enabled'],
            ['value' => env('ENABLE_OWNER_SHARE_MANAGEMENT', true) ? 'true' : 'false']
        );
    }
}
