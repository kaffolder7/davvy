# Configuration Reference

This document covers Davvy runtime configuration, especially app-specific environment variables.

## Configuration Sources and Precedence

Davvy uses two configuration layers for feature flags:
1. Environment defaults (`.env` / platform env vars)
2. Database `app_settings` values (set by admin actions and some seed paths)

When an `app_settings` key exists, it overrides env defaults.

## Core Environment Variables

### Application and Security

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_ENV` | `production` | Can be set as `local` for local development |
| `APP_DEBUG` | `false` (production) | May be set to `true` for local development |
| `APP_KEY` | _(empty)_ | Required at runtime. In production it must be a unique secret and must not match the local compose development key. |
| `APP_URL` | `http://localhost` | Must be HTTPS in production |
| `TRUSTED_PROXIES` | _(empty)_ | Use `*` or explicit list behind reverse proxy |
| `CORS_ALLOWED_ORIGINS` | _(empty)_ | Comma-separated allowed browser origins for cross-origin API access; empty means same-origin only |
| `CORS_ALLOWED_ORIGIN_PATTERNS` | _(empty)_ | Comma-separated regex origin patterns for CORS matching |
| `CORS_ALLOWED_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | Comma-separated methods accepted for CORS preflight |
| `CORS_ALLOWED_HEADERS` | `Content-Type, X-Requested-With, X-CSRF-TOKEN, Accept, Authorization` | Comma-separated allowed request headers for CORS |
| `CORS_MAX_AGE` | `0` | CORS preflight cache lifetime (seconds) |
| `CORS_SUPPORTS_CREDENTIALS` | `false` | Must remain `false` unless cross-origin cookie auth is intentionally enabled |

### Database and Session

| Variable | Default | Notes |
| --- | --- | --- |
| `DB_CONNECTION` | `pgsql` | Production target is PostgreSQL |
| `DB_HOST` | `postgres`/platform-specific | Required |
| `DB_PORT` | `5432` | Required |
| `DB_DATABASE` | `davvy` | Required |
| `DB_USERNAME` | `davvy` | Required |
| `DB_PASSWORD` | `secret` (local example) | Required |
| `SESSION_DRIVER` | `database` | Recommended for multi-replica |
| `SESSION_SECURE_COOKIE` | `true` (production) | Set to `false` for local development |
| `SESSION_HTTP_ONLY` | `true` | Recommended |
| `SESSION_SAME_SITE` | `lax` | Recommended |

### Davvy Feature and Runtime Flags

| Variable | Default | Notes |
| --- | --- | --- |
| `ENABLE_PUBLIC_REGISTRATION` | `false` | Env default only; setting is generally managed in DB/admin UI |
| `ENABLE_PUBLIC_REGISTRATION_REQUIRE_APPROVAL` | `false` | Env fallback only; first admin enable of public registration defaults this setting to `true` unless already set |
| `ENABLE_OWNER_SHARE_MANAGEMENT` | `true` | Seeds/initial default for owner sharing |
| `ENABLE_DAV_COMPATIBILITY_MODE` | `false` | Strict DAV validation is default |
| `ENABLE_CONTACT_MANAGEMENT` | `false` | Enables managed contacts UI/API |
| `ENABLE_CONTACT_CHANGE_MODERATION` | `false` | Enables Review Queue workflow for cross-owner contact edits (recommended for families/teams, optional for personal use) |
| `CONTACT_CHANGE_REQUEST_RETENTION_DAYS` | `90` | Purge horizon for applied/denied queue history |
| `MILESTONE_ANNIVERSARY_PAIR_INCLUDE_LAST_NAME` | `false` | When `true`, include shared last name in combined spouse anniversary milestone titles (`John & Jane Doe` vs `John & Jane`) |
| `ENABLE_TWO_FACTOR_ENFORCEMENT` | `false` | Admin-controlled default for global 2FA mandate (persisted in `app_settings` once toggled) |
| `TWO_FACTOR_GRACE_PERIOD_DAYS` | `14` | Grace period days before mandatory 2FA is enforced for users without 2FA enabled |
| `ENABLE_AUTOMATED_BACKUPS` | `false` | Enables scheduled automated backups |
| `BACKUPS_LOCAL_ENABLED` | `true` | Write backup snapshots to local filesystem path |
| `BACKUPS_LOCAL_PATH` | `/var/www/html/storage/app/backups` | Root folder for local snapshots (`daily/weekly/monthly/yearly` subfolders) |
| `BACKUPS_S3_ENABLED` | `false` | Upload backup snapshots to configured S3 disk |
| `BACKUPS_S3_DISK` | `s3` | Filesystem disk name used for remote backup storage |
| `BACKUPS_S3_PREFIX` | `davvy-backups` | Key prefix for remote backup objects |
| `BACKUPS_SCHEDULE_TIMES` | `02:30` | Comma-separated list of daily backup windows in `HH:MM` (24h) |
| `BACKUPS_TIMEZONE` | `UTC` | IANA timezone used for schedule and retention anchors |
| `BACKUPS_WEEKLY_DAY` | `0` | Weekly anchor day (`0=Sunday` ... `6=Saturday`) |
| `BACKUPS_MONTHLY_DAY` | `1` | Monthly anchor day (`1..31`, clamped to month length) |
| `BACKUPS_YEARLY_MONTH` | `1` | Yearly anchor month (`1..12`) |
| `BACKUPS_YEARLY_DAY` | `1` | Yearly anchor day (`1..31`, clamped to month length) |
| `BACKUPS_RETENTION_DAILY` | `7` | Number of daily snapshots to retain |
| `BACKUPS_RETENTION_WEEKLY` | `4` | Number of weekly snapshots to retain |
| `BACKUPS_RETENTION_MONTHLY` | `12` | Number of monthly snapshots to retain |
| `BACKUPS_RETENTION_YEARLY` | `3` | Number of yearly snapshots to retain |
| `DAV_LOG_CLIENT_TRAFFIC` | `false` | Debug logging for targeted DAV traffic patterns |
| `DAV_AUTH_THROTTLE_MAX_ATTEMPTS` | `20` | Failed DAV auth attempts allowed per source key (`username + IP`) before temporary lockout |
| `DAV_AUTH_THROTTLE_DECAY_SECONDS` | `60` | Lockout window (seconds) for DAV failed-auth throttling |

### Optional Remote S3 Credentials

These are required only when `BACKUPS_S3_ENABLED=true` and the selected disk is `s3`.

| Variable | Default | Notes |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID` | _(empty)_ | S3 API access key |
| `AWS_SECRET_ACCESS_KEY` | _(empty)_ | S3 API secret |
| `AWS_DEFAULT_REGION` | `us-east-1` | Bucket region |
| `AWS_BUCKET` | _(empty)_ | Target bucket name |
| `AWS_URL` | _(empty)_ | Optional custom URL for generated links |
| `AWS_ENDPOINT` | _(empty)_ | Optional custom endpoint (MinIO, R2, etc.) |
| `AWS_USE_PATH_STYLE_ENDPOINT` | `false` | Set `true` for some S3-compatible providers |

Backup period semantics:
- Davvy keeps one artifact per tier period (`daily=YYYY-MM-DD`, `weekly=ISO week`, `monthly=YYYY-MM`, `yearly=YYYY`).
- Re-running a backup in the same period replaces that period snapshot instead of creating duplicates.

Backup restore tooling:
- CLI command: `php artisan app:backup:restore {archive} [--mode=merge|replace] [--dry-run] [--fallback-owner-id=...]`
- Admin import endpoint: `POST /api/admin/backups/restore`
- Restore is destination-agnostic; it reads a ZIP archive and writes resources back into the database.

User recovery tooling:
- CLI command: `php artisan app:user:approve {identifier} [--approve] [--verify-email] [--force]`
- CLI command: `php artisan app:user:unapprove {identifier} [--unverify-email] [--force]`
- `identifier` accepts a user email or numeric user ID.
- If neither `--approve` nor `--verify-email` is provided, both are applied.
- `app:user:unapprove` always revokes account approval; add `--unverify-email` to also clear `email_verified_at`.

### Startup Bootstrap Controls

| Variable | Default | Notes |
| --- | --- | --- |
| `RUN_DB_MIGRATIONS` | `true` | Runs migrations on startup |
| `RUN_DB_SEED` | `false` | Runs seeder on startup |
| `RUN_SCHEDULER` | `true` | Runs `php artisan schedule:work` in the container for scheduled tasks (including backups) |
| `DEFAULT_ADMIN_EMAIL` | _(empty)_ | Used by seeder when seeding enabled |
| `DEFAULT_ADMIN_PASSWORD` | _(empty)_ | Used by seeder when seeding enabled |

## Seeder and Settings Notes

`DatabaseSeeder` behavior relevant to config:
- Creates/updates bootstrap admin when both `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are set.
- Writes app settings for:
  - public registration (disabled)
  - owner share management
  - DAV compatibility mode
  - contact change moderation

Because settings are persisted, environment defaults may no longer be authoritative after seeding/admin toggles.

## Feature Flags in Admin UI

Admin Control Center toggles map to these settings keys:
- `public_registration_enabled`
- `owner_share_management_enabled`
- `dav_compatibility_mode_enabled`
- `contact_management_enabled`
- `contact_change_moderation_enabled`
- `two_factor_enforcement_enabled`
- `two_factor_enforcement_started_at`
- `contact_change_request_retention_days`
- `backups_enabled`
- `backup_local_enabled`
- `backup_local_path`
- `backup_s3_enabled`
- `backup_s3_disk`
- `backup_s3_prefix`
- `backup_schedule_times`
- `backup_timezone`
- `backup_weekly_day`
- `backup_monthly_day`
- `backup_yearly_month`
- `backup_yearly_day`
- `backup_retention_daily`
- `backup_retention_weekly`
- `backup_retention_monthly`
- `backup_retention_yearly`

Review Queue default strategy:
- `contact_change_moderation_enabled` defaults to `false` (personal-first)
- enable when collaborative review/approval is needed (families/teams)

## Production Baseline Recommendations

- `APP_ENV=production`
- `APP_DEBUG=false`
- unique secret `APP_KEY` from platform secrets (not the local compose dev key)
- `APP_URL=https://...`
- `SESSION_SECURE_COOKIE=true`
- `DB_CONNECTION=pgsql`
- `SESSION_DRIVER=database`
- `RUN_DB_SEED=false` after initial bootstrap
- strong non-default admin password (if seeding)

## Related Docs

- [Deployment](./deployment.md)
- [Architecture](./architecture.md)
- [Troubleshooting](./troubleshooting.md)
