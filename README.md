# Davvy 🚀

<!--[![Lint & Format Checks](https://img.shields.io/github/actions/workflow/status/kaffolder7/davvy/lint-checks.yml?label=Lint%20%26%20Format)](https://github.com/kaffolder7/davvy/actions/workflows/lint-checks.yml) [![Release Image](https://img.shields.io/github/actions/workflow/status/kaffolder7/davvy/release-image.yml?label=Release%20Image)](https://github.com/kaffolder7/davvy/actions/workflows/release-image.yml) [![Latest Release](https://img.shields.io/github/v/release/kaffolder7/davvy?label=Latest%20Release)](https://github.com/kaffolder7/davvy/releases) [![License](https://img.shields.io/github/license/kaffolder7/davvy)](https://github.com/kaffolder7/davvy/blob/main/LICENSE)-->
[![Lint & Format Checks](https://github.com/kaffolder7/davvy/actions/workflows/lint-checks.yml/badge.svg?branch=main)](https://github.com/kaffolder7/davvy/actions/workflows/lint-checks.yml) [![Release Image](https://github.com/kaffolder7/davvy/actions/workflows/release-image.yml/badge.svg?branch=main)](https://github.com/kaffolder7/davvy/actions/workflows/release-image.yml) [Latest Release](https://github.com/kaffolder7/davvy/releases) [License](https://github.com/kaffolder7/davvy/blob/main/LICENSE) [![PHP](https://img.shields.io/badge/PHP-8.4-777BB4?logo=php&logoColor=white)](https://www.php.net/releases/8.4/en.php) [![Laravel](https://img.shields.io/badge/Laravel-12-FF2D20?logo=laravel&logoColor=white)](https://laravel.com/docs/12.x) [![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=000000)](https://react.dev/) [![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

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
- Docker packaging + deployment docs for Railway or Coolify (single replica or scaled replicas)
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
- `RUN_DB_MIGRATIONS` (set `false` only when you run migrations out-of-band)
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

Davvy is packaged as a Dockerized app and can be deployed on Railway or Coolify.

Railway is configured via [`railway.toml`](railway.toml).  
Coolify can deploy the same [`Dockerfile`](Dockerfile) without code changes.

Production startup runs `php artisan app:preflight` before DB bootstrap so insecure configuration fails fast.

When deployed with PostgreSQL on Railway or Coolify, startup DB bootstrap (`migrate` and optional `db:seed`) is guarded by a PostgreSQL advisory lock, so the app can safely run with one or more replicas.

See docs:
- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)
- [DAV Client Setup](docs/clients.md)
- [Deployment](docs/deployment.md) (Railway, Coolify, etc.)
- [Release Checklist (Railway)](docs/release-checklist.md)
- [Release Checklist (Coolify)](docs/release-checklist-coolify.md)
