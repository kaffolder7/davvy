# Troubleshooting

## Web Auth and Session Issues

### `401` on `GET /api/auth/me`
Usually expected before login.

If unexpected after login:
- Confirm browser accepts cookies for app domain.
- Check `SESSION_DOMAIN`, `SESSION_SECURE_COOKIE`, and HTTPS setup.
- Verify reverse proxy headers/trusted proxies configuration.

### `422` on `POST /api/auth/login`
Credentials are invalid.

Check:
- user exists
- password is correct
- seeded admin values are what you expect

### `403` on `POST /api/auth/register`
Public registration is disabled by setting.

Fix:
- enable from admin UI (`Public registration` toggle), or
- set desired state and ensure seed/app settings do not overwrite it

## Sharing and Permissions

### `422` when creating share
Common causes:
- resource is not marked sharable
- attempting to share with resource owner

### `403` when non-admin manages shares
Owner share management may be disabled by admin.

## Contacts and Queue

### `403` on `/api/contacts*`
Contact management feature is disabled.

Fix:
- enable `Contact management` in admin settings
- ensure required contact schema migrations are present

### Contact save/delete returns queued response (`202`)
This is expected for moderated cross-owner changes.

Next step:
- review and resolve in `Review Queue`

If you prefer direct-apply behavior (personal use):
- disable `Review queue` in admin settings

### Queue request stuck in `manual_merge_needed`
A conflicting update happened after request creation.

Fix:
- use `Edit & Approve` in Review Queue
- provide resolved payload/address-book IDs

### `403` on `/api/contact-change-requests*`
Review queue moderation is disabled.

Fix:
- enable `Review queue` in admin settings (family/team mode), or
- keep disabled for personal mode where queue APIs are intentionally unavailable

## DAV Client and Sync

### `401 Unauthorized` in DAV client
- confirm client uses email/password basic auth
- confirm password not recently changed without client update

### `403 Forbidden` on DAV write/delete
Permission is insufficient:
- `read_only`: no writes
- `editor`: no collection deletes

### `409 Conflict` during CardDAV updates/deletes
Possible causes:
- UID conflict in target address book
- change queued for owner/admin approval
- mirrored-card write rules in Apple compatibility flow

### `InvalidSyncToken`
Client sync token is stale/invalid.

Fix:
- force full re-sync in client
- if needed, remove and re-add account

### Strict payload validation errors
Legacy clients may send non-strict iCalendar/vCard.

Fix:
- temporarily enable `DAV compatibility mode` in admin UI

## Milestone and Mirror Features

### Milestone setting update returns `422`
Required schema tables are missing.

Fix:
- run migrations including contact/milestone tables

### Apple compatibility section shows no target
User lacks default contacts address book.

Fix:
- ensure user has default `contacts` address book
- verify default provisioning succeeded during user creation

## Startup and Deployment

### Preflight fails on startup
Run manually:

```bash
php artisan app:preflight
```

Common failures:
- missing `APP_KEY`
- `APP_DEBUG=true` in production
- non-HTTPS `APP_URL` in production
- `SESSION_SECURE_COOKIE=false` in production
- insecure/default seed password in production

### Startup fails before preflight with APP_KEY error
Common startup guard failures:
- `APP_KEY is required. Set APP_KEY via environment/secrets before startup.`
- `Refusing to start: APP_KEY matches the local development key while APP_ENV=production.`

Fix:
- Set a valid `APP_KEY` in environment/secrets for every deployment.
- In production, use a unique secret key and do not reuse the local compose development key.

### Migrations/seeding race in replicas
With PostgreSQL, startup uses advisory lock to serialize bootstrap.

If issues persist:
- verify all replicas use same DB target
- check logs for advisory lock wait/acquire messages
- consider `RUN_DB_MIGRATIONS=false` and run migrations out-of-band

## Quick Diagnostics

### DDEV

```bash
ddev artisan about
ddev artisan app:preflight
ddev artisan migrate:status
```

### Docker Compose

```bash
docker compose logs -f app
docker compose exec app php artisan app:preflight
docker compose exec app php artisan migrate:status
```

## Related Docs

- [Configuration Reference](./configuration.md)
- [Deployment](./deployment.md)
- [API Reference](./api.md)
- [DAV Client Setup](./clients.md)
