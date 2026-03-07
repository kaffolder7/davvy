# Production Release Checklist (Coolify) ✅

Use this Coolify supplement with the shared checklist:
- [Production Release Checklist (Core)](./release-checklist-core.md)

## 1. Coolify Application Setup

1. Create an application from this repository using the project `Dockerfile`.
2. Set the public port to `8080` (or map service port to container port `8080`).
3. Configure health check path as `/up`.
4. Configure a public domain and HTTPS.
5. Provision or connect a PostgreSQL service.

## 2. Coolify Variable Mappings

Set the core variables from [Production Release Checklist (Core)](./release-checklist-core.md), using these Coolify-specific values:

| Variable | Coolify Value | Notes |
| --- | --- | --- |
| `APP_URL` | `https://<your-domain>` | Use your production domain |
| `DB_HOST` | `<postgres-host>` | Coolify PostgreSQL service host or external host |
| `DB_PORT` | `5432` | Use non-default value only if required |
| `DB_DATABASE` | `<postgres-db>` | PostgreSQL database name |
| `DB_USERNAME` | `<postgres-user>` | PostgreSQL username |
| `DB_PASSWORD` | `<postgres-password>` | PostgreSQL password |
| `TRUSTED_PROXIES` | `*` | Recommended behind Coolify proxy |

## 3. Coolify Verification Notes

After deployment, complete the checks in [Production Release Checklist (Core)](./release-checklist-core.md) and confirm:

1. Logs include `Preflight checks passed.` from `php artisan app:preflight`.
2. If replicas > 1, logs show advisory-lock serialization during startup and no migration race errors.
