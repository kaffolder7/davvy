# Architecture 🏗️

## Stack

- Backend: Laravel 12 (PHP 8.4 target)
- DAV protocol: SabreDAV (`sabre/dav`) CalDAV + CardDAV plugins
- Frontend: React 18 + TailwindCSS + Vite
- Database: PostgreSQL (default via Docker)

## Data Model 🗂️

- `users`: login + role (`admin` or `regular`)
- `calendars`: user-owned calendars
- `calendar_objects`: iCalendar resources (`.ics`)
- `address_books`: user-owned address books
- `cards`: vCard resources (`.vcf`)
- `resource_shares`: per-resource permissions (`read_only`, `admin`)
- `app_settings`: global toggles (`public_registration_enabled`, `owner_share_management_enabled`, `dav_compatibility_mode_enabled`)
- `dav_resource_sync_states`: per-resource DAV sync tokens
- `dav_resource_sync_changes`: sync change feed (`added`, `modified`, `deleted`)

## Permissions 🔐

- Owners always have full edit.
- Shared users can be:
  - `read_only`
  - `admin` (full edit)
- Admin users can manage users and all shares globally.
- Non-admin owners can manage shares for their own resources when owner-share-management is enabled.

## Release Hardening 🛡️

- Auth endpoints are rate-limited (`/api/auth/login`, `/api/auth/register`).
- Container startup runs `app:preflight` before migrations.
- Default admin seeding is opt-in via `RUN_DB_SEED=true` and explicit admin credentials.

## DAV Layer 🌐

Custom SabreDAV backends:

- `LaravelAuthBackend`: basic auth via Laravel password hashes
- `LaravelPrincipalBackend`: principals from `users`
- `LaravelCalendarBackend`: CalDAV storage from `calendars` + `calendar_objects`
- `LaravelCardDavBackend`: CardDAV storage from `address_books` + `cards`

Endpoint:

- `/dav/*`

Autodiscovery redirects:

- `/.well-known/caldav` -> `/dav`
- `/.well-known/carddav` -> `/dav`

## Validation + Sync Improvements ✅

- Calendar payloads are validated and normalized as VCALENDAR content.
- Card payloads are validated and normalized as VCARD content.
- Strict RFC-oriented validation is the default, with an admin-controlled DAV compatibility mode for legacy clients.
- DAV incremental sync now tracks added/modified/deleted resources with per-collection sync tokens.

## Default Resources 🎯

On user creation, Davvy auto-provisions:
- `Personal Calendar` (`/personal-calendar`)
- `Contacts` (`/contacts`)
