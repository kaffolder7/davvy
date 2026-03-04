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
4. PHP built-in server on `PORT` (default `8080`)

For PostgreSQL, DB bootstrap is serialized with a PG advisory lock so multi-replica startup does not race.

## Environment Variables

See full reference: [Configuration Reference](./configuration.md)

Minimum production variables:
- `APP_ENV=production`
- `APP_DEBUG=false`
- `APP_KEY`
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
- `CONTACT_CHANGE_REQUEST_RETENTION_DAYS`
- `DAV_LOG_CLIENT_TRAFFIC`
- `RUN_DB_MIGRATIONS`
- `RUN_DB_SEED`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`
- `TRUSTED_PROXIES`

Note on `ENABLE_PUBLIC_REGISTRATION`:
- Public registration is ultimately controlled by `app_settings` and admin toggles.
- If seeding runs, public registration is initialized to disabled.

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

See checklist: [Release Checklist (Railway)](./release-checklist.md)

## Coolify

Davvy deploys to Coolify using the same production Dockerfile.

Recommended flow:
1. Create Application from repository Dockerfile.
2. Provision or connect PostgreSQL.
3. Set environment variables.
4. Configure health check path `/up`.
5. Deploy.
6. Optionally scale replicas.
7. Verify logs and endpoints as above.

See checklist: [Release Checklist (Coolify)](./release-checklist-coolify.md)

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

## Next References

- [Release Checklist (Railway)](./release-checklist.md)
- [Release Checklist (Coolify)](./release-checklist-coolify.md)
- [Troubleshooting](./troubleshooting.md)
