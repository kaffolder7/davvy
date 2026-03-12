<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\User;

class RegistrationSettingsService
{
    /**
     * Checks whether public registration is enabled.
     */
    public function isPublicRegistrationEnabled(): bool
    {
        return AppSetting::publicRegistrationEnabled();
    }

    /**
     * Sets public registration enabled.
     */
    public function setPublicRegistrationEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'public_registration_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );

        if (
            $enabled
            && ! AppSetting::query()->whereKey('public_registration_require_approval')->exists()
        ) {
            AppSetting::query()->updateOrCreate(
                ['key' => 'public_registration_require_approval'],
                ['value' => 'true', 'updated_by' => $actor?->id]
            );
        }
    }

    /**
     * Checks whether public registration approval is required.
     */
    public function isPublicRegistrationApprovalRequired(): bool
    {
        return AppSetting::publicRegistrationApprovalRequired();
    }

    /**
     * Sets public registration approval required.
     */
    public function setPublicRegistrationApprovalRequired(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'public_registration_require_approval'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }

    /**
     * Checks whether owner share management is enabled.
     */
    public function isOwnerShareManagementEnabled(): bool
    {
        return AppSetting::ownerShareManagementEnabled();
    }

    /**
     * Sets owner share management enabled.
     */
    public function setOwnerShareManagementEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'owner_share_management_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }

    /**
     * Checks whether DAV compatibility mode is enabled.
     */
    public function isDavCompatibilityModeEnabled(): bool
    {
        return AppSetting::davCompatibilityModeEnabled();
    }

    /**
     * Sets DAV compatibility mode enabled.
     */
    public function setDavCompatibilityModeEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'dav_compatibility_mode_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }

    /**
     * Checks whether contact management is enabled.
     */
    public function isContactManagementEnabled(): bool
    {
        return AppSetting::contactManagementEnabled();
    }

    /**
     * Sets contact management enabled.
     */
    public function setContactManagementEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'contact_management_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }

    /**
     * Checks whether contact change moderation is enabled.
     */
    public function isContactChangeModerationEnabled(): bool
    {
        return AppSetting::contactChangeModerationEnabled();
    }

    /**
     * Sets contact change moderation enabled.
     */
    public function setContactChangeModerationEnabled(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'contact_change_moderation_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id]
        );
    }

    /**
     * Returns contact change request retention days.
     */
    public function contactChangeRequestRetentionDays(): int
    {
        return AppSetting::contactChangeRequestRetentionDays();
    }

    /**
     * Sets contact change request retention days.
     */
    public function setContactChangeRequestRetentionDays(int $days, ?User $actor = null): void
    {
        $normalized = max(1, min(3650, $days));

        AppSetting::query()->updateOrCreate(
            ['key' => 'contact_change_request_retention_days'],
            ['value' => (string) $normalized, 'updated_by' => $actor?->id]
        );
    }

    /**
     * Returns milestone calendar generation years.
     */
    public function milestoneCalendarGenerationYears(): int
    {
        return AppSetting::milestoneCalendarGenerationYears();
    }

    /**
     * Sets milestone calendar generation years.
     */
    public function setMilestoneCalendarGenerationYears(int $years, ?User $actor = null): void
    {
        $normalized = max(1, min(25, $years));

        AppSetting::query()->updateOrCreate(
            ['key' => 'milestone_calendar_generation_years'],
            ['value' => (string) $normalized, 'updated_by' => $actor?->id]
        );
    }
}
