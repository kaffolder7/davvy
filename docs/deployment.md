# Deployment ☁️

## Railway

This repo includes [`railway.toml`](../railway.toml) and a production `Dockerfile`.

### Required environment variables

- `APP_KEY` (set after first deploy or pre-generate)
- `APP_URL`
- `DB_CONNECTION=pgsql`
- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DEFAULT_ADMIN_EMAIL` (optional)
- `DEFAULT_ADMIN_PASSWORD` (optional)
- `ENABLE_PUBLIC_REGISTRATION` (optional)
- `ENABLE_OWNER_SHARE_MANAGEMENT` (optional)

### Deploy flow

1. Create Railway project linked to this repo.
2. Provision PostgreSQL.
3. Set env vars.
4. Deploy.
5. Verify health at `/up`.

## Generic Docker Host 🐳

```bash
docker build -t davvy .
docker run -p 8080:8080 --env-file .env davvy
```

Ensure DB connectivity before app startup.
