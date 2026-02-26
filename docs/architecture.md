# Architecture

## Stack

- Backend: Laravel 11 (PHP 8.3)
- DAV protocol: SabreDAV (`sabre/dav`) CalDAV + CardDAV plugins
- Frontend: React 18 + TailwindCSS + Vite
- Database: PostgreSQL (default via Docker)

## Data Model

- `users`: login + role (`admin` or `regular`)
- `calendars`: user-owned calendars
- `calendar_objects`: iCalendar resources (`.ics`)
- `address_books`: user-owned address books
- `cards`: vCard resources (`.vcf`)
- `resource_shares`: per-resource permissions (`read_only`, `admin`)
- `app_settings`: global toggles (public registration)

## Permissions

- Owners always have full edit.
- Shared users can be:
  - `read_only`
  - `admin` (full edit)
- Admin web users can manage users and share assignments globally.

## DAV Layer

Custom SabreDAV backends:

- `LaravelAuthBackend`: basic auth with Laravel user passwords
- `LaravelPrincipalBackend`: principals from `users`
- `LaravelCalendarBackend`: CalDAV storage from `calendars` + `calendar_objects`
- `LaravelCardDavBackend`: CardDAV storage from `address_books` + `cards`

Mounted endpoint:

- `/dav/*`

## Default Resources

On user creation, a listener-like model hook provisions:
- `Default Calendar`
- `Default Address Book`
