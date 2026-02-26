# Davvy

Davvy is an MVP Laravel + React + Tailwind web application for managing users, calendars, and address books backed by a SabreDAV (`sabre/dav`) CalDAV/CardDAV server.

## MVP Features

- Laravel backend + React/Tailwind frontend
- Admin and regular users
- Public registration toggle (default OFF)
- Admin-created users
- Automatic default calendar + address book creation for each new user
- User dashboard with:
  - Owned calendars/address books
  - Shared calendars/address books
  - Visual permission labels (`Read-only`, `Full Edit`)
- Sharable resource toggle per calendar/address book
- Admin screen to assign/revoke share permissions
- Built-in CalDAV/CardDAV endpoint via SabreDAV at `/dav`
- Autodiscovery redirects for `/.well-known/caldav` and `/.well-known/carddav`
- Docker packaging + Railway deployment config
- PHPUnit tests for key workflows

## Quick Start (Docker)

1. Build and run:

```bash
docker compose up --build
```

2. Open app:

- UI: `http://localhost:8080`
- Health: `http://localhost:8080/up`
- DAV endpoint: `http://localhost:8080/dav`

3. Default admin credentials:

- Email: `admin@davvy.local`
- Password: `ChangeMe123!`

Change these with env vars:
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

## Running Tests

```bash
docker compose run --rm app php artisan test
```

## Deployment

Railway is configured using [`railway.toml`](railway.toml).

See docs:
- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)
- [DAV Client Setup](docs/clients.md)
- [Deployment](docs/deployment.md)
