<?php

namespace App\Services\Backups;

use App\Models\AddressBook;
use App\Models\Calendar;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Sabre\VObject\Component;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;
use Throwable;
use ZipArchive;

class BackupService
{
    public function __construct(private readonly BackupSettingsService $settingsService) {}

    /**
     * @return array{
     *   status: 'success'|'skipped'|'failed',
     *   trigger: string,
     *   reason: string,
     *   timezone: string,
     *   executed_at_utc: string,
     *   executed_at_local: string,
     *   tiers: array<int, string>,
     *   artifact_count: int,
     *   artifacts: array<int, array{tier:string,period:string,file_name:string,local_path:?string,s3_path:?string}>,
     *   resource_counts: array{calendars:int,address_books:int,calendar_objects:int,cards:int}
     * }
     */
    public function run(bool $force = false, string $trigger = 'scheduled'): array
    {
        $settings = $this->settingsService->current();
        $nowUtc = CarbonImmutable::now('UTC');
        $nowLocal = $nowUtc->setTimezone($settings['timezone']);

        if (! $force && ! $settings['enabled']) {
            return $this->skipResult(
                trigger: $trigger,
                reason: 'Backups are disabled.',
                nowUtc: $nowUtc,
                nowLocal: $nowLocal,
                timezone: $settings['timezone'],
                code: 'disabled',
            );
        }

        if (! $force && ! $this->isDueForSchedule($nowLocal, $settings['schedule_times'])) {
            return $this->skipResult(
                trigger: $trigger,
                reason: 'No backup window matches the current schedule minute.',
                nowUtc: $nowUtc,
                nowLocal: $nowLocal,
                timezone: $settings['timezone'],
                code: 'not_due',
            );
        }

        if (! $settings['local_enabled'] && ! $settings['s3_enabled']) {
            $result = $this->failedResult(
                trigger: $trigger,
                reason: 'No backup destinations are enabled.',
                nowUtc: $nowUtc,
                nowLocal: $nowLocal,
                timezone: $settings['timezone'],
            );
            $this->settingsService->recordRun('failed', $result['reason'], $nowUtc);

            return $result;
        }

        $lock = Cache::lock('davvy-backup-run', 900);
        if (! $lock->get()) {
            return $this->skipResult(
                trigger: $trigger,
                reason: 'A backup run is already in progress.',
                nowUtc: $nowUtc,
                nowLocal: $nowLocal,
                timezone: $settings['timezone'],
                code: 'in_progress',
            );
        }

        $archivePath = null;

        try {
            $tiers = $this->dueTiers($nowLocal, $settings);
            if ($tiers === []) {
                $result = $this->skipResult(
                    trigger: $trigger,
                    reason: 'No backup tiers are currently due based on retention strategy.',
                    nowUtc: $nowUtc,
                    nowLocal: $nowLocal,
                    timezone: $settings['timezone'],
                    code: 'no_tiers_due',
                );
                $this->settingsService->recordRun('skipped', $result['reason'], $nowUtc);

                return $result;
            }

            if (! $force) {
                $tiers = collect($tiers)
                    ->reject(fn (string $period, string $tier): bool => $this->settingsService->wasPeriodCaptured($tier, $period))
                    ->all();
            }

            if ($tiers === []) {
                $result = $this->skipResult(
                    trigger: $trigger,
                    reason: 'All due backup periods were already captured.',
                    nowUtc: $nowUtc,
                    nowLocal: $nowLocal,
                    timezone: $settings['timezone'],
                    code: 'already_captured',
                );
                $this->settingsService->recordRun('skipped', $result['reason'], $nowUtc);

                return $result;
            }

            [$archivePath, $resourceCounts] = $this->buildArchive(
                trigger: $trigger,
                nowUtc: $nowUtc,
                nowLocal: $nowLocal,
                timezone: $settings['timezone'],
                tiers: array_keys($tiers),
            );

            $artifacts = [];
            foreach ($tiers as $tier => $period) {
                $artifact = $this->storeTierSnapshot(
                    archivePath: $archivePath,
                    tier: $tier,
                    period: $period,
                    settings: $settings,
                );

                $artifacts[] = $artifact;
                $this->settingsService->markPeriodCaptured($tier, $period);
            }

            $this->pruneByRetention($settings);

            $result = [
                'status' => 'success',
                'trigger' => $trigger,
                'reason' => sprintf(
                    'Created %d backup snapshot(s) for tier(s): %s.',
                    count($artifacts),
                    implode(', ', array_keys($tiers))
                ),
                'timezone' => $settings['timezone'],
                'executed_at_utc' => $nowUtc->toIso8601String(),
                'executed_at_local' => $nowLocal->toIso8601String(),
                'tiers' => array_keys($tiers),
                'artifact_count' => count($artifacts),
                'artifacts' => $artifacts,
                'resource_counts' => $resourceCounts,
            ];

            $this->settingsService->recordRun('success', $result['reason'], $nowUtc);

            return $result;
        } catch (Throwable $throwable) {
            report($throwable);

            $result = $this->failedResult(
                trigger: $trigger,
                reason: 'Backup failed: '.$throwable->getMessage(),
                nowUtc: $nowUtc,
                nowLocal: $nowLocal,
                timezone: $settings['timezone'],
            );

            $this->settingsService->recordRun('failed', $result['reason'], $nowUtc);

            return $result;
        } finally {
            if (is_string($archivePath) && is_file($archivePath)) {
                @unlink($archivePath);
            }

            $lock->release();
        }
    }

    /**
     * @param  array<int, string>  $scheduleTimes
     */
    private function isDueForSchedule(CarbonImmutable $nowLocal, array $scheduleTimes): bool
    {
        $current = $nowLocal->format('H:i');

        return in_array($current, $scheduleTimes, true);
    }

    /**
     * @param  array{
     *   retention_daily:int,
     *   retention_weekly:int,
     *   retention_monthly:int,
     *   retention_yearly:int,
     *   weekly_day:int,
     *   monthly_day:int,
     *   yearly_month:int,
     *   yearly_day:int
     * } $settings
     * @return array<string, string>
     */
    private function dueTiers(CarbonImmutable $nowLocal, array $settings): array
    {
        $tiers = [];

        if ((int) $settings['retention_daily'] > 0) {
            $tiers['daily'] = $nowLocal->format('Y-m-d');
        }

        if ((int) $settings['retention_weekly'] > 0 && $nowLocal->dayOfWeek === (int) $settings['weekly_day']) {
            $tiers['weekly'] = $nowLocal->format('o-\WW');
        }

        $monthlyAnchor = min((int) $settings['monthly_day'], $nowLocal->daysInMonth);
        if ((int) $settings['retention_monthly'] > 0 && $nowLocal->day === $monthlyAnchor) {
            $tiers['monthly'] = $nowLocal->format('Y-m');
        }

        $yearlyMonth = (int) $settings['yearly_month'];
        $yearlyDay = (int) $settings['yearly_day'];
        $yearlyAnchor = min($yearlyDay, CarbonImmutable::create($nowLocal->year, $yearlyMonth, 1, 0, 0, 0, $nowLocal->timezone)->daysInMonth);
        if (
            (int) $settings['retention_yearly'] > 0
            && $nowLocal->month === $yearlyMonth
            && $nowLocal->day === $yearlyAnchor
        ) {
            $tiers['yearly'] = $nowLocal->format('Y');
        }

        return $tiers;
    }

    /**
     * @param  array<int, string>  $tiers
     * @return array{0:string,1:array{calendars:int,address_books:int,calendar_objects:int,cards:int}}
     */
    private function buildArchive(
        string $trigger,
        CarbonImmutable $nowUtc,
        CarbonImmutable $nowLocal,
        string $timezone,
        array $tiers,
    ): array {
        $tmpPath = tempnam(sys_get_temp_dir(), 'davvy-backup-');

        if ($tmpPath === false) {
            throw new RuntimeException('Unable to create temporary backup archive.');
        }

        $zip = new ZipArchive;
        $opened = $zip->open($tmpPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        if ($opened !== true) {
            @unlink($tmpPath);
            throw new RuntimeException('Unable to open backup archive for writing.');
        }

        $calendarCount = 0;
        $addressBookCount = 0;
        $calendarObjectCount = 0;
        $cardCount = 0;
        $calendarCollections = [];
        $addressBookCollections = [];

        $calendars = Calendar::query()
            ->with([
                'owner:id,email',
                'objects' => fn ($query) => $query->orderBy('id'),
            ])
            ->orderBy('owner_id')
            ->orderBy('id')
            ->get();

        foreach ($calendars as $calendar) {
            $calendarCount++;
            $calendarObjectCount += $calendar->objects->count();

            $entryPath = sprintf(
                'calendars/user-%d/%d-%s',
                (int) $calendar->owner_id,
                (int) $calendar->id,
                $this->resourceFileName(
                    displayName: (string) $calendar->display_name,
                    fallbackStem: 'calendar',
                    extension: 'ics',
                ),
            );

            $zip->addFromString($entryPath, $this->buildCalendarPayload($calendar));
            $calendarCollections[] = [
                'archive_path' => $entryPath,
                'owner_id' => (int) $calendar->owner_id,
                'id' => (int) $calendar->id,
                'uri' => (string) $calendar->uri,
                'display_name' => (string) $calendar->display_name,
            ];
        }

        if ($calendarCount === 0) {
            $zip->addFromString('calendars/README.txt', "No calendar data was available.\n");
        }

        $addressBooks = AddressBook::query()
            ->with([
                'owner:id,email',
                'cards' => fn ($query) => $query->orderBy('id'),
            ])
            ->orderBy('owner_id')
            ->orderBy('id')
            ->get();

        foreach ($addressBooks as $addressBook) {
            $addressBookCount++;
            $cardCount += $addressBook->cards->count();

            $entryPath = sprintf(
                'address-books/user-%d/%d-%s',
                (int) $addressBook->owner_id,
                (int) $addressBook->id,
                $this->resourceFileName(
                    displayName: (string) $addressBook->display_name,
                    fallbackStem: 'address-book',
                    extension: 'vcf',
                ),
            );

            $zip->addFromString($entryPath, $this->buildAddressBookPayload($addressBook));
            $addressBookCollections[] = [
                'archive_path' => $entryPath,
                'owner_id' => (int) $addressBook->owner_id,
                'id' => (int) $addressBook->id,
                'uri' => (string) $addressBook->uri,
                'display_name' => (string) $addressBook->display_name,
            ];
        }

        if ($addressBookCount === 0) {
            $zip->addFromString('address-books/README.txt', "No address-book data was available.\n");
        }

        $manifest = [
            'schema_version' => 1,
            'trigger' => $trigger,
            'tiers' => $tiers,
            'created_at_utc' => $nowUtc->toIso8601String(),
            'created_at_local' => $nowLocal->toIso8601String(),
            'timezone' => $timezone,
            'application' => [
                'name' => config('app.name', 'Davvy'),
                'url' => config('app.url', ''),
            ],
            'counts' => [
                'calendars' => $calendarCount,
                'address_books' => $addressBookCount,
                'calendar_objects' => $calendarObjectCount,
                'cards' => $cardCount,
            ],
            'collections' => [
                'calendars' => $calendarCollections,
                'address_books' => $addressBookCollections,
            ],
        ];

        $manifestPayload = json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        $zip->addFromString(
            'manifest.json',
            is_string($manifestPayload) ? $manifestPayload : "{}\n",
        );

        $zip->close();

        return [
            $tmpPath,
            [
                'calendars' => $calendarCount,
                'address_books' => $addressBookCount,
                'calendar_objects' => $calendarObjectCount,
                'cards' => $cardCount,
            ],
        ];
    }

    /**
     * @param  array{
     *   local_enabled: bool,
     *   local_path: string,
     *   s3_enabled: bool,
     *   s3_disk: string,
     *   s3_prefix: string
     * } $settings
     * @return array{tier:string,period:string,file_name:string,local_path:?string,s3_path:?string}
     */
    private function storeTierSnapshot(
        string $archivePath,
        string $tier,
        string $period,
        array $settings,
    ): array {
        $fileName = sprintf(
            'davvy-%s-%s.zip',
            $tier,
            $period,
        );

        $localPath = null;
        if ((bool) $settings['local_enabled']) {
            $localPath = $this->storeLocalSnapshot(
                archivePath: $archivePath,
                localRoot: (string) $settings['local_path'],
                tier: $tier,
                fileName: $fileName,
            );
        }

        $s3Path = null;
        if ((bool) $settings['s3_enabled']) {
            $s3Path = $this->storeRemoteSnapshot(
                archivePath: $archivePath,
                diskName: (string) $settings['s3_disk'],
                prefix: (string) $settings['s3_prefix'],
                tier: $tier,
                fileName: $fileName,
            );
        }

        return [
            'tier' => $tier,
            'period' => $period,
            'file_name' => $fileName,
            'local_path' => $localPath,
            's3_path' => $s3Path,
        ];
    }

    /**
     * @param  string  $archivePath
     * @param  string  $localRoot
     * @param  string  $tier
     * @param  string  $fileName
     * @return string
     */
    private function storeLocalSnapshot(string $archivePath, string $localRoot, string $tier, string $fileName): string
    {
        $root = rtrim($localRoot, '/\\');
        if ($root === '') {
            throw new RuntimeException('Backup local path is empty.');
        }

        $tierDirectory = $root.DIRECTORY_SEPARATOR.$tier;
        File::ensureDirectoryExists($tierDirectory);

        $targetPath = $tierDirectory.DIRECTORY_SEPARATOR.$fileName;
        if (! copy($archivePath, $targetPath)) {
            throw new RuntimeException('Unable to write local backup snapshot: '.$targetPath);
        }

        return $targetPath;
    }

    /**
     * @param  string  $archivePath
     * @param  string  $diskName
     * @param  string  $prefix
     * @param  string  $tier
     * @param  string  $fileName
     * @return string
     */
    private function storeRemoteSnapshot(
        string $archivePath,
        string $diskName,
        string $prefix,
        string $tier,
        string $fileName,
    ): string {
        $normalizedPrefix = trim($prefix, '/');
        $remotePath = ($normalizedPrefix === '' ? '' : $normalizedPrefix.'/').$tier.'/'.$fileName;
        $stream = fopen($archivePath, 'rb');

        if ($stream === false) {
            throw new RuntimeException('Unable to open backup archive stream for remote upload.');
        }

        try {
            $written = Storage::disk($diskName)->put($remotePath, $stream);
            if ($written === false) {
                throw new RuntimeException(
                    sprintf('Unable to write remote backup snapshot to disk "%s".', $diskName)
                );
            }
        } finally {
            fclose($stream);
        }

        return $remotePath;
    }

    /**
     * @param  array{
     *   local_enabled: bool,
     *   local_path: string,
     *   s3_enabled: bool,
     *   s3_disk: string,
     *   s3_prefix: string,
     *   retention_daily: int,
     *   retention_weekly: int,
     *   retention_monthly: int,
     *   retention_yearly: int
     * } $settings
     */
    private function pruneByRetention(array $settings): void
    {
        $retentions = [
            'daily' => (int) $settings['retention_daily'],
            'weekly' => (int) $settings['retention_weekly'],
            'monthly' => (int) $settings['retention_monthly'],
            'yearly' => (int) $settings['retention_yearly'],
        ];

        if ((bool) $settings['local_enabled']) {
            foreach ($retentions as $tier => $limit) {
                $this->pruneLocalTier((string) $settings['local_path'], $tier, $limit);
            }
        }

        if ((bool) $settings['s3_enabled']) {
            foreach ($retentions as $tier => $limit) {
                $this->pruneRemoteTier(
                    diskName: (string) $settings['s3_disk'],
                    prefix: (string) $settings['s3_prefix'],
                    tier: $tier,
                    limit: $limit,
                );
            }
        }
    }

    /**
     * @param  string  $localRoot
     * @param  string  $tier
     * @param  int  $limit
     * @return void
     */
    private function pruneLocalTier(string $localRoot, string $tier, int $limit): void
    {
        $root = rtrim($localRoot, '/\\');
        if ($root === '') {
            return;
        }

        $tierDirectory = $root.DIRECTORY_SEPARATOR.$tier;
        if (! is_dir($tierDirectory)) {
            return;
        }

        $pattern = $tierDirectory.DIRECTORY_SEPARATOR.'davvy-'.$tier.'-*.zip';
        $files = glob($pattern);
        if (! is_array($files) || $files === []) {
            return;
        }

        usort($files, fn (string $a, string $b): int => filemtime($b) <=> filemtime($a));

        $removeFromIndex = max($limit, 0);
        foreach (array_slice($files, $removeFromIndex) as $path) {
            @unlink($path);
        }
    }

    /**
     * @param  string  $diskName
     * @param  string  $prefix
     * @param  string  $tier
     * @param  int  $limit
     * @return void
     */
    private function pruneRemoteTier(string $diskName, string $prefix, string $tier, int $limit): void
    {
        $disk = Storage::disk($diskName);
        $normalizedPrefix = trim($prefix, '/');
        $directory = ($normalizedPrefix === '' ? '' : $normalizedPrefix.'/').$tier;

        $paths = collect($disk->files($directory))
            ->filter(fn (string $path): bool => str_ends_with($path, '.zip'))
            ->filter(fn (string $path): bool => str_starts_with(basename($path), 'davvy-'.$tier.'-'))
            ->map(fn (string $path): array => [
                'path' => $path,
                'timestamp' => (int) $disk->lastModified($path),
            ])
            ->sortByDesc('timestamp')
            ->values();

        $removeFromIndex = max($limit, 0);
        $toDelete = $paths->slice($removeFromIndex)->pluck('path')->all();
        if ($toDelete !== []) {
            $disk->delete($toDelete);
        }
    }

    /**
     * @param  Calendar  $calendar
     * @return string
     */
    private function buildCalendarPayload(Calendar $calendar): string
    {
        $export = new VCalendar([
            'VERSION' => '2.0',
            'PRODID' => '-//Davvy//Automated Backup//EN',
        ]);

        foreach ($calendar->objects as $object) {
            $source = Reader::read($object->data);
            if (! $source instanceof VCalendar) {
                continue;
            }

            foreach ($source->children() as $child) {
                if ($child instanceof Component) {
                    $export->add(clone $child);
                }
            }
        }

        return $export->serialize();
    }

    /**
     * @param  AddressBook  $addressBook
     * @return string
     */
    private function buildAddressBookPayload(AddressBook $addressBook): string
    {
        return $addressBook->cards
            ->map(fn ($card): string => rtrim((string) $card->data, "\r\n"))
            ->filter(fn (string $card): bool => $card !== '')
            ->implode("\r\n");
    }

    /**
     * @param  string  $displayName
     * @param  string  $fallbackStem
     * @param  string  $extension
     * @return string
     */
    private function resourceFileName(string $displayName, string $fallbackStem, string $extension): string
    {
        $stem = Str::slug($displayName);
        if ($stem === '') {
            $stem = $fallbackStem;
        }

        return $stem.'.'.$extension;
    }

    /**
     * @return array{
     *   status: 'skipped',
     *   trigger: string,
     *   reason: string,
     *   timezone: string,
     *   executed_at_utc: string,
     *   executed_at_local: string,
     *   tiers: array<int, string>,
     *   artifact_count: int,
     *   artifacts: array<int, array{tier:string,period:string,file_name:string,local_path:?string,s3_path:?string}>,
     *   resource_counts: array{calendars:int,address_books:int,calendar_objects:int,cards:int},
     *   code: string
     * }
     */
    private function skipResult(
        string $trigger,
        string $reason,
        CarbonImmutable $nowUtc,
        CarbonImmutable $nowLocal,
        string $timezone,
        string $code,
    ): array {
        return [
            'status' => 'skipped',
            'trigger' => $trigger,
            'reason' => $reason,
            'timezone' => $timezone,
            'executed_at_utc' => $nowUtc->toIso8601String(),
            'executed_at_local' => $nowLocal->toIso8601String(),
            'tiers' => [],
            'artifact_count' => 0,
            'artifacts' => [],
            'resource_counts' => [
                'calendars' => 0,
                'address_books' => 0,
                'calendar_objects' => 0,
                'cards' => 0,
            ],
            'code' => $code,
        ];
    }

    /**
     * @return array{
     *   status: 'failed',
     *   trigger: string,
     *   reason: string,
     *   timezone: string,
     *   executed_at_utc: string,
     *   executed_at_local: string,
     *   tiers: array<int, string>,
     *   artifact_count: int,
     *   artifacts: array<int, array{tier:string,period:string,file_name:string,local_path:?string,s3_path:?string}>,
     *   resource_counts: array{calendars:int,address_books:int,calendar_objects:int,cards:int}
     * }
     */
    private function failedResult(
        string $trigger,
        string $reason,
        CarbonImmutable $nowUtc,
        CarbonImmutable $nowLocal,
        string $timezone,
    ): array {
        return [
            'status' => 'failed',
            'trigger' => $trigger,
            'reason' => $reason,
            'timezone' => $timezone,
            'executed_at_utc' => $nowUtc->toIso8601String(),
            'executed_at_local' => $nowLocal->toIso8601String(),
            'tiers' => [],
            'artifact_count' => 0,
            'artifacts' => [],
            'resource_counts' => [
                'calendars' => 0,
                'address_books' => 0,
                'calendar_objects' => 0,
                'cards' => 0,
            ],
        ];
    }
}
