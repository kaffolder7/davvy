# Deployment

Davvy is deployed as a Dockerized Laravel application.

Supported/common targets:
- Railway
- Coolify
- Generic Docker hosts

## Runtime Behavior at Startup

Container entrypoint performs:
1. `php artisan app:preflight`
2. Optional DB bootstrap (`migrate` and optional `db:seed`)
3. Laravel caches (`config`, `route`, `view`)
4. Starts `php-fpm` plus `nginx` on `PORT` (default `8080`)

For PostgreSQL, DB bootstrap is serialized with a PG advisory lock so multi-replica startup does not race.

## Environment Variables

See full reference: [Configuration Reference](./configuration.md)

Minimum production variables:
- `APP_ENV=production`
- `APP_DEBUG=false`
- `APP_KEY` (unique secret, not the local compose dev key)
- `APP_URL`
- `DB_CONNECTION=pgsql`
- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`
- `SESSION_SECURE_COOKIE=true`

Common Davvy feature/runtime vars:
- `ENABLE_PUBLIC_REGISTRATION`
- `ENABLE_OWNER_SHARE_MANAGEMENT`
- `ENABLE_DAV_COMPATIBILITY_MODE`
- `ENABLE_CONTACT_MANAGEMENT`
- `ENABLE_CONTACT_CHANGE_MODERATION`
- `CONTACT_CHANGE_REQUEST_RETENTION_DAYS`
- `ENABLE_AUTOMATED_BACKUPS`
- `BACKUPS_LOCAL_ENABLED`
- `BACKUPS_LOCAL_PATH`
- `BACKUPS_S3_ENABLED`
- `BACKUPS_S3_DISK`
- `BACKUPS_S3_PREFIX`
- `BACKUPS_SCHEDULE_TIMES`
- `BACKUPS_TIMEZONE`
- `BACKUPS_WEEKLY_DAY`
- `BACKUPS_MONTHLY_DAY`
- `BACKUPS_YEARLY_MONTH`
- `BACKUPS_YEARLY_DAY`
- `BACKUPS_RETENTION_DAILY`
- `BACKUPS_RETENTION_WEEKLY`
- `BACKUPS_RETENTION_MONTHLY`
- `BACKUPS_RETENTION_YEARLY`
- `RUN_SCHEDULER`
- `DAV_LOG_CLIENT_TRAFFIC`
- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOWED_ORIGIN_PATTERNS`
- `CORS_ALLOWED_METHODS`
- `CORS_ALLOWED_HEADERS`
- `CORS_MAX_AGE`
- `CORS_SUPPORTS_CREDENTIALS`
- `RUN_DB_MIGRATIONS`
- `RUN_DB_SEED`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`
- `TRUSTED_PROXIES`

Note on `ENABLE_PUBLIC_REGISTRATION`:
- Public registration is ultimately controlled by `app_settings` and admin toggles.
- If seeding runs, public registration is initialized to disabled.

Backup scheduler note:
- When `RUN_SCHEDULER=true` (default), the container runs `php artisan schedule:work` for periodic jobs.
- If you set `RUN_SCHEDULER=false`, you must run `php artisan schedule:run` externally every minute.

## Railway

This repository includes `railway.toml` and production `Dockerfile` support.

Recommended flow:
1. Create Railway project and connect repo.
2. Provision PostgreSQL.
3. Set environment variables.
4. Deploy.
5. Optionally scale replicas.
6. Verify:
   - `/up` returns 200
   - logs include `Preflight checks passed.`
   - `/dav` is reachable

See checklists:
- [Release Checklist (Core)](./release-checklist-core.md)
- [Release Checklist (Railway)](./release-checklist.md)

## Coolify

Davvy supports two Coolify deployment patterns:

### Recommended: Docker Compose + Magic Variables

Use repository `compose.yml` as the application definition.

1. Create a Docker Compose application from this repository.
2. Configure domain + HTTPS in Coolify.
3. Configure health check path `/up`.
4. Set required app/service variables (for example: `APP_KEY`, `SERVICE_URL_APP`, `POSTGRES_DB`, `SERVICE_USER_POSTGRES`, `SERVICE_PASSWORD_POSTGRES`).
5. Keep Coolify UI variable values literal (avoid storing template expressions like `${VAR:-default}` in the UI).
6. Deploy.
7. Optionally scale app replicas; keep database topology intentional for your environment.

### Alternative: Dockerfile-based App

If you prefer a single-service application definition, you can still deploy from the repository `Dockerfile` and provide database connectivity via external/PostgreSQL service variables.

See checklists:
- [Release Checklist (Core)](./release-checklist-core.md)
- [Release Checklist (Coolify)](./release-checklist-coolify.md)

## Generic Docker Host

```bash
docker build -t davvy .
docker run -p 8080:8080 --env-file .env davvy
```

Ensure DB connectivity is available before container startup.

## Production Recommendations

- Keep `SESSION_DRIVER=database` when running multiple replicas.
- Set `TRUSTED_PROXIES=*` (or explicit proxy IPs) behind managed reverse proxies.
- Keep `RUN_DB_SEED=false` after initial bootstrap.
- Use HTTPS and stable `APP_KEY`.
- Set `APP_KEY` via platform secrets and keep it consistent across replicas.
- Runtime startup will fail if `APP_ENV=production` and `APP_KEY` matches the local compose development key.

## Static Asset Caching and Compression

The bundled Nginx config enables:
- `gzip` compression for common text and font asset types.
- Long-lived immutable caching for versioned frontend assets under `/build/assets/*`.
- Revalidation for `/build/manifest.json` so new deploys pick up current asset hashes.

Expected cache behavior:
- `/build/assets/*`: `Cache-Control: public, immutable` with ~1 year TTL.
- `/build/manifest.json`: `Cache-Control: no-cache, must-revalidate`.

## Next References

- [Release Checklist (Core)](./release-checklist-core.md)
- [Release Checklist (Railway)](./release-checklist.md)
- [Release Checklist (Coolify)](./release-checklist-coolify.md)
- [Troubleshooting](./troubleshooting.md)
