<?php

use App\Mail\AdminUserInviteMail;
use App\Mail\PublicRegistrationVerificationMail;
use App\Models\User;
use App\Services\Analytics\OpenPanelAnalyticsService;
use App\Services\Backups\BackupRestoreService;
use App\Services\Backups\BackupService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schedule;

Artisan::command('app:about', function (): void {
    $this->comment('Davvy MVP - Laravel + SabreDAV');
});

Artisan::command('app:mail:preview-onboarding {--output= : Output directory for preview files}', function (): int {
    $outputDirectory = trim((string) $this->option('output'));
    if ($outputDirectory === '') {
        $outputDirectory = storage_path('app/mail-previews');
    }

    File::ensureDirectoryExists($outputDirectory);

    $previewUser = new User([
        'name' => 'Preview User',
        'email' => 'preview@example.com',
    ]);

    $inviteExpiresAt = now()->addHours(max(1, (int) config('onboarding.invite_expires_hours', 72)));
    $verifyExpiresAt = now()->addHours(max(1, (int) config('onboarding.verification_expires_hours', 24)));
    $baseUrl = rtrim((string) config('app.url', 'http://localhost'), '/');
    $inviteUrl = $baseUrl.'/invite?token='.str_repeat('i', 64);
    $verifyUrl = $baseUrl.'/verify-email?token='.str_repeat('v', 64);

    $inviteMailable = new AdminUserInviteMail($previewUser, $inviteUrl, $inviteExpiresAt);
    $verifyMailable = new PublicRegistrationVerificationMail($previewUser, $verifyUrl, $verifyExpiresAt);

    $files = [
        'admin-invite.html' => $inviteMailable->render(),
        'admin-invite.txt' => view('emails.auth.admin-invite-text', [
            'user' => $previewUser,
            'inviteUrl' => $inviteUrl,
            'expiresAt' => $inviteExpiresAt,
        ])->render(),
        'verify-email.html' => $verifyMailable->render(),
        'verify-email.txt' => view('emails.auth.verify-email-text', [
            'user' => $previewUser,
            'verificationUrl' => $verifyUrl,
            'expiresAt' => $verifyExpiresAt,
        ])->render(),
    ];

    foreach ($files as $fileName => $contents) {
        $path = $outputDirectory.DIRECTORY_SEPARATOR.$fileName;
        file_put_contents($path, $contents);
        $this->line("Wrote: {$path}");
    }

    $this->newLine();
    $this->info('Email previews generated successfully.');
    $this->line('Tip: open the .html files in your browser and .txt files in your editor.');

    return 0;
})->purpose('Generate local preview files for onboarding emails without sending mail');

Artisan::command('app:preflight', function (): int {
    $appEnv = (string) config('app.env', 'production');
    $appUrl = trim((string) config('app.url', ''));
    $appKey = trim((string) config('app.key', ''));
    $dbConnection = (string) config('database.default', '');

    $runDbSeed = filter_var(env('RUN_DB_SEED', false), FILTER_VALIDATE_BOOL);
    $runScheduler = filter_var(env('RUN_SCHEDULER', true), FILTER_VALIDATE_BOOL);
    $secureCookieEnabled = filter_var(env('SESSION_SECURE_COOKIE', false), FILTER_VALIDATE_BOOL);
    $defaultAdminEmail = trim((string) env('DEFAULT_ADMIN_EMAIL', ''));
    $defaultAdminPassword = (string) env('DEFAULT_ADMIN_PASSWORD', '');
    $backupsEnabled = (bool) config('services.backups.enabled', false);
    $backupLocalEnabled = (bool) config('services.backups.local_enabled', true);
    $backupS3Enabled = (bool) config('services.backups.s3_enabled', false);
    $backupScheduleTimes = collect(explode(',', (string) config('services.backups.schedule_times', '')))
        ->map(fn (string $value): string => trim($value))
        ->filter(fn (string $value): bool => $value !== '')
        ->values()
        ->all();
    $backupTimezone = trim((string) config('services.backups.timezone', config('app.timezone', 'UTC')));
    $backupS3Disk = trim((string) config('services.backups.s3_disk', 's3'));
    $corsAllowedOrigins = array_values(array_filter(
        (array) config('cors.allowed_origins', []),
        fn (mixed $origin): bool => is_string($origin) && trim($origin) !== ''
    ));
    $corsSupportsCredentials = (bool) config('cors.supports_credentials', false);

    $errors = [];
    $warnings = [];

    if ($appKey === '') {
        $errors[] = 'APP_KEY is missing.';
    }

    if ($appUrl === '') {
        $errors[] = 'APP_URL is missing.';
    }

    if ($appEnv === 'production') {
        if ((bool) config('app.debug', false)) {
            $errors[] = 'APP_DEBUG must be false in production.';
        }

        if ($appUrl !== '' && ! str_starts_with(strtolower($appUrl), 'https://')) {
            $errors[] = 'APP_URL must use HTTPS in production.';
        }

        if (! $secureCookieEnabled) {
            $errors[] = 'SESSION_SECURE_COOKIE must be true in production.';
        }

        if ($dbConnection === 'sqlite') {
            $errors[] = 'DB_CONNECTION=sqlite is not recommended for production.';
        }

        if ($corsSupportsCredentials && in_array('*', $corsAllowedOrigins, true)) {
            $errors[] = 'CORS_ALLOWED_ORIGINS must not include "*" when CORS_SUPPORTS_CREDENTIALS=true.';
        }

        if ($runDbSeed) {
            if ($defaultAdminEmail === '' || $defaultAdminPassword === '') {
                $errors[] = 'RUN_DB_SEED=true requires DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD.';
            }

            if ($defaultAdminPassword === 'ChangeMe123!') {
                $errors[] = 'DEFAULT_ADMIN_PASSWORD must not use the insecure default value in production.';
            }

            if ($defaultAdminPassword !== '' && mb_strlen($defaultAdminPassword) < 12) {
                $warnings[] = 'DEFAULT_ADMIN_PASSWORD is shorter than 12 characters.';
            }
        }

        if ($backupsEnabled) {
            if (! $backupLocalEnabled && ! $backupS3Enabled) {
                $errors[] = 'ENABLE_AUTOMATED_BACKUPS=true requires BACKUPS_LOCAL_ENABLED=true or BACKUPS_S3_ENABLED=true.';
            }

            if ($backupScheduleTimes === []) {
                $errors[] = 'BACKUPS_SCHEDULE_TIMES must include at least one HH:MM value when backups are enabled.';
            }

            foreach ($backupScheduleTimes as $time) {
                if (! preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $time)) {
                    $errors[] = sprintf('BACKUPS_SCHEDULE_TIMES contains invalid value "%s" (expected HH:MM).', $time);
                }
            }

            if ($backupTimezone !== '' && ! in_array($backupTimezone, timezone_identifiers_list(), true)) {
                $errors[] = 'BACKUPS_TIMEZONE must be a valid IANA timezone identifier.';
            }

            if ($backupS3Enabled && $backupS3Disk === '') {
                $errors[] = 'BACKUPS_S3_DISK cannot be empty when BACKUPS_S3_ENABLED=true.';
            }

            if (! $runScheduler) {
                $warnings[] = 'ENABLE_AUTOMATED_BACKUPS=true while RUN_SCHEDULER=false. Use an external scheduler to run "php artisan schedule:run" every minute.';
            }
        }
    }

    if ($warnings !== []) {
        foreach ($warnings as $warning) {
            $this->warn('Warning: '.$warning);
        }
    }

    if ($errors !== []) {
        foreach ($errors as $error) {
            $this->error('Error: '.$error);
        }

        return 1;
    }

    $this->info('Preflight checks passed.');

    return 0;
})->purpose('Validate runtime security and deployment configuration');

Artisan::command('app:backup {--force : Run immediately, ignoring enabled flag and schedule window}', function (): int {
    /** @var BackupService $backupService */
    $backupService = app(BackupService::class);
    /** @var OpenPanelAnalyticsService $analytics */
    $analytics = app(OpenPanelAnalyticsService::class);
    $force = (bool) $this->option('force');
    $trigger = $force ? 'manual-cli' : 'scheduled';

    $result = $backupService->run(force: $force, trigger: $trigger);
    if (! $force) {
        $analytics->track('backups.scheduled_run', [
            'status' => (string) ($result['status'] ?? 'unknown'),
            'trigger' => (string) ($result['trigger'] ?? 'scheduled'),
            'code' => (string) ($result['code'] ?? ''),
            'tier_count' => is_array($result['tiers'] ?? null) ? count($result['tiers']) : 0,
            'artifact_count' => (int) ($result['artifact_count'] ?? 0),
        ]);
    }

    if ($result['status'] === 'success') {
        $this->info($result['reason']);

        return 0;
    }

    if ($result['status'] === 'skipped') {
        $this->line('Skipped: '.$result['reason']);

        return 0;
    }

    $this->error($result['reason']);

    return 1;
})->purpose('Run automated data backups with retention (local and optional S3)');

Artisan::command(
    'app:backup:restore
    {archive : Path to backup ZIP archive}
    {--mode=merge : Restore mode: merge or replace}
    {--dry-run : Validate and preview restore operations without writing changes}
    {--fallback-owner-id= : Assign unresolved backup owner IDs to this user ID}',
    function (): int {
        /** @var BackupRestoreService $backupRestoreService */
        $backupRestoreService = app(BackupRestoreService::class);

        $archivePath = (string) $this->argument('archive');
        $mode = trim((string) $this->option('mode'));
        $dryRun = (bool) $this->option('dry-run');
        $fallbackOwnerInput = $this->option('fallback-owner-id');
        $fallbackOwnerId = null;

        if ($fallbackOwnerInput !== null && $fallbackOwnerInput !== '') {
            if (preg_match('/^\d+$/', (string) $fallbackOwnerInput) !== 1) {
                $this->error('--fallback-owner-id must be a numeric user ID.');

                return 1;
            }

            $fallbackOwnerId = (int) $fallbackOwnerInput;
        }

        try {
            $result = $backupRestoreService->restoreFromArchive(
                archivePath: $archivePath,
                mode: $mode,
                dryRun: $dryRun,
                fallbackOwnerId: $fallbackOwnerId,
                trigger: 'manual-cli',
            );
        } catch (Throwable $throwable) {
            $this->error('Restore failed: '.$throwable->getMessage());

            return 1;
        }

        foreach (($result['warnings'] ?? []) as $warning) {
            if (is_string($warning) && $warning !== '') {
                $this->warn('Warning: '.$warning);
            }
        }

        $summary = is_array($result['summary'] ?? null) ? $result['summary'] : [];
        $this->info((string) ($result['reason'] ?? 'Restore complete.'));
        $this->line(sprintf(
            'Calendars created/updated: %d/%d',
            (int) ($summary['calendars_created'] ?? 0),
            (int) ($summary['calendars_updated'] ?? 0),
        ));
        $this->line(sprintf(
            'Address books created/updated: %d/%d',
            (int) ($summary['address_books_created'] ?? 0),
            (int) ($summary['address_books_updated'] ?? 0),
        ));
        $this->line(sprintf(
            'Objects created/updated: %d/%d',
            (int) (($summary['calendar_objects_created'] ?? 0) + ($summary['cards_created'] ?? 0)),
            (int) (($summary['calendar_objects_updated'] ?? 0) + ($summary['cards_updated'] ?? 0)),
        ));

        return 0;
    },
)->purpose('Restore calendars/address books from a backup ZIP archive');

Schedule::command('app:backup')
    ->everyMinute()
    ->withoutOverlapping();
