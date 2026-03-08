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

    public function isDavCompatibilityModeEnabled(): bool
    {
        return AppSetting::davCompatibilityModeEnabled();
    }

    public function setDavCompatibilityModeEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'dav_compatibility_mode_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }

    public function isContactManagementEnabled(): bool
    {
        return AppSetting::contactManagementEnabled();
    }

    public function setContactManagementEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'contact_management_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }

    public function isContactChangeModerationEnabled(): bool
    {
        return AppSetting::contactChangeModerationEnabled();
    }

    public function setContactChangeModerationEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'contact_change_moderation_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }

    public function contactChangeRequestRetentionDays(): int
    {
        return AppSetting::contactChangeRequestRetentionDays();
    }

    public function setContactChangeRequestRetentionDays(int $days, ?User $actor = null): void
    {
        $normalized = max(1, min(3650, $days));

        AppSetting::query()->updateOrCreate(
            ['key' => 'contact_change_request_retention_days'],
            ['value' => (string) $normalized, 'updated_by' => $actor?->id]
        );
    }

    public function milestoneCalendarGenerationYears(): int
    {
        return AppSetting::milestoneCalendarGenerationYears();
    }

    public function setMilestoneCalendarGenerationYears(int $years, ?User $actor = null): void
    {
        $normalized = max(1, min(25, $years));

        AppSetting::query()->updateOrCreate(
            ['key' => 'milestone_calendar_generation_years'],
            ['value' => (string) $normalized, 'updated_by' => $actor?->id]
        );
    }
}
