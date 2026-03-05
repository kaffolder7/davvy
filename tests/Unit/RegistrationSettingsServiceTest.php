<?php

namespace Tests\Unit;

use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegistrationSettingsServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_setting_can_be_toggled(): void
    {
        $service = app(RegistrationSettingsService::class);

        $this->assertFalse($service->isPublicRegistrationEnabled());

        $service->setPublicRegistrationEnabled(true);

        $this->assertTrue($service->isPublicRegistrationEnabled());
    }

    public function test_owner_share_management_setting_can_be_toggled(): void
    {
        $service = app(RegistrationSettingsService::class);

        $this->assertTrue($service->isOwnerShareManagementEnabled());

        $service->setOwnerShareManagementEnabled(false);

        $this->assertFalse($service->isOwnerShareManagementEnabled());
    }

    public function test_dav_compatibility_mode_setting_can_be_toggled(): void
    {
        $service = app(RegistrationSettingsService::class);

        $this->assertFalse($service->isDavCompatibilityModeEnabled());

        $service->setDavCompatibilityModeEnabled(true);

        $this->assertTrue($service->isDavCompatibilityModeEnabled());
    }

    public function test_contact_management_setting_can_be_toggled(): void
    {
        $service = app(RegistrationSettingsService::class);

        $this->assertFalse($service->isContactManagementEnabled());

        $service->setContactManagementEnabled(true);

        $this->assertTrue($service->isContactManagementEnabled());
    }

    public function test_contact_change_moderation_setting_can_be_toggled(): void
    {
        $service = app(RegistrationSettingsService::class);

        $this->assertFalse($service->isContactChangeModerationEnabled());

        $service->setContactChangeModerationEnabled(true);

        $this->assertTrue($service->isContactChangeModerationEnabled());
    }

    public function test_contact_change_request_retention_days_setting_can_be_updated(): void
    {
        $service = app(RegistrationSettingsService::class);

        $this->assertSame(90, $service->contactChangeRequestRetentionDays());

        $service->setContactChangeRequestRetentionDays(120);
        $this->assertSame(120, $service->contactChangeRequestRetentionDays());

        $service->setContactChangeRequestRetentionDays(99999);
        $this->assertSame(3650, $service->contactChangeRequestRetentionDays());
    }
}
