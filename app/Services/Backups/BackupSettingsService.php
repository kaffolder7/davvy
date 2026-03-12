<?php

namespace App\Services\Backups;

use App\Models\AppSetting;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonTimeZone;

class BackupSettingsService
{
    /**
     * Returns the current configuration.
     *
     * @return array{
     *   enabled: bool,
     *   local_enabled: bool,
     *   local_path: string,
     *   s3_enabled: bool,
     *   s3_disk: string,
     *   s3_prefix: string,
     *   schedule_times: array<int, string>,
     *   timezone: string,
     *   weekly_day: int,
     *   monthly_day: int,
     *   yearly_month: int,
     *   yearly_day: int,
     *   retention_daily: int,
     *   retention_weekly: int,
     *   retention_monthly: int,
     *   retention_yearly: int,
     *   last_run: array{at:?string,status:?string,message:?string}
     * }
     */
    public function current(): array
    {
        return [
            'enabled' => AppSetting::backupsEnabled(),
            'local_enabled' => AppSetting::backupLocalEnabled(),
            'local_path' => AppSetting::backupLocalPath(),
            's3_enabled' => AppSetting::backupS3Enabled(),
            's3_disk' => AppSetting::backupS3Disk(),
            's3_prefix' => AppSetting::backupS3Prefix(),
            'schedule_times' => AppSetting::backupScheduleTimes(),
            'timezone' => AppSetting::backupTimezone(),
            'weekly_day' => AppSetting::backupWeeklyDay(),
            'monthly_day' => AppSetting::backupMonthlyDay(),
            'yearly_month' => AppSetting::backupYearlyMonth(),
            'yearly_day' => AppSetting::backupYearlyDay(),
            'retention_daily' => AppSetting::backupRetentionDaily(),
            'retention_weekly' => AppSetting::backupRetentionWeekly(),
            'retention_monthly' => AppSetting::backupRetentionMonthly(),
            'retention_yearly' => AppSetting::backupRetentionYearly(),
            'last_run' => [
                'at' => AppSetting::backupLastRunAt(),
                'status' => AppSetting::backupLastRunStatus(),
                'message' => AppSetting::backupLastRunMessage(),
            ],
        ];
    }

    /**
     * Updates an existing resource.
     *
     * @param  array{
     *   enabled: bool,
     *   local_enabled: bool,
     *   local_path: string,
     *   s3_enabled: bool,
     *   s3_disk: string,
     *   s3_prefix?: ?string,
     *   schedule_times: array<int, string>,
     *   timezone: string,
     *   weekly_day: int,
     *   monthly_day: int,
     *   yearly_month: int,
     *   yearly_day: int,
     *   retention_daily: int,
     *   retention_weekly: int,
     *   retention_monthly: int,
     *   retention_yearly: int
     * } $payload
     */
    public function update(array $payload, ?User $actor = null): array
    {
        $timezone = CarbonTimeZone::create((string) $payload['timezone'])?->getName()
            ?? AppSetting::backupTimezone();
        $scheduleTimes = $this->normalizeScheduleTimes((array) $payload['schedule_times']);

        $this->setBoolean('backups_enabled', (bool) $payload['enabled'], $actor);
        $this->setBoolean('backup_local_enabled', (bool) $payload['local_enabled'], $actor);
        $this->setString('backup_local_path', trim((string) $payload['local_path']), $actor);
        $this->setBoolean('backup_s3_enabled', (bool) $payload['s3_enabled'], $actor);
        $this->setString('backup_s3_disk', trim((string) $payload['s3_disk']), $actor);
        $this->setString('backup_s3_prefix', trim((string) ($payload['s3_prefix'] ?? ''), '/'), $actor);
        $this->setString('backup_schedule_times', json_encode($scheduleTimes, JSON_UNESCAPED_SLASHES), $actor);
        $this->setString('backup_timezone', $timezone, $actor);
        $this->setInteger('backup_weekly_day', max(0, min(6, (int) $payload['weekly_day'])), $actor);
        $this->setInteger('backup_monthly_day', max(1, min(31, (int) $payload['monthly_day'])), $actor);
        $this->setInteger('backup_yearly_month', max(1, min(12, (int) $payload['yearly_month'])), $actor);
        $this->setInteger('backup_yearly_day', max(1, min(31, (int) $payload['yearly_day'])), $actor);
        $this->setInteger('backup_retention_daily', max(0, min(3650, (int) $payload['retention_daily'])), $actor);
        $this->setInteger('backup_retention_weekly', max(0, min(520, (int) $payload['retention_weekly'])), $actor);
        $this->setInteger('backup_retention_monthly', max(0, min(240, (int) $payload['retention_monthly'])), $actor);
        $this->setInteger('backup_retention_yearly', max(0, min(50, (int) $payload['retention_yearly'])), $actor);

        return $this->current();
    }

    /**
     * Checks whether the period has already been captured.
     *
     * @param  string  $tier
     * @param  string  $periodKey
     * @return bool
     */
    public function wasPeriodCaptured(string $tier, string $periodKey): bool
    {
        return AppSetting::backupLastCapturedPeriod($tier) === $periodKey;
    }

    /**
     * Marks period captured.
     *
     * @param  string  $tier
     * @param  string  $periodKey
     * @return void
     */
    public function markPeriodCaptured(string $tier, string $periodKey): void
    {
        if (! in_array($tier, ['daily', 'weekly', 'monthly', 'yearly'], true)) {
            return;
        }

        AppSetting::query()->updateOrCreate(
            ['key' => "backup_last_period_{$tier}"],
            ['value' => $periodKey],
        );
    }

    /**
     * Records run.
     *
     * @param  string  $status
     * @param  string  $message
     * @param  CarbonImmutable|null  $executedAtUtc
     * @return void
     */
    public function recordRun(string $status, string $message, ?CarbonImmutable $executedAtUtc = null): void
    {
        $executedAt = ($executedAtUtc ?? CarbonImmutable::now('UTC'))->toIso8601String();

        AppSetting::query()->updateOrCreate(
            ['key' => 'backup_last_run_at'],
            ['value' => $executedAt],
        );
        AppSetting::query()->updateOrCreate(
            ['key' => 'backup_last_run_status'],
            ['value' => $status],
        );
        AppSetting::query()->updateOrCreate(
            ['key' => 'backup_last_run_message'],
            ['value' => $message],
        );
    }

    /**
     * Normalizes schedule times.
     *
     * @param  array<int, string>  $scheduleTimes
     * @return array<int, string>
     */
    private function normalizeScheduleTimes(array $scheduleTimes): array
    {
        $normalized = collect($scheduleTimes)
            ->map(fn (string $time): string => trim($time))
            ->filter(fn (string $time): bool => $time !== '')
            ->filter(fn (string $time): bool => (bool) preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $time))
            ->unique()
            ->sort()
            ->values()
            ->all();

        return $normalized === [] ? ['02:30'] : $normalized;
    }

    /**
     * Sets boolean.
     *
     * @param  string  $key
     * @param  bool  $value
     * @param  User|null  $actor
     * @return void
     */
    private function setBoolean(string $key, bool $value, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => $key],
            ['value' => $value ? 'true' : 'false', 'updated_by' => $actor?->id],
        );
    }

    /**
     * Sets integer.
     *
     * @param  string  $key
     * @param  int  $value
     * @param  User|null  $actor
     * @return void
     */
    private function setInteger(string $key, int $value, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => $key],
            ['value' => (string) $value, 'updated_by' => $actor?->id],
        );
    }

    /**
     * Sets string.
     *
     * @param  string  $key
     * @param  string  $value
     * @param  User|null  $actor
     * @return void
     */
    private function setString(string $key, string $value, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => $key],
            ['value' => $value, 'updated_by' => $actor?->id],
        );
    }
}
