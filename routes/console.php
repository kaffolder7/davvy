<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('app:about', function (): void {
    $this->comment('Davvy MVP - Laravel + SabreDAV');
});

Artisan::command('app:preflight', function (): int {
    $appEnv = (string) config('app.env', 'production');
    $appUrl = trim((string) config('app.url', ''));
    $appKey = trim((string) config('app.key', ''));
    $dbConnection = (string) config('database.default', '');

    $runDbSeed = filter_var(env('RUN_DB_SEED', false), FILTER_VALIDATE_BOOL);
    $secureCookieEnabled = filter_var(env('SESSION_SECURE_COOKIE', false), FILTER_VALIDATE_BOOL);
    $defaultAdminEmail = trim((string) env('DEFAULT_ADMIN_EMAIL', ''));
    $defaultAdminPassword = (string) env('DEFAULT_ADMIN_PASSWORD', '');

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
