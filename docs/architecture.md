# Architecture

## System Overview

Davvy is a single Laravel application that serves:
- React web UI (same origin)
- JSON web API under `/api/*`
- SabreDAV CalDAV/CardDAV server under `/dav/*`

This keeps auth, permissions, data models, and DAV behavior in one codebase.

## Technology Stack

- Backend: Laravel 12 (PHP 8.4 target)
- DAV engine: `sabre/dav`
- Frontend: React 18 + Vite + Tailwind CSS
- Database: PostgreSQL by default (SQLite used in tests)

## Request Surfaces

- Web app shell: `/`
- Health endpoint: `/up`
- API endpoints: `/api/*`
- DAV endpoint: `/dav/*`
- Autodiscovery:
  - `/.well-known/caldav` -> `/dav`
  - `/.well-known/carddav` -> `/dav`

## Core Domain Model

### Identity and Settings
- `users`: auth principals and role (`admin` / `regular`)
- `app_settings`: runtime feature toggles and operational settings

### Calendar and Address Book Storage
- `calendars`
- `calendar_objects` (`.ics` resources)
- `address_books`
- `cards` (`.vcf` resources)
- `resource_shares`: grants between owner and recipient users

### DAV Sync Tracking
- `dav_resource_sync_states`: per-collection sync token
- `dav_resource_sync_changes`: delta feed (`added`, `modified`, `deleted`)

### Managed Contacts Subsystem
- `contacts`: normalized contact payloads (web-managed records)
- `contact_address_book_assignments`: contact-to-address-book and linked card mapping
- `contact_change_requests`: optional moderation queue for cross-owner edits
- `address_book_contact_milestone_calendars`: birthday/anniversary calendar settings

### Apple Compatibility Mirror Subsystem
- `address_book_mirror_configs`
- `address_book_mirror_sources`
- `address_book_mirror_links`

## Permissions Model

- Owners have full control over their resources.
- Share permissions:
  - `read_only`: read only
  - `editor`: read/write, no collection delete
  - `admin`: read/write/delete
- Admin users can manage users/settings and global share assignments.
- Non-admin owner share management is controlled by feature flag.

## Feature Flags

Runtime toggles are read from `app_settings` (with env defaults if unset):
- `public_registration_enabled`
- `owner_share_management_enabled`
- `dav_compatibility_mode_enabled`
- `contact_management_enabled`
- `contact_change_moderation_enabled`
- `contact_change_request_retention_days`
- backup automation keys:
  - `backups_enabled`
  - `backup_local_enabled`
  - `backup_local_path`
  - `backup_s3_enabled`
  - `backup_s3_disk`
  - `backup_s3_prefix`
  - `backup_schedule_times`
  - `backup_timezone`
  - `backup_weekly_day`
  - `backup_monthly_day`
  - `backup_yearly_month`
  - `backup_yearly_day`
  - `backup_retention_daily`
  - `backup_retention_weekly`
  - `backup_retention_monthly`
  - `backup_retention_yearly`

## Key Workflows

### User Provisioning
- User creation (register or admin-created) triggers default resource provisioning:
  - default calendar (`personal-calendar` URI)
  - default address book (`contacts` URI)

### DAV Writes and Validation
- Calendar data is validated/normalized by `IcsValidator`.
- Card data is validated/normalized by `VCardValidator`.
- Strict mode is default.
- Compatibility mode loosens strict RFC requirements for legacy clients.

### Contact <-> Card Sync
- Web contact writes generate/update/delete underlying cards.
- CardDAV writes can hydrate/update managed contact payloads.
- Assignments keep card/contact linkage stable across address books.

### Contact Change Moderation
- Default-off, opt-in workflow intended for collaborative family/team deployments.
- Cross-owner updates/deletes are queued in `contact_change_requests`.
- Queue groups by request + impacted owners.
- Reviewers can approve/deny, or resolve manual merge conflicts.
- When disabled, cross-owner edits bypass queue and apply directly (latest write wins).
- Applied/denied history is purged based on retention setting.

### Milestone Calendar Generation
- Optional per-address-book birthday/anniversary calendars.
- Generated events are managed resources with stable URI patterns.
- Contacts can opt out via `exclude_milestone_calendars`.

### Apple Compatibility Mirroring
- Selected source address books are mirrored into user's default contacts book.
- Mirrored cards include internal metadata properties for round-trip sync.
- Edits to mirrored cards can propagate back to source when permitted.

### Automated Backup Rotation
- Scheduled command `app:backup` runs every minute via Laravel scheduler and only executes on matching configured backup windows.
- Backup archives include all calendars (`.ics`) and address books (`.vcf`) plus a `manifest.json`.
- Strategy supports rotating tiers (`daily`, `weekly`, `monthly`, `yearly`) with independently configurable retention.
- Destinations:
  - local filesystem directory
  - optional remote storage via configured Laravel disk (default `s3`)
- Admins can run manual backup jobs from Admin Control Center.

## Operational Hardening

- Auth endpoint rate limits:
  - login
  - registration
  - password change
- Preflight command (`app:preflight`) enforces production safety checks.
- Startup DB bootstrap on PostgreSQL uses advisory lock for replica-safe migrations/seeding.
- Runtime can start Laravel scheduler worker (`RUN_SCHEDULER=true`) for periodic jobs.

## Notable Design Choices

- Nginx front-end with PHP-FPM worker pool in the production container runtime.
- Session-based web auth + basic-auth DAV under same user identity model.
- Stable principal URIs based on numeric user IDs (`principals/{id}`).
- DAV sync token support implemented for both calendar and address-book collections.
