# Davvy 🚀

Davvy is an MVP Laravel + React + Tailwind web app for managing users, calendars, and address books backed by a SabreDAV (`sabre/dav`) CalDAV/CardDAV server.

## Why SabreDAV? 🧩

This MVP uses `sabre/dav` because:
- It embeds directly into Laravel/PHP app logic.
- CalDAV + CardDAV storage is fully customizable with your own DB models.
- User/role/sharing workflows stay in one codebase.

## MVP Features ✨

- Laravel `12.x` backend + React/Tailwind frontend
- PHP `8.4` runtime target
- Admin + regular users
- Public registration toggle (default OFF)
- Owner-sharing toggle (admin-controlled, default ON)
- DAV compatibility mode toggle (admin-controlled, default OFF/strict mode)
- Admin-created users
- Automatic default calendar + address book per new user
- Dashboard views for:
  - Owned calendars/address books
  - Shared-with-you calendars/address books
  - Permission badges (`Read-only`, `Full Edit`)
- Owner and admin share assignment/revocation flows
- SabreDAV CalDAV/CardDAV endpoint at `/dav`
- Autodiscovery redirects for `/.well-known/caldav` and `/.well-known/carddav`
- ICS/vCard validation and normalization for stronger client interoperability
- DAV sync token change tracking with `added`, `modified`, and `deleted` deltas
- Docker packaging + Railway deployment config
- PHPUnit tests for key workflows

## Quick Start (Docker) 🐳

1. Build and run:

```bash
docker compose up --build
```

2. Open app:

- UI: `http://localhost:8080`
- Health: `http://localhost:8080/up`
- DAV endpoint: `http://localhost:8080/dav`

3. Default admin credentials (from `compose.yml` defaults):

- Email: `admin@davvy.local`
- Password: `ChangeMe123!`

> [!NOTE]
> If `RUN_DB_SEED=false` or either `DEFAULT_ADMIN_EMAIL`/`DEFAULT_ADMIN_PASSWORD` is empty, this user will not be created.

Configurable envs:
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`
- `ENABLE_PUBLIC_REGISTRATION`
- `ENABLE_OWNER_SHARE_MANAGEMENT`
- `ENABLE_DAV_COMPATIBILITY_MODE`
- `RUN_DB_SEED` (set `true` to run `db:seed` at container start)
- `SESSION_SECURE_COOKIE`
- `TRUSTED_PROXIES`

## Local Development with DDEV 🧰

This repo includes a `.ddev/` setup for local development convenience and does not replace the existing Docker workflows used for deployment/CI.

1. Start DDEV:

```bash
ddev start
```

2. Install dependencies:

```bash
ddev composer install
ddev npm install
```

3. Use DDEV-oriented environment config:

```bash
cp .env.ddev.example .env
ddev artisan key:generate
ddev artisan migrate --seed
```

4. Bootstrap a local admin user (recommended when public registration is disabled):

```bash
ddev exec sh -lc "DEFAULT_ADMIN_EMAIL='admin@davvy.local' DEFAULT_ADMIN_PASSWORD='ChangeMe123!' php artisan db:seed --force --no-interaction"
```

> [!NOTE]
> Your `.env.ddev.example` intentionally leaves `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` empty, so no default admin exists until you seed one.

5. Start frontend assets (required before opening the app URL):

```bash
ddev vite
```

Keep `ddev vite` running in its own terminal for hot reload.  
If you prefer not to run Vite in watch mode, build assets once with:

```bash
ddev npm run build
```

6. Access services:
- App URL: `https://davvy.ddev.site`
- DAV endpoint: `https://davvy.ddev.site/dav`
- Vite dev server: `https://davvy.ddev.site:5173` (from `ddev vite`)

Auth troubleshooting:
- `401` on `GET /api/auth/me` before sign-in is expected.
- `422` on `POST /api/auth/login` means the submitted credentials do not match a seeded user.

7. Run tests:

```bash
ddev artisan test
```

## Running Tests 🧪

```bash
docker compose run --build --rm --user root --entrypoint sh app -lc "cp .env.example .env && composer install --prefer-dist --no-interaction && APP_ENV=testing APP_KEY='base64:MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=' DB_CONNECTION=sqlite DB_DATABASE=':memory:' CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=array php artisan test"
```

## Deployment ☁️

Railway is configured via [`railway.toml`](railway.toml).

Production startup now runs `php artisan app:preflight` before migrations so insecure configuration fails fast.

See docs:
- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)
- [DAV Client Setup](docs/clients.md)
- [Deployment](docs/deployment.md)
- [Release Checklist](docs/release-checklist.md)
