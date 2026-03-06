# Production Release Checklist (Railway) ✅

Use this Railway supplement with the shared checklist:
- [Production Release Checklist (Core)](./release-checklist-core.md)

## 1. Railway Setup

1. Create a Railway project and connect this repository.
2. Provision a PostgreSQL service in the same project.
3. Confirm app service has a public domain and HTTPS enabled.
4. Configure health check path as `/up`.

## 2. Railway Variable Mappings

Set the core variables from [Production Release Checklist (Core)](./release-checklist-core.md), using these Railway-specific values:

| Variable | Railway Value | Notes |
| --- | --- | --- |
| `APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Use your custom domain if configured |
| `DB_HOST` | `${{Postgres.PGHOST}}` | Reference variable |
| `DB_PORT` | `${{Postgres.PGPORT}}` | Reference variable |
| `DB_DATABASE` | `${{Postgres.PGDATABASE}}` | Reference variable |
| `DB_USERNAME` | `${{Postgres.PGUSER}}` | Reference variable |
| `DB_PASSWORD` | `${{Postgres.PGPASSWORD}}` | Reference variable |
| `TRUSTED_PROXIES` | `*` | Recommended behind Railway proxy |

## 3. Railway Verification Notes

After deployment, complete the checks in [Production Release Checklist (Core)](./release-checklist-core.md) and confirm:

1. Logs include `Preflight checks passed.` from `php artisan app:preflight`.
2. If replicas > 1, logs show advisory-lock serialization during startup and no migration race errors.
