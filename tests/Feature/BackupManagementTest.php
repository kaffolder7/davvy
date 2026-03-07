<?php

namespace Tests\Feature;

use App\Models\AddressBook;
use App\Models\AppSetting;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\Card;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

class BackupManagementTest extends TestCase
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

    public function test_admin_can_read_and_update_backup_settings(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->getJson('/api/admin/settings/backups')
            ->assertOk()
            ->assertJsonPath('enabled', false)
            ->assertJsonPath('retention_daily', 7);

        $payload = [
            'enabled' => true,
            'local_enabled' => true,
            'local_path' => storage_path('app/backups'),
            's3_enabled' => true,
            's3_disk' => 's3',
            's3_prefix' => 'davvy-prod/backups',
            'schedule_times' => ['14:45', '01:15', '14:45'],
            'timezone' => 'UTC',
            'weekly_day' => 6,
            'monthly_day' => 28,
            'yearly_month' => 12,
            'yearly_day' => 31,
            'retention_daily' => 7,
            'retention_weekly' => 4,
            'retention_monthly' => 12,
            'retention_yearly' => 5,
        ];

        $response = $this->actingAs($admin)
            ->patchJson('/api/admin/settings/backups', $payload)
            ->assertOk();

        $response->assertJsonPath('enabled', true);
        $response->assertJsonPath('s3_prefix', 'davvy-prod/backups');
        $response->assertJsonPath('schedule_times.0', '01:15');
        $response->assertJsonPath('schedule_times.1', '14:45');
        $response->assertJsonPath('retention_yearly', 5);

        $this->assertDatabaseHas('app_settings', [
            'key' => 'backups_enabled',
            'value' => 'true',
        ]);
        $this->assertDatabaseHas('app_settings', [
            'key' => 'backup_weekly_day',
            'value' => '6',
        ]);
    }

    public function test_regular_user_cannot_access_backup_admin_endpoints(): void
    {
        $user = User::factory()->create();
        $upload = UploadedFile::fake()->createWithContent('restore.zip', 'not-a-real-zip');

        $this->actingAs($user)
            ->getJson('/api/admin/settings/backups')
            ->assertForbidden();

        $this->actingAs($user)
            ->patchJson('/api/admin/settings/backups', [
                'enabled' => true,
                'local_enabled' => true,
                'local_path' => storage_path('app/backups'),
                's3_enabled' => false,
                's3_disk' => 's3',
                's3_prefix' => 'davvy-backups',
                'schedule_times' => ['02:30'],
                'timezone' => 'UTC',
                'weekly_day' => 0,
                'monthly_day' => 1,
                'yearly_month' => 1,
                'yearly_day' => 1,
                'retention_daily' => 7,
                'retention_weekly' => 4,
                'retention_monthly' => 12,
                'retention_yearly' => 3,
            ])
            ->assertForbidden();

        $this->actingAs($user)
            ->postJson('/api/admin/backups/run')
            ->assertForbidden();

        $this->actingAs($user)
            ->post('/api/admin/backups/restore', [
                'backup' => $upload,
                'mode' => 'merge',
                'dry_run' => '1',
            ])
            ->assertForbidden();
    }

    public function test_admin_can_run_backup_now_and_receive_manifest_archive(): void
    {
        $admin = User::factory()->admin()->create();
        $this->seedBackupData();

        $localRoot = storage_path('framework/testing/backups-manual');
        $this->registerCleanupDirectory($localRoot);

        $this->storeBackupSettings([
            'backups_enabled' => 'true',
            'backup_local_enabled' => 'true',
            'backup_local_path' => $localRoot,
            'backup_s3_enabled' => 'false',
            'backup_schedule_times' => json_encode(['00:00']),
            'backup_timezone' => 'UTC',
            'backup_weekly_day' => '0',
            'backup_monthly_day' => '1',
            'backup_yearly_month' => '1',
            'backup_yearly_day' => '1',
            'backup_retention_daily' => '7',
            'backup_retention_weekly' => '4',
            'backup_retention_monthly' => '12',
            'backup_retention_yearly' => '3',
        ]);

        $response = $this->actingAs($admin)
            ->postJson('/api/admin/backups/run')
            ->assertOk();

        $response->assertJsonPath('status', 'success');
        $response->assertJsonPath('artifact_count', 1);
        $response->assertJsonPath('tiers.0', 'daily');

        $dailyFiles = glob($localRoot.'/daily/*.zip');
        $this->assertIsArray($dailyFiles);
        $this->assertCount(1, $dailyFiles);

        $zip = new ZipArchive;
        $opened = $zip->open((string) $dailyFiles[0]);
        $this->assertTrue($opened === true, 'Unable to open generated backup archive.');
        $this->assertNotFalse($zip->locateName('manifest.json'));
        $entryNames = [];
        for ($index = 0; $index < $zip->numFiles; $index++) {
            $name = $zip->getNameIndex($index);
            if ($name !== false) {
                $entryNames[] = $name;
            }
        }

        $this->assertTrue(
            collect($entryNames)->contains(fn (string $name): bool => str_contains($name, 'household-calendar.ics'))
        );
        $this->assertTrue(
            collect($entryNames)->contains(fn (string $name): bool => str_contains($name, 'household-contacts.vcf'))
        );
        $zip->close();
    }

    public function test_forced_backup_command_applies_daily_retention_for_local_and_remote_destinations(): void
    {
        $this->seedBackupData();

        $localRoot = storage_path('framework/testing/backups-retention-local');
        $remoteRoot = storage_path('framework/testing/backups-retention-remote');
        $this->registerCleanupDirectory($localRoot);
        $this->registerCleanupDirectory($remoteRoot);

        Config::set('filesystems.disks.backup-test', [
            'driver' => 'local',
            'root' => $remoteRoot,
            'throw' => false,
        ]);

        $this->storeBackupSettings([
            'backups_enabled' => 'true',
            'backup_local_enabled' => 'true',
            'backup_local_path' => $localRoot,
            'backup_s3_enabled' => 'true',
            'backup_s3_disk' => 'backup-test',
            'backup_s3_prefix' => 'test-backups',
            'backup_schedule_times' => json_encode(['02:30']),
            'backup_timezone' => 'UTC',
            'backup_weekly_day' => '0',
            'backup_monthly_day' => '1',
            'backup_yearly_month' => '1',
            'backup_yearly_day' => '1',
            'backup_retention_daily' => '2',
            'backup_retention_weekly' => '0',
            'backup_retention_monthly' => '0',
            'backup_retention_yearly' => '0',
        ]);

        $this->travelTo(now()->setDate(2026, 3, 1)->setTime(2, 30, 0));
        $this->artisan('app:backup --force')->assertExitCode(0);

        $this->travelTo(now()->setDate(2026, 3, 2)->setTime(2, 30, 0));
        $this->artisan('app:backup --force')->assertExitCode(0);

        $this->travelTo(now()->setDate(2026, 3, 3)->setTime(2, 30, 0));
        $this->artisan('app:backup --force')->assertExitCode(0);

        $localDailyFiles = glob($localRoot.'/daily/*.zip');
        $this->assertIsArray($localDailyFiles);
        $this->assertCount(2, $localDailyFiles);

        $remoteDailyFiles = Storage::disk('backup-test')->files('test-backups/daily');
        $this->assertCount(2, $remoteDailyFiles);
    }

    public function test_forced_backups_overwrite_same_period_snapshot_instead_of_creating_duplicates(): void
    {
        $this->seedBackupData();

        $localRoot = storage_path('framework/testing/backups-period-dedupe');
        $this->registerCleanupDirectory($localRoot);

        $this->storeBackupSettings([
            'backups_enabled' => 'true',
            'backup_local_enabled' => 'true',
            'backup_local_path' => $localRoot,
            'backup_s3_enabled' => 'false',
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

        $this->travelTo(now()->setDate(2026, 3, 7)->setTime(2, 30, 0));
        $this->artisan('app:backup --force')->assertExitCode(0);
        $this->travelTo(now()->setDate(2026, 3, 7)->setTime(2, 45, 0));
        $this->artisan('app:backup --force')->assertExitCode(0);

        $localDailyFiles = glob($localRoot.'/daily/*.zip');
        $this->assertIsArray($localDailyFiles);
        $this->assertCount(1, $localDailyFiles);
        $this->assertSame(
            'davvy-daily-2026-03-07.zip',
            basename((string) ($localDailyFiles[0] ?? '')),
        );
    }

    public function test_admin_can_restore_backup_archive_via_admin_import_endpoint(): void
    {
        $admin = User::factory()->admin()->create();
        $this->seedBackupData();

        $archivePath = $this->createBackupArchiveAt(
            directory: storage_path('framework/testing/backups-restore-endpoint'),
            date: [2026, 3, 8, 2, 30, 0],
        );

        CalendarObject::query()->delete();
        Card::query()->delete();
        Calendar::query()->delete();
        AddressBook::query()->delete();

        $this->assertDatabaseCount('calendars', 0);
        $this->assertDatabaseCount('address_books', 0);

        $upload = UploadedFile::fake()->createWithContent(
            'restore.zip',
            (string) file_get_contents($archivePath),
        );

        $this->actingAs($admin)
            ->post('/api/admin/backups/restore', [
                'backup' => $upload,
                'mode' => 'merge',
                'dry_run' => '0',
            ])
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('mode', 'merge')
            ->assertJsonPath('dry_run', false);

        $this->assertGreaterThan(0, Calendar::query()->count());
        $this->assertGreaterThan(0, AddressBook::query()->count());
        $this->assertGreaterThan(0, CalendarObject::query()->count());
        $this->assertGreaterThan(0, Card::query()->count());
    }

    public function test_backup_restore_command_supports_dry_run_then_apply(): void
    {
        $this->seedBackupData();

        $archivePath = $this->createBackupArchiveAt(
            directory: storage_path('framework/testing/backups-restore-command'),
            date: [2026, 3, 9, 2, 30, 0],
        );

        CalendarObject::query()->delete();
        Card::query()->delete();
        Calendar::query()->delete();
        AddressBook::query()->delete();

        $this->assertDatabaseCount('calendars', 0);
        $this->assertDatabaseCount('address_books', 0);

        $this->artisan('app:backup:restore', [
            'archive' => $archivePath,
            '--dry-run' => true,
        ])->assertExitCode(0);

        $this->assertDatabaseCount('calendars', 0);
        $this->assertDatabaseCount('address_books', 0);
        $this->assertDatabaseCount('calendar_objects', 0);
        $this->assertDatabaseCount('cards', 0);

        $this->artisan('app:backup:restore', [
            'archive' => $archivePath,
        ])->assertExitCode(0);

        $this->assertGreaterThan(0, Calendar::query()->count());
        $this->assertGreaterThan(0, AddressBook::query()->count());
        $this->assertGreaterThan(0, CalendarObject::query()->count());
        $this->assertGreaterThan(0, Card::query()->count());
    }

    public function test_backup_restore_keeps_same_name_collections_distinct(): void
    {
        $this->seedBackupData();

        $ownerId = Calendar::query()
            ->where('uri', 'household-calendar')
            ->value('owner_id');
        $this->assertNotNull($ownerId);
        $ownerId = (int) $ownerId;

        $secondCalendar = Calendar::factory()->create([
            'owner_id' => $ownerId,
            'display_name' => 'Household Calendar',
            'uri' => 'household-calendar-extra',
        ]);
        $secondCalendarPayload = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Tests//EN\nBEGIN:VEVENT\nUID:backup-test-event-two\nDTSTAMP:20260301T120000Z\nDTSTART:20260302T130000Z\nDTEND:20260302T140000Z\nSUMMARY:Backup Test Event Two\nEND:VEVENT\nEND:VCALENDAR";
        CalendarObject::query()->create([
            'calendar_id' => $secondCalendar->id,
            'uri' => 'backup-test-event-two.ics',
            'uid' => 'backup-test-event-two',
            'etag' => sha1($secondCalendarPayload),
            'size' => strlen($secondCalendarPayload),
            'component_type' => 'VEVENT',
            'data' => $secondCalendarPayload,
        ]);

        $secondAddressBook = AddressBook::factory()->create([
            'owner_id' => $ownerId,
            'display_name' => 'Household Contacts',
            'uri' => 'household-contacts-extra',
        ]);
        $secondCardPayload = "BEGIN:VCARD\nVERSION:4.0\nFN:Backup Contact Two\nUID:backup-contact-two\nEMAIL:backup-two@example.com\nEND:VCARD";
        Card::query()->create([
            'address_book_id' => $secondAddressBook->id,
            'uri' => 'backup-contact-two.vcf',
            'uid' => 'backup-contact-two',
            'etag' => sha1($secondCardPayload),
            'size' => strlen($secondCardPayload),
            'data' => $secondCardPayload,
        ]);

        $archivePath = $this->createBackupArchiveAt(
            directory: storage_path('framework/testing/backups-restore-same-name'),
            date: [2026, 3, 10, 2, 30, 0],
        );

        CalendarObject::query()->delete();
        Card::query()->delete();
        Calendar::query()->delete();
        AddressBook::query()->delete();

        $this->artisan('app:backup:restore', [
            'archive' => $archivePath,
        ])->assertExitCode(0);

        $this->assertSame(
            2,
            Calendar::query()->where('display_name', 'Household Calendar')->count(),
        );
        $this->assertSame(
            2,
            AddressBook::query()->where('display_name', 'Household Contacts')->count(),
        );
    }

    private function seedBackupData(): void
    {
        $owner = User::factory()->create();
        $calendar = Calendar::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Household Calendar',
            'uri' => 'household-calendar',
        ]);
        $addressBook = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'display_name' => 'Household Contacts',
            'uri' => 'household-contacts',
        ]);

        $ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Davvy//Tests//EN\nBEGIN:VEVENT\nUID:backup-test-event\nDTSTAMP:20260301T120000Z\nDTSTART:20260301T130000Z\nDTEND:20260301T140000Z\nSUMMARY:Backup Test Event\nEND:VEVENT\nEND:VCALENDAR";
        CalendarObject::query()->create([
            'calendar_id' => $calendar->id,
            'uri' => 'backup-test-event.ics',
            'uid' => 'backup-test-event',
            'etag' => sha1($ics),
            'size' => strlen($ics),
            'component_type' => 'VEVENT',
            'data' => $ics,
        ]);

        $vcard = "BEGIN:VCARD\nVERSION:4.0\nFN:Backup Contact\nUID:backup-contact\nEMAIL:backup@example.com\nEND:VCARD";
        Card::query()->create([
            'address_book_id' => $addressBook->id,
            'uri' => 'backup-contact.vcf',
            'uid' => 'backup-contact',
            'etag' => sha1($vcard),
            'size' => strlen($vcard),
            'data' => $vcard,
        ]);
    }

    /**
     * @param  array<string, string>  $pairs
     */
    private function storeBackupSettings(array $pairs): void
    {
        foreach ($pairs as $key => $value) {
            AppSetting::query()->updateOrCreate(
                ['key' => $key],
                ['value' => $value],
            );
        }
    }

    private function registerCleanupDirectory(string $directory): void
    {
        $this->cleanupDirectories[] = $directory;
        File::deleteDirectory($directory);
    }

    private function createBackupArchiveAt(string $directory, array $date): string
    {
        [$year, $month, $day, $hour, $minute, $second] = $date;
        $this->registerCleanupDirectory($directory);

        $this->storeBackupSettings([
            'backups_enabled' => 'true',
            'backup_local_enabled' => 'true',
            'backup_local_path' => $directory,
            'backup_s3_enabled' => 'false',
            'backup_schedule_times' => json_encode(['02:30']),
            'backup_timezone' => 'UTC',
            'backup_weekly_day' => '0',
            'backup_monthly_day' => '1',
            'backup_yearly_month' => '1',
            'backup_yearly_day' => '1',
            'backup_retention_daily' => '7',
            'backup_retention_weekly' => '4',
            'backup_retention_monthly' => '12',
            'backup_retention_yearly' => '3',
        ]);

        $this->travelTo(now()->setDate($year, $month, $day)->setTime($hour, $minute, $second));
        $this->artisan('app:backup --force')->assertExitCode(0);

        $files = glob($directory.'/daily/*.zip');
        $this->assertIsArray($files);
        $this->assertCount(1, $files);
        $this->assertIsString($files[0]);

        return (string) $files[0];
    }
}
