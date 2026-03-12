<?php

namespace App\Models;

use Carbon\CarbonTimeZone;
use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    public $incrementing = false;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $fillable = [
        'key',
        'value',
        'updated_by',
    ];

    public static function publicRegistrationEnabled(): bool
    {
        return self::booleanSetting(
            key: 'public_registration_enabled',
            default: (bool) config('services.registration.enabled', false),
        );
    }

    public static function publicRegistrationApprovalRequired(): bool
    {
        return self::booleanSetting(
            key: 'public_registration_require_approval',
            default: (bool) config('services.registration.require_approval', false),
        );
    }

    public static function ownerShareManagementEnabled(): bool
    {
        return self::booleanSetting(
            key: 'owner_share_management_enabled',
            default: (bool) config('services.sharing.owner_management_enabled', true),
        );
    }

    public static function davCompatibilityModeEnabled(): bool
    {
        return self::booleanSetting(
            key: 'dav_compatibility_mode_enabled',
            default: (bool) config('services.dav.compatibility_mode_enabled', false),
        );
    }

    public static function contactManagementEnabled(): bool
    {
        return self::booleanSetting(
            key: 'contact_management_enabled',
            default: (bool) config('services.contacts.management_enabled', false),
        );
    }

    public static function contactChangeModerationEnabled(): bool
    {
        return self::booleanSetting(
            key: 'contact_change_moderation_enabled',
            default: (bool) config('services.contacts.change_moderation_enabled', false),
        );
    }

    public static function twoFactorEnforcementEnabled(): bool
    {
        return self::booleanSetting(
            key: 'two_factor_enforcement_enabled',
            default: (bool) config('services.auth.two_factor_enforcement_enabled', false),
        );
    }

    public static function twoFactorEnforcementStartedAt(): ?string
    {
        return self::nullableStringSetting('two_factor_enforcement_started_at');
    }

    public static function contactChangeRequestRetentionDays(): int
    {
        return self::integerSetting(
            key: 'contact_change_request_retention_days',
            default: (int) config('services.contacts.change_request_retention_days', 90),
            min: 1,
            max: 3650,
        );
    }

    public static function milestoneCalendarGenerationYears(): int
    {
        $default = (int) config('services.contacts.milestone_calendar_generation_years', 3);

        return self::integerSetting(
            key: 'milestone_calendar_generation_years',
            default: max(1, min(25, $default)),
            min: 1,
            max: 25,
        );
    }

    public static function milestonePurgeControlVisible(): bool
    {
        return self::booleanSetting(
            key: 'milestone_purge_control_visible',
            default: false,
        );
    }

    public static function backupsEnabled(): bool
    {
        return self::booleanSetting(
            key: 'backups_enabled',
            default: (bool) config('services.backups.enabled', false),
        );
    }

    public static function backupLocalEnabled(): bool
    {
        return self::booleanSetting(
            key: 'backup_local_enabled',
            default: (bool) config('services.backups.local_enabled', true),
        );
    }

    public static function backupLocalPath(): string
    {
        return self::stringSetting(
            key: 'backup_local_path',
            default: (string) config('services.backups.local_path', storage_path('app/backups')),
        );
    }

    public static function backupS3Enabled(): bool
    {
        return self::booleanSetting(
            key: 'backup_s3_enabled',
            default: (bool) config('services.backups.s3_enabled', false),
        );
    }

    public static function backupS3Disk(): string
    {
        return self::stringSetting(
            key: 'backup_s3_disk',
            default: (string) config('services.backups.s3_disk', 's3'),
        );
    }

    public static function backupS3Prefix(): string
    {
        return trim(self::stringSetting(
            key: 'backup_s3_prefix',
            default: (string) config('services.backups.s3_prefix', 'davvy-backups'),
        ), '/');
    }

    /**
     * @return array<int, string>
     */
    public static function backupScheduleTimes(): array
    {
        $setting = self::query()->find('backup_schedule_times');
        $fallback = self::normalizeScheduleTimes(config('services.backups.schedule_times', '02:30'));

        if (! $setting) {
            return $fallback;
        }

        $value = trim((string) $setting->value);
        if ($value === '') {
            return $fallback;
        }

        $decoded = json_decode($value, true);
        if (is_array($decoded)) {
            return self::normalizeScheduleTimes($decoded);
        }

        return self::normalizeScheduleTimes($value);
    }

    public static function backupTimezone(): string
    {
        $fallback = (string) config('services.backups.timezone', config('app.timezone', 'UTC'));
        $timezone = self::stringSetting(
            key: 'backup_timezone',
            default: $fallback,
        );

        return CarbonTimeZone::create($timezone)?->getName() ?? $fallback;
    }

    public static function backupWeeklyDay(): int
    {
        return self::integerSetting(
            key: 'backup_weekly_day',
            default: (int) config('services.backups.weekly_day', 0),
            min: 0,
            max: 6,
        );
    }

    public static function backupMonthlyDay(): int
    {
        return self::integerSetting(
            key: 'backup_monthly_day',
            default: (int) config('services.backups.monthly_day', 1),
            min: 1,
            max: 31,
        );
    }

    public static function backupYearlyMonth(): int
    {
        return self::integerSetting(
            key: 'backup_yearly_month',
            default: (int) config('services.backups.yearly_month', 1),
            min: 1,
            max: 12,
        );
    }

    public static function backupYearlyDay(): int
    {
        return self::integerSetting(
            key: 'backup_yearly_day',
            default: (int) config('services.backups.yearly_day', 1),
            min: 1,
            max: 31,
        );
    }

    public static function backupRetentionDaily(): int
    {
        return self::integerSetting(
            key: 'backup_retention_daily',
            default: (int) config('services.backups.retention_daily', 7),
            min: 0,
            max: 3650,
        );
    }

    public static function backupRetentionWeekly(): int
    {
        return self::integerSetting(
            key: 'backup_retention_weekly',
            default: (int) config('services.backups.retention_weekly', 4),
            min: 0,
            max: 520,
        );
    }

    public static function backupRetentionMonthly(): int
    {
        return self::integerSetting(
            key: 'backup_retention_monthly',
            default: (int) config('services.backups.retention_monthly', 12),
            min: 0,
            max: 240,
        );
    }

    public static function backupRetentionYearly(): int
    {
        return self::integerSetting(
            key: 'backup_retention_yearly',
            default: (int) config('services.backups.retention_yearly', 3),
            min: 0,
            max: 50,
        );
    }

    public static function backupLastRunAt(): ?string
    {
        return self::nullableStringSetting('backup_last_run_at');
    }

    public static function backupLastRunStatus(): ?string
    {
        return self::nullableStringSetting('backup_last_run_status');
    }

    public static function backupLastRunMessage(): ?string
    {
        return self::nullableStringSetting('backup_last_run_message');
    }

    public static function backupLastCapturedPeriod(string $tier): ?string
    {
        if (! in_array($tier, ['daily', 'weekly', 'monthly', 'yearly'], true)) {
            return null;
        }

        return self::nullableStringSetting("backup_last_period_{$tier}");
    }

    private static function booleanSetting(string $key, bool $default): bool
    {
        $setting = self::query()->find($key);

        if (! $setting) {
            return $default;
        }

        return filter_var($setting->value, FILTER_VALIDATE_BOOL);
    }

    private static function integerSetting(string $key, int $default, int $min, int $max): int
    {
        $setting = self::query()->find($key);
        if (! $setting) {
            return $default;
        }

        $value = filter_var($setting->value, FILTER_VALIDATE_INT);
        if ($value === false) {
            return $default;
        }

        return max($min, min($max, $value));
    }

    private static function stringSetting(string $key, string $default): string
    {
        $setting = self::query()->find($key);
        if (! $setting) {
            return $default;
        }

        $value = trim((string) $setting->value);

        return $value === '' ? $default : $value;
    }

    private static function nullableStringSetting(string $key): ?string
    {
        $setting = self::query()->find($key);
        if (! $setting) {
            return null;
        }

        $value = trim((string) $setting->value);

        return $value === '' ? null : $value;
    }

    /**
     * @param  array<int|string, mixed>|string  $raw
     * @return array<int, string>
     */
    private static function normalizeScheduleTimes(array|string $raw): array
    {
        $values = is_array($raw) ? $raw : explode(',', (string) $raw);

        $normalized = collect($values)
            ->map(fn (mixed $value): string => trim((string) $value))
            ->filter(fn (string $value): bool => $value !== '')
            ->filter(fn (string $value): bool => (bool) preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $value))
            ->unique()
            ->sort()
            ->values()
            ->all();

        return $normalized === [] ? ['02:30'] : $normalized;
    }
}
