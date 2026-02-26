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
}
