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

        app(RegistrationSettingsService::class)->setPublicRegistrationEnabled(false, null);

        AppSetting::query()->updateOrCreate(
            ['key' => 'public_registration_enabled'],
            ['value' => 'false']
        );
    }
}
