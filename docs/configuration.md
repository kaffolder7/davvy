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
| `APP_ENV` | `local` | Must be `production` in production |
| `APP_DEBUG` | `true` (local) | Must be `false` in production |
| `APP_KEY` | _(empty)_ | Required for production |
| `APP_URL` | `http://localhost` | Must be HTTPS in production |
| `TRUSTED_PROXIES` | _(empty)_ | Use `*` or explicit list behind reverse proxy |

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
| `SESSION_SECURE_COOKIE` | `false` local | Must be `true` in production |
| `SESSION_HTTP_ONLY` | `true` | Recommended |
| `SESSION_SAME_SITE` | `lax` | Recommended |

### Davvy Feature and Runtime Flags

| Variable | Default | Notes |
| --- | --- | --- |
| `ENABLE_PUBLIC_REGISTRATION` | `false` | Env default only; setting is generally managed in DB/admin UI |
| `ENABLE_OWNER_SHARE_MANAGEMENT` | `true` | Seeds/initial default for owner sharing |
| `ENABLE_DAV_COMPATIBILITY_MODE` | `false` | Strict DAV validation is default |
| `ENABLE_CONTACT_MANAGEMENT` | `false` | Enables managed contacts UI/API |
| `CONTACT_CHANGE_REQUEST_RETENTION_DAYS` | `90` | Purge horizon for applied/denied queue history |
| `DAV_LOG_CLIENT_TRAFFIC` | `false` | Debug logging for targeted DAV traffic patterns |

### Startup Bootstrap Controls

| Variable | Default | Notes |
| --- | --- | --- |
| `RUN_DB_MIGRATIONS` | `true` | Runs migrations on startup |
| `RUN_DB_SEED` | `false` | Runs seeder on startup |
| `DEFAULT_ADMIN_EMAIL` | _(empty)_ | Used by seeder when seeding enabled |
| `DEFAULT_ADMIN_PASSWORD` | _(empty)_ | Used by seeder when seeding enabled |

## Seeder and Settings Notes

`DatabaseSeeder` behavior relevant to config:
- Creates/updates bootstrap admin when both `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are set.
- Writes app settings for:
  - public registration (disabled)
  - owner share management
  - DAV compatibility mode

Because settings are persisted, environment defaults may no longer be authoritative after seeding/admin toggles.

## Feature Flags in Admin UI

Admin Control Center toggles map to these settings keys:
- `public_registration_enabled`
- `owner_share_management_enabled`
- `dav_compatibility_mode_enabled`
- `contact_management_enabled`
- `contact_change_request_retention_days`

## Production Baseline Recommendations

- `APP_ENV=production`
- `APP_DEBUG=false`
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
