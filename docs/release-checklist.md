# Production Release Checklist ✅

Use this checklist for Railway production releases of Davvy.

## 1. Railway Variables (App Service)

Set these in the **app service** Variables tab.

| Variable | Value | Notes |
| --- | --- | --- |
| `APP_ENV` | `production` | Required |
| `APP_DEBUG` | `false` | Required |
| `APP_KEY` | `base64:<generated-key>` | Required; generate once and keep stable |
| `APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Required; use your custom domain if configured |
| `DB_CONNECTION` | `pgsql` | Required |
| `DB_HOST` | `${{Postgres.PGHOST}}` | Required reference variable |
| `DB_PORT` | `${{Postgres.PGPORT}}` | Required reference variable |
| `DB_DATABASE` | `${{Postgres.PGDATABASE}}` | Required reference variable |
| `DB_USERNAME` | `${{Postgres.PGUSER}}` | Required reference variable |
| `DB_PASSWORD` | `${{Postgres.PGPASSWORD}}` | Required reference variable |
| `SESSION_DRIVER` | `database` | Recommended |
| `SESSION_SECURE_COOKIE` | `true` | Required in production |
| `SESSION_HTTP_ONLY` | `true` | Recommended |
| `SESSION_SAME_SITE` | `lax` | Recommended |
| `CACHE_STORE` | `database` | Recommended |
| `QUEUE_CONNECTION` | `database` | Recommended |
| `TRUSTED_PROXIES` | `*` | Recommended behind Railway proxy |
| `ENABLE_PUBLIC_REGISTRATION` | `false` | Secure default |
| `ENABLE_OWNER_SHARE_MANAGEMENT` | `true` | Product default |
| `ENABLE_DAV_COMPATIBILITY_MODE` | `false` | Secure default (strict mode) |
| `ENABLE_CONTACT_MANAGEMENT` | `false` | Secure default for gated contact UI/API |
| `RUN_DB_MIGRATIONS` | `true` | Recommended; set `false` only if migrations run out-of-band |
| `RUN_DB_SEED` | `false` | Secure default; opt-in only for bootstrap |
| `DEFAULT_ADMIN_EMAIL` | *(empty)* | Set only when `RUN_DB_SEED=true` |
| `DEFAULT_ADMIN_PASSWORD` | *(empty)* | Set only when `RUN_DB_SEED=true` |

## 2. Optional One-Time Admin Bootstrap

If you want automatic admin creation from seeding:

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
3. Health endpoint returns 200:
   - `GET /up`
4. App routes respond:
   - `GET /`
   - `GET /.well-known/caldav` -> 301 to `/dav`
   - `GET /.well-known/carddav` -> 301 to `/dav`
5. Login works for an admin account.
6. DAV endpoint reachable:
   - `/dav`
7. DB migrations applied successfully (no pending migration errors).
8. If replicas > 1, logs show advisory-lock serialization during startup and no migration race errors.

## 4. Post-Deploy Security Quick Check

1. Verify `APP_DEBUG=false`.
2. Verify `SESSION_SECURE_COOKIE=true`.
3. Verify `ENABLE_DAV_COMPATIBILITY_MODE=false` unless needed for legacy clients.
4. Verify no demo/default credentials are present.
5. Ensure your custom domain uses HTTPS.
