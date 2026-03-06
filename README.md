# Davvy ✨

<!--[![Lint & Format Checks](https://img.shields.io/github/actions/workflow/status/kaffolder7/davvy/lint-checks.yml?label=Lint%20%26%20Format)](https://github.com/kaffolder7/davvy/actions/workflows/lint-checks.yml) [![Release Image](https://img.shields.io/github/actions/workflow/status/kaffolder7/davvy/release-image.yml?label=Release%20Image)](https://github.com/kaffolder7/davvy/actions/workflows/release-image.yml) [![Latest Release](https://img.shields.io/github/v/release/kaffolder7/davvy?label=Latest%20Release)](https://github.com/kaffolder7/davvy/releases) [![License](https://img.shields.io/github/license/kaffolder7/davvy)](https://github.com/kaffolder7/davvy/blob/main/LICENSE)-->
[![Lint & Format Checks](https://github.com/kaffolder7/davvy/actions/workflows/lint-checks.yml/badge.svg?branch=main)](https://github.com/kaffolder7/davvy/actions/workflows/lint-checks.yml)
[![Release Image](https://github.com/kaffolder7/davvy/actions/workflows/release-image.yml/badge.svg)](https://github.com/kaffolder7/davvy/actions/workflows/release-image.yml)

Davvy is a Laravel + React app that combines a web admin/dashboard experience with a built-in SabreDAV CalDAV/CardDAV server.

It is designed for:
- Multi-user calendar and address-book hosting
- Share-based collaboration (`read_only`, `editor`, `admin`)
- Browser-based administration and operational controls
- DAV client interoperability with strict validation plus compatibility mode when needed

## Core Capabilities 🚀

### Identity and Access 🔐
- Session-based web auth (`/api/auth/*`)
- DAV basic auth at `/dav`
- Roles: `admin`, `regular`
- Feature flags controlled by admins (public registration, owner sharing, contact management, review queue moderation, DAV compatibility mode)

### Calendars and Address Books 🗓️
- Default `Personal Calendar` and `Contacts` resources provisioned for each new user
- Owned + shared resource visibility in web dashboard
- Create, rename, mark sharable, and export resources
- Per-resource permission enforcement for web and DAV access

### Sharing 🤝
- Share permissions:
  - `read_only`: view only
  - `editor`: write/update, no collection delete
  - `admin`: full write + collection delete
- Owner-managed sharing can be globally disabled by admin
- Admin global sharing controls across all users/resources

### Contacts and Advanced Workflows 👥
- Managed contact UI (feature-gated)
- Contact writes synchronized to vCards in assigned address books
- CardDAV writes synchronized back into managed contacts
- Optional contact change moderation queue for cross-owner edits (opt-in, default off for personal deployments)
- Birthday/anniversary generated milestone calendars per address book
- Apple compatibility mirror mode (selected sources mirrored into user's default `contacts` book)

### DAV and Interoperability 🔌
- CalDAV/CardDAV endpoint: `/dav`
- Autodiscovery redirects:
  - `/.well-known/caldav`
  - `/.well-known/carddav`
- Sync-token incremental change tracking (`added`, `modified`, `deleted`)
- Strict payload validation by default (toggle compatibility mode for legacy clients)

### Runtime and Deployment 🛠️
- Docker-first runtime with preflight checks (`php artisan app:preflight`)
- Railway and Coolify deployment support
- PostgreSQL advisory-lock startup bootstrap for multi-replica safety

## Documentation Map 📚

- [User Guide](docs/user-guide.md)
- [API Reference](docs/api.md)
- [DAV Client Setup](docs/clients.md)
- [Architecture](docs/architecture.md)
- [Configuration Reference](docs/configuration.md)
- [Deployment Guide](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Release Checklist (Railway)](docs/release-checklist.md)
- [Release Checklist (Coolify)](docs/release-checklist-coolify.md)
- [Landing Site (GitHub Pages)](docs/landing/README.md)

## Quick Start (Docker) 🐳

1. Start app + database:

```bash
docker compose up --build
```

2. Open:
- App UI: `http://localhost:8080`
- Health: `http://localhost:8080/up`
- DAV: `http://localhost:8080/dav`

3. Default admin credentials from `compose.yml`:
- Email: `admin@davvy.local`
- Password: `ChangeMe123!`

Notes 💡:
- The default compose setup enables seed-on-start (`RUN_DB_SEED=true`).
- The default compose setup includes a fixed local development `APP_KEY` for deterministic startup.
- Do not reuse that local development `APP_KEY` for internet-facing production deployments.
- If `DEFAULT_ADMIN_EMAIL` or `DEFAULT_ADMIN_PASSWORD` is empty, no bootstrap admin is created.

## Local Development (DDEV) 💻

```bash
ddev start
ddev composer install
ddev npm install
cp .env.ddev.example .env
ddev artisan key:generate
ddev artisan migrate --seed
```

Create a local admin if needed:

```bash
ddev exec sh -lc "DEFAULT_ADMIN_EMAIL='admin@davvy.local' DEFAULT_ADMIN_PASSWORD='ChangeMe123!' php artisan db:seed --force --no-interaction"
```

Run assets:

```bash
ddev vite
```

Access 🔗:
- App: `https://davvy.ddev.site`
- DAV: `https://davvy.ddev.site/dav`

## Testing ✅

Run test suite:

```bash
ddev artisan test
```

Or via Docker:

```bash
docker build --target ci-test -t davvy-ci-test .
docker run --rm davvy-ci-test
```

## Deployment 🚢

Davvy is deployed as a Docker image. See:
- [Deployment](docs/deployment.md)
- [Release Checklist (Railway)](docs/release-checklist.md)
- [Release Checklist (Coolify)](docs/release-checklist-coolify.md)

## License 📄

Davvy Source-Available License 1.0 (DSAL-1.0) ([LICENSE](LICENSE))

Commercial internal use is allowed. Selling the software, or offering a
competing hosted service, requires a separate written commercial agreement from
the maintainer.

Contributions are accepted under [CLA.md](CLA.md). See [CONTRIBUTING.md](CONTRIBUTING.md).
Commercial terms can be requested via [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).
