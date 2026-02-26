<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\User;

class RegistrationSettingsService
{
    public function isPublicRegistrationEnabled(): bool
    {
        return AppSetting::publicRegistrationEnabled();
    }

    public function setPublicRegistrationEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'public_registration_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }

    public function isOwnerShareManagementEnabled(): bool
    {
        return AppSetting::ownerShareManagementEnabled();
    }

    public function setOwnerShareManagementEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'owner_share_management_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }
}
