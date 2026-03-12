<?php

return [
    'registration' => [
        'enabled' => (bool) env('ENABLE_PUBLIC_REGISTRATION', false),
        'require_approval' => (bool) env('ENABLE_PUBLIC_REGISTRATION_REQUIRE_APPROVAL', false),
    ],
    'sharing' => [
        'owner_management_enabled' => (bool) env('ENABLE_OWNER_SHARE_MANAGEMENT', true),
    ],
    'dav' => [
        'compatibility_mode_enabled' => (bool) env('ENABLE_DAV_COMPATIBILITY_MODE', false),
    ],
    'contacts' => [
        'management_enabled' => (bool) env('ENABLE_CONTACT_MANAGEMENT', false),
        'change_moderation_enabled' => (bool) env('ENABLE_CONTACT_CHANGE_MODERATION', false),
        'change_request_retention_days' => (int) env('CONTACT_CHANGE_REQUEST_RETENTION_DAYS', 90),
        'milestone_calendar_generation_years' => (int) env('MILESTONE_CALENDAR_GENERATION_YEARS', 3),
    ],
    'backups' => [
        'enabled' => (bool) env('ENABLE_AUTOMATED_BACKUPS', false),
        'local_enabled' => (bool) env('BACKUPS_LOCAL_ENABLED', true),
        'local_path' => (string) env('BACKUPS_LOCAL_PATH', storage_path('app/backups')),
        's3_enabled' => (bool) env('BACKUPS_S3_ENABLED', false),
        's3_disk' => (string) env('BACKUPS_S3_DISK', 's3'),
        's3_prefix' => trim((string) env('BACKUPS_S3_PREFIX', 'davvy-backups'), '/'),
        'schedule_times' => (string) env('BACKUPS_SCHEDULE_TIMES', '02:30'),
        'timezone' => (string) env('BACKUPS_TIMEZONE', config('app.timezone', 'UTC')),
        'weekly_day' => (int) env('BACKUPS_WEEKLY_DAY', 0),
        'monthly_day' => (int) env('BACKUPS_MONTHLY_DAY', 1),
        'yearly_month' => (int) env('BACKUPS_YEARLY_MONTH', 1),
        'yearly_day' => (int) env('BACKUPS_YEARLY_DAY', 1),
        'retention_daily' => (int) env('BACKUPS_RETENTION_DAILY', 7),
        'retention_weekly' => (int) env('BACKUPS_RETENTION_WEEKLY', 4),
        'retention_monthly' => (int) env('BACKUPS_RETENTION_MONTHLY', 12),
        'retention_yearly' => (int) env('BACKUPS_RETENTION_YEARLY', 3),
    ],
    'sponsorship' => [
        'funding_file' => base_path('.github/FUNDING.yml'),
        'button_hidden' => (bool) env('DAVVY_HIDE_SPONSOR_BUTTON', false),
    ],
    'auth' => [
        'two_factor_enforcement_enabled' => (bool) env('ENABLE_TWO_FACTOR_ENFORCEMENT', false),
        'two_factor_grace_period_days' => (int) env('TWO_FACTOR_GRACE_PERIOD_DAYS', 14),
    ],
    'openpanel' => [
        'enabled' => (bool) env('ANALYTICS_ENABLED', true),
        // Maintainers: replace these with your own OpenPanel values.
        'client_id' => 'REPLACE_WITH_OPENPANEL_CLIENT_ID',
        'client_secret' => 'REPLACE_WITH_OPENPANEL_CLIENT_SECRET',
        'api_url' => 'REPLACE_WITH_OPENPANEL_API_URL',
        // Optional explicit override; if empty, script URL is derived from the API host.
        'script_url' => '',
    ],
];
