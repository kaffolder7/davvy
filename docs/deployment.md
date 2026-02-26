# Deployment ☁️

## Railway

This repo includes [`railway.toml`](../railway.toml) and a production `Dockerfile`.

### Required environment variables

- `APP_KEY` (required in production; do not auto-generate per restart)
- `APP_URL`
- `DB_CONNECTION=pgsql`
- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`
- `SESSION_SECURE_COOKIE=true`
- `ENABLE_PUBLIC_REGISTRATION` (optional)
- `ENABLE_OWNER_SHARE_MANAGEMENT` (optional)
- `ENABLE_DAV_COMPATIBILITY_MODE` (optional)
- `RUN_DB_MIGRATIONS` (optional, default `true`)
- `TRUSTED_PROXIES` (recommended, e.g. `*` behind managed reverse proxy)

### Optional bootstrap admin seeding

- `RUN_DB_MIGRATIONS=true` runs `php artisan migrate` on startup (default).
- `RUN_DB_SEED=true` to execute `php artisan db:seed` on startup.
- If `RUN_DB_SEED=true`, set both:
  - `DEFAULT_ADMIN_EMAIL`
  - `DEFAULT_ADMIN_PASSWORD`
- In production, avoid the default demo password and use a strong secret.

### Replica behavior (Railway)

- Davvy supports deployment with one or more app replicas on Railway.
- On PostgreSQL, startup DB bootstrap is serialized by a PostgreSQL advisory lock to avoid race conditions across replicas.
- With replicas, each instance may run `migrate` sequentially under the lock (subsequent runs are typically no-op), while optional `db:seed` runs only on the lock leader.
- Keep `SESSION_DRIVER=database` to avoid sticky-session requirements when requests are load-balanced across replicas.
- If you prefer running migrations out-of-band, set `RUN_DB_MIGRATIONS=false` and execute migrations as a separate one-off deploy task.

### Deploy flow

1. Create Railway project linked to this repo.
2. Provision PostgreSQL.
3. Set env vars.
4. Deploy.
5. (Optional) Increase app replicas in Railway service settings for horizontal scaling.
6. Verify health at `/up`.
7. Verify startup preflight logs report success.

See also:
- [Production Release Checklist (Railway)](./release-checklist.md)

## Coolify (Self-Hosted or Coolify Cloud)

Davvy deploys on Coolify using the same production `Dockerfile`; no code changes are required.

### Required environment variables

- `APP_KEY` (required in production; do not auto-generate per restart)
- `APP_URL`
- `DB_CONNECTION=pgsql`
- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`
- `SESSION_SECURE_COOKIE=true`
- `ENABLE_PUBLIC_REGISTRATION` (optional)
- `ENABLE_OWNER_SHARE_MANAGEMENT` (optional)
- `ENABLE_DAV_COMPATIBILITY_MODE` (optional)
- `RUN_DB_MIGRATIONS` (optional, default `true`)
- `TRUSTED_PROXIES` (recommended, e.g. `*` behind managed reverse proxy)

### Optional bootstrap admin seeding

- `RUN_DB_MIGRATIONS=true` runs `php artisan migrate` on startup (default).
- `RUN_DB_SEED=true` to execute `php artisan db:seed` on startup.
- If `RUN_DB_SEED=true`, set both:
  - `DEFAULT_ADMIN_EMAIL`
  - `DEFAULT_ADMIN_PASSWORD`
- In production, avoid the default demo password and use a strong secret.

### Replica behavior (Coolify)

- Davvy supports deployment with one or more app replicas on Coolify.
- On PostgreSQL, startup DB bootstrap is serialized by a PostgreSQL advisory lock to avoid race conditions across replicas.
- With replicas, each instance may run `migrate` sequentially under the lock (subsequent runs are typically no-op), while optional `db:seed` runs only on the lock leader.
- Keep `SESSION_DRIVER=database` to avoid sticky-session requirements when requests are load-balanced across replicas.
- If you prefer running migrations out-of-band, set `RUN_DB_MIGRATIONS=false` and execute migrations as a separate one-off deploy task.

### Deploy flow

1. Create a new **Application** in Coolify from this repo and select the repository `Dockerfile`.
2. Provision PostgreSQL in Coolify (or connect an external PostgreSQL service).
3. Set env vars.
4. Configure health check path to `/up`.
5. Deploy.
6. (Optional) Increase app replicas in Coolify service settings for horizontal scaling.
7. Verify startup preflight logs report success.

See also:
- [Production Release Checklist (Coolify)](./release-checklist-coolify.md)

## Generic Docker Host 🐳

```bash
docker build -t davvy .
docker run -p 8080:8080 --env-file .env davvy
```

Ensure DB connectivity before app startup.
