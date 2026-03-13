<?php

namespace Tests\Unit;

use App\Models\AppSetting;
use App\Models\User;
use App\Services\Analytics\AnalyticsIdentityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class AnalyticsIdentityServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_distinct_id_is_scoped_by_installation(): void
    {
        Config::set('services.analytics.hash_key', 'unit-test-hash-key');

        $service = app(AnalyticsIdentityService::class);
        $user = User::factory()->create();

        AppSetting::query()->updateOrCreate(
            ['key' => 'analytics_installation_id'],
            ['value' => 'installation-alpha', 'updated_by' => null],
        );

        $alphaDistinctId = $service->distinctIdFor($user);

        AppSetting::query()->updateOrCreate(
            ['key' => 'analytics_installation_id'],
            ['value' => 'installation-beta', 'updated_by' => null],
        );

        $betaDistinctId = $service->distinctIdFor($user);

        $this->assertStringStartsWith('usr_', $alphaDistinctId);
        $this->assertStringStartsWith('usr_', $betaDistinctId);
        $this->assertNotSame($alphaDistinctId, $betaDistinctId);
    }

    public function test_actor_distinct_id_is_scoped_by_installation(): void
    {
        Config::set('services.analytics.hash_key', 'unit-test-hash-key');

        $service = app(AnalyticsIdentityService::class);

        AppSetting::query()->updateOrCreate(
            ['key' => 'analytics_installation_id'],
            ['value' => 'installation-alpha', 'updated_by' => null],
        );

        $alphaDistinctId = $service->distinctIdFor('123');

        AppSetting::query()->updateOrCreate(
            ['key' => 'analytics_installation_id'],
            ['value' => 'installation-beta', 'updated_by' => null],
        );

        $betaDistinctId = $service->distinctIdFor('123');

        $this->assertStringStartsWith('act_', $alphaDistinctId);
        $this->assertStringStartsWith('act_', $betaDistinctId);
        $this->assertNotSame($alphaDistinctId, $betaDistinctId);
    }
}
