# Production Release Checklist (Coolify) ✅

Use this Coolify supplement with the shared checklist:
- [Production Release Checklist (Core)](./release-checklist-core.md)

## 1. Coolify Application Setup

1. Create a Docker Compose application from this repository using `compose.yml`.
2. Configure a public domain and HTTPS.
3. Configure health check path as `/up`.
4. Provision or connect a PostgreSQL service.
5. Keep Coolify environment values as literal values (no nested template expressions in UI variables).

## 2. Coolify Variable Mappings

Set the core variables from [Production Release Checklist (Core)](./release-checklist-core.md), using these Coolify-specific values:

| Variable | Coolify Value | Notes |
| --- | --- | --- |
| `APP_KEY` | `base64:<generated-key>` | Generate once and keep stable across replicas |
| `SERVICE_URL_APP` | `https://<your-domain>` | Compose maps this to `APP_URL` |
| `POSTGRES_DB` | `<postgres-db>` | Database name used by app + postgres service |
| `SERVICE_USER_POSTGRES` | `<postgres-user>` | Shared by app + postgres service |
| `SERVICE_PASSWORD_POSTGRES` | `<postgres-password>` | Shared by app + postgres service |
| `TRUSTED_PROXIES` | `*` | Recommended behind Coolify proxy |
| `RUN_DB_SEED` | `false` | Enable only for one-time bootstrap |
| `DEFAULT_ADMIN_EMAIL` | *(empty)* | Set only when `RUN_DB_SEED=true` |
| `DEFAULT_ADMIN_PASSWORD` | *(empty)* | Set only when `RUN_DB_SEED=true` |

## 3. Coolify Verification Notes

After deployment, complete the checks in [Production Release Checklist (Core)](./release-checklist-core.md) and confirm:

1. Logs include `Preflight checks passed.` from `php artisan app:preflight`.
2. If replicas > 1, logs show advisory-lock serialization during startup and no migration race errors.
3. If using one-time bootstrap admin creation, set `RUN_DB_SEED=false` and clear both `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` after first successful deploy.
