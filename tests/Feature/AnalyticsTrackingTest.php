<?php

namespace Tests\Feature;

use App\Jobs\CaptureAnalyticsEvent;
use App\Models\AddressBook;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;
use ZipArchive;

class AnalyticsTrackingTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<int, string> */
    private array $cleanupDirectories = [];

    protected function tearDown(): void
    {
        foreach ($this->cleanupDirectories as $directory) {
            File::deleteDirectory($directory);
        }

        parent::tearDown();
    }

    public function test_analytics_settings_endpoint_respects_toggle(): void
    {
        Config::set('services.analytics.enabled', false);
        Config::set('services.analytics.posthog_project_api_key', 'test-project-key');

        $this->getJson('/api/settings/analytics')
            ->assertOk()
            ->assertExactJson([
                'enabled' => false,
            ]);

        Config::set('services.analytics.enabled', true);
        Config::set('services.analytics.posthog_host', 'https://us.i.posthog.com');
        Config::set('services.analytics.posthog_project_api_key', 'test-project-key');

        $this->getJson('/api/settings/analytics')
            ->assertOk()
            ->assertJsonPath('enabled', true)
            ->assertJsonPath('provider', 'posthog')
            ->assertJsonPath('api_key', 'test-project-key')
            ->assertJsonPath('host', 'https://us.i.posthog.com')
            ->assertJsonStructure(['distinct_id']);
    }

    public function test_login_tracking_toggle_flips_immediately(): void
    {
        $user = User::factory()->create([
            'email' => 'analytics-login@example.test',
            'password' => 'Password123!',
            'email_verified_at' => now(),
            'is_approved' => true,
        ]);

        Queue::fake();

        Config::set('services.analytics.enabled', false);
        Config::set('services.analytics.posthog_project_api_key', 'test-project-key');

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'Password123!',
        ])->assertOk();

        Queue::assertNothingPushed();

        $this->postJson('/api/auth/logout')->assertOk();

        Config::set('services.analytics.enabled', true);
        Config::set('services.analytics.posthog_project_api_key', 'test-project-key');

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'Password123!',
        ])->assertOk();

        Queue::assertPushed(CaptureAnalyticsEvent::class, function (CaptureAnalyticsEvent $job): bool {
            return ($job->payload['event'] ?? null) === 'user_logged_in'
                && ($job->payload['properties']['auth_method'] ?? null) === 'password';
        });
    }

    public function test_admin_compatibility_mode_toggle_emits_events(): void
    {
        $this->enableAnalytics();
        Queue::fake();

        $admin = User::factory()->admin()->create([
            'email_verified_at' => now(),
        ]);

        $this->actingAs($admin)
            ->patchJson('/api/admin/settings/dav-compatibility-mode', [
                'enabled' => true,
            ])
            ->assertOk()
            ->assertJsonPath('enabled', true);

        $this->actingAs($admin)
            ->patchJson('/api/admin/settings/dav-compatibility-mode', [
                'enabled' => false,
            ])
            ->assertOk()
            ->assertJsonPath('enabled', false);

        Queue::assertPushed(CaptureAnalyticsEvent::class, function (CaptureAnalyticsEvent $job): bool {
            return ($job->payload['event'] ?? null) === 'compat_mode_enabled';
        });

        Queue::assertPushed(CaptureAnalyticsEvent::class, function (CaptureAnalyticsEvent $job): bool {
            return ($job->payload['event'] ?? null) === 'compat_mode_disabled';
        });
    }

    public function test_backup_and_restore_admin_flows_emit_expected_events(): void
    {
        $this->enableAnalytics();
        Queue::fake();

        $admin = User::factory()->admin()->create([
            'email_verified_at' => now(),
        ]);

        $backupRoot = storage_path('framework/testing/analytics-backups-'.Str::lower((string) Str::uuid()));
        $this->registerCleanupDirectory($backupRoot);

        $this->storeSettings([
            'backups_enabled' => 'true',
            'backup_local_enabled' => 'true',
            'backup_local_path' => $backupRoot,
            'backup_s3_enabled' => 'false',
            'backup_s3_disk' => 's3',
            'backup_s3_prefix' => 'davvy-backups',
            'backup_schedule_times' => json_encode(['02:30']),
            'backup_timezone' => 'UTC',
            'backup_weekly_day' => '0',
            'backup_monthly_day' => '1',
            'backup_yearly_month' => '1',
            'backup_yearly_day' => '1',
            'backup_retention_daily' => '7',
            'backup_retention_weekly' => '0',
            'backup_retention_monthly' => '0',
            'backup_retention_yearly' => '0',
        ]);

        $this->actingAs($admin)
            ->postJson('/api/admin/backups/run')
            ->assertOk()
            ->assertJsonPath('status', 'success');

        Queue::assertPushed(CaptureAnalyticsEvent::class, function (CaptureAnalyticsEvent $job): bool {
            return ($job->payload['event'] ?? null) === 'backup_started';
        });

        Queue::assertPushed(CaptureAnalyticsEvent::class, function (CaptureAnalyticsEvent $job): bool {
            return ($job->payload['event'] ?? null) === 'backup_completed';
        });

        $archivePath = $this->createMinimalRestoreArchive(ownerId: (int) $admin->id);

        $upload = UploadedFile::fake()->createWithContent(
            'restore.zip',
            (string) file_get_contents($archivePath),
        );

        $this->actingAs($admin)
            ->post('/api/admin/backups/restore', [
                'backup' => $upload,
                'mode' => 'merge',
                'dry_run' => '1',
            ])
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('dry_run', true);

        Queue::assertPushed(CaptureAnalyticsEvent::class, function (CaptureAnalyticsEvent $job): bool {
            return ($job->payload['event'] ?? null) === 'restore_started';
        });

        Queue::assertPushed(CaptureAnalyticsEvent::class, function (CaptureAnalyticsEvent $job): bool {
            return ($job->payload['event'] ?? null) === 'restore_completed';
        });
    }

    public function test_dav_sync_report_emits_success_and_failure_events(): void
    {
        $this->enableAnalytics();
        Queue::fake();

        $user = User::factory()->create([
            'email' => 'dav-sync@example.test',
            'password' => 'Password123!',
            'email_verified_at' => now(),
            'is_approved' => true,
        ]);

        $addressBook = AddressBook::query()
            ->where('owner_id', $user->id)
            ->where('uri', 'contacts')
            ->firstOrFail();

        $syncCollectionPayload = '<?xml version="1.0" encoding="utf-8"?>
            <d:sync-collection xmlns:d="DAV:">
                <d:sync-token />
                <d:sync-level>1</d:sync-level>
                <d:prop>
                    <d:getetag />
                </d:prop>
            </d:sync-collection>';

        $this->call(
            method: 'REPORT',
            uri: '/dav/addressbooks/'.$user->id.'/'.$addressBook->uri,
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':Password123!'),
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
                'HTTP_DEPTH' => '1',
            ],
            content: $syncCollectionPayload,
        )->assertStatus(207);

        $this->call(
            method: 'REPORT',
            uri: '/dav/addressbooks/'.$user->id.'/'.$addressBook->uri,
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':WrongPassword'),
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
                'HTTP_DEPTH' => '1',
            ],
            content: $syncCollectionPayload,
        )->assertStatus(403);

        Queue::assertPushed(CaptureAnalyticsEvent::class, function (CaptureAnalyticsEvent $job): bool {
            return ($job->payload['event'] ?? null) === 'dav_sync_succeeded';
        });

        Queue::assertPushed(CaptureAnalyticsEvent::class, function (CaptureAnalyticsEvent $job): bool {
            return ($job->payload['event'] ?? null) === 'dav_sync_failed';
        });
    }

    private function enableAnalytics(): void
    {
        Config::set('services.analytics.enabled', true);
        Config::set('services.analytics.posthog_host', 'https://us.i.posthog.com');
        Config::set('services.analytics.posthog_project_api_key', 'test-project-key');
        Config::set('services.analytics.hash_key', 'test-hash-secret');
    }

    /**
     * @param  array<string, string>  $settings
     */
    private function storeSettings(array $settings): void
    {
        foreach ($settings as $key => $value) {
            AppSetting::query()->updateOrCreate(
                ['key' => $key],
                ['value' => $value, 'updated_by' => null],
            );
        }
    }

    private function createMinimalRestoreArchive(int $ownerId): string
    {
        $directory = storage_path('framework/testing/analytics-restore-'.Str::lower((string) Str::uuid()));
        $this->registerCleanupDirectory($directory);
        File::ensureDirectoryExists($directory);

        $archivePath = $directory.'/restore.zip';
        $zip = new ZipArchive;
        $opened = $zip->open($archivePath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $this->assertTrue($opened === true, 'Failed to create restore archive fixture.');

        $zip->addFromString(
            sprintf('address-books/user-%d/contacts.vcf', $ownerId),
            "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Analytics Restore\r\nUID:analytics-restore-uid\r\nEND:VCARD\r\n",
        );
        $zip->close();

        return $archivePath;
    }

    private function registerCleanupDirectory(string $directory): void
    {
        $this->cleanupDirectories[] = $directory;
    }
}
