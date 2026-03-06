# Production Release Checklist (Core) ✅

Use this checklist for every production release, regardless of platform.

## 1. Common App Environment Variables

Set these in your app service environment.

| Variable | Value | Notes |
| --- | --- | --- |
| `APP_ENV` | `production` | Required |
| `APP_DEBUG` | `false` | Required |
| `APP_KEY` | `base64:<generated-key>` | Required; generate once and keep stable across replicas |
| `APP_URL` | `https://<your-domain>` | Required |
| `DB_CONNECTION` | `pgsql` | Required |
| `DB_HOST` | platform-specific | Required |
| `DB_PORT` | `5432` | Required unless your PostgreSQL uses a different port |
| `DB_DATABASE` | platform-specific | Required |
| `DB_USERNAME` | platform-specific | Required |
| `DB_PASSWORD` | platform-specific | Required |
| `SESSION_DRIVER` | `database` | Recommended |
| `SESSION_SECURE_COOKIE` | `true` | Required in production |
| `SESSION_HTTP_ONLY` | `true` | Recommended |
| `SESSION_SAME_SITE` | `lax` | Recommended |
| `CORS_ALLOWED_ORIGINS` | *(empty)* | Recommended for same-origin deployments; set explicit origins only when needed |
| `CORS_SUPPORTS_CREDENTIALS` | `false` | Recommended; if `true`, do not use wildcard origins |
| `CACHE_STORE` | `database` | Recommended |
| `QUEUE_CONNECTION` | `database` | Recommended |
| `TRUSTED_PROXIES` | `*` or explicit proxies | Recommended behind reverse proxy |
| `ENABLE_PUBLIC_REGISTRATION` | `false` | Env default only; setting is primarily managed via app settings/admin toggle |
| `ENABLE_OWNER_SHARE_MANAGEMENT` | `true` | Product default |
| `ENABLE_DAV_COMPATIBILITY_MODE` | `false` | Secure default (strict mode) |
| `ENABLE_CONTACT_MANAGEMENT` | `false` | Secure default for gated contacts UI/API |
| `ENABLE_CONTACT_CHANGE_MODERATION` | `false` | Default-off moderation mode for collaborative deployments |
| `CONTACT_CHANGE_REQUEST_RETENTION_DAYS` | `90` | Queue history purge horizon for applied/denied requests |
| `DAV_LOG_CLIENT_TRAFFIC` | `false` | Optional targeted DAV traffic debug logging |
| `RUN_DB_MIGRATIONS` | `true` | Recommended; set `false` only if migrations run out-of-band |
| `RUN_DB_SEED` | `false` | Secure default; opt-in only for bootstrap |
| `DEFAULT_ADMIN_EMAIL` | *(empty)* | Set only when `RUN_DB_SEED=true` |
| `DEFAULT_ADMIN_PASSWORD` | *(empty)* | Set only when `RUN_DB_SEED=true` |

## 2. Optional One-Time Admin Bootstrap

If you want automatic admin creation via seeding:

1. Set:
   - `RUN_DB_SEED=true`
   - `DEFAULT_ADMIN_EMAIL=<admin email>`
   - `DEFAULT_ADMIN_PASSWORD=<strong random password>`
2. Deploy once.
3. Confirm admin login works.
4. Set `RUN_DB_SEED=false` and remove `DEFAULT_ADMIN_PASSWORD`.

## 3. Deploy Sanity Checks

1. Deploy succeeds and container starts.
2. Logs include `Preflight checks passed.` from `php artisan app:preflight`.
3. Health endpoint returns `200`:
   - `GET /up`
4. App routes respond:
   - `GET /`
   - `GET /.well-known/caldav` -> `301` to `/dav`
   - `GET /.well-known/carddav` -> `301` to `/dav`
5. Login works for an admin account.
6. DAV endpoint is reachable:
   - `/dav`
7. DB migrations are applied successfully (no pending migration errors).
8. If replicas > 1, logs show advisory-lock serialization during startup and no migration race errors.

## 4. Post-Deploy Security Quick Check

1. Verify `APP_DEBUG=false`.
2. Verify `SESSION_SECURE_COOKIE=true`.
3. Verify `ENABLE_DAV_COMPATIBILITY_MODE=false` unless needed for legacy clients.
4. Verify no demo/default credentials are present.
5. Ensure your custom domain uses HTTPS.

## 5. Platform Supplements

- [Railway Supplement](./release-checklist.md)
- [Coolify Supplement](./release-checklist-coolify.md)
