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
- `TRUSTED_PROXIES` (recommended, e.g. `*` behind managed reverse proxy)

### Optional bootstrap admin seeding

- `RUN_DB_SEED=true` to execute `php artisan db:seed` on startup.
- If `RUN_DB_SEED=true`, set both:
  - `DEFAULT_ADMIN_EMAIL`
  - `DEFAULT_ADMIN_PASSWORD`
- In production, avoid the default demo password and use a strong secret.

### Deploy flow

1. Create Railway project linked to this repo.
2. Provision PostgreSQL.
3. Set env vars.
4. Deploy.
5. Verify health at `/up`.
6. Verify startup preflight logs report success.

See also: [Production Release Checklist](./release-checklist.md)

## Generic Docker Host 🐳

```bash
docker build -t davvy .
docker run -p 8080:8080 --env-file .env davvy
```

Ensure DB connectivity before app startup.
