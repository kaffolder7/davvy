<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\User;

class RegistrationSettingsService
{
    /**
     * Checks whether public registration is enabled.
     *
     * @return bool
     */
    public function isPublicRegistrationEnabled(): bool
    {
        return AppSetting::publicRegistrationEnabled();
    }

    /**
     * Sets public registration enabled.
     *
     * @param  bool  $enabled
     * @param  User|null  $actor
     * @return void
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
     *
     * @return bool
     */
    public function isPublicRegistrationApprovalRequired(): bool
    {
        return AppSetting::publicRegistrationApprovalRequired();
    }

    /**
     * Sets public registration approval required.
     *
     * @param  bool  $enabled
     * @param  User|null  $actor
     * @return void
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
     *
     * @return bool
     */
    public function isOwnerShareManagementEnabled(): bool
    {
        return AppSetting::ownerShareManagementEnabled();
    }

    /**
     * Sets owner share management enabled.
     *
     * @param  bool  $enabled
     * @param  User|null  $actor
     * @return void
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
     *
     * @return bool
     */
    public function isDavCompatibilityModeEnabled(): bool
    {
        return AppSetting::davCompatibilityModeEnabled();
    }

    /**
     * Sets DAV compatibility mode enabled.
     *
     * @param  bool  $enabled
     * @param  User|null  $actor
     * @return void
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
     *
     * @return bool
     */
    public function isContactManagementEnabled(): bool
    {
        return AppSetting::contactManagementEnabled();
    }

    /**
     * Sets contact management enabled.
     *
     * @param  bool  $enabled
     * @param  User|null  $actor
     * @return void
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
     *
     * @return bool
     */
    public function isContactChangeModerationEnabled(): bool
    {
        return AppSetting::contactChangeModerationEnabled();
    }

    /**
     * Sets contact change moderation enabled.
     *
     * @param  bool  $enabled
     * @param  User|null  $actor
     * @return void
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
     *
     * @return int
     */
    public function contactChangeRequestRetentionDays(): int
    {
        return AppSetting::contactChangeRequestRetentionDays();
    }

    /**
     * Sets contact change request retention days.
     *
     * @param  int  $days
     * @param  User|null  $actor
     * @return void
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
     *
     * @return int
     */
    public function milestoneCalendarGenerationYears(): int
    {
        return AppSetting::milestoneCalendarGenerationYears();
    }

    /**
     * Sets milestone calendar generation years.
     *
     * @param  int  $years
     * @param  User|null  $actor
     * @return void
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
