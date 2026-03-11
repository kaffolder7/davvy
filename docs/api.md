# API Reference

Davvy's web API is served from Laravel web routes (`routes/web.php`) and primarily uses session-cookie auth.

## Conventions

- Base URL: same host as UI
- Request/response format: JSON (except export and DAV endpoints)
- Auth for `/api/*`:
  - Browser session cookie (`withCredentials`)
  - CSRF token header for state-changing web requests (`X-CSRF-TOKEN`)
  - CORS is same-origin by default; configure explicit origins when cross-origin access is required
- Auth for `/dav/*`:
  - HTTP Basic auth (email + password)
- Common response codes:
  - `200` success
  - `201` created
  - `202` accepted (queued for contact review)
  - `401` unauthenticated
  - `403` forbidden
  - `422` validation/business rule failure
  - `429` rate limited

## Public Endpoints

### `POST /api/auth/login`
Authenticate user and create session.

Request body:
- `email` (required)
- `password` (required)

Response:
- `user`
- feature flags:
  - `registration_enabled`
  - `registration_approval_required`
  - `owner_share_management_enabled`
  - `dav_compatibility_mode_enabled`
  - `contact_management_enabled`
  - `contact_change_moderation_enabled`

### `POST /api/auth/register`
Create regular user account when public registration is enabled.

Request body:
- `name` (required)
- `email` (required, unique)
- `password` (required)
- `password_confirmation` (required)

Returns:
- `201` and authenticated `user` payload when approval is not required
- `202` with `registration_pending_approval=true` when admin approval is required
- `403` if registration is disabled

### `GET /api/public/config`
Return public feature flags.

Response includes:
- `registration_enabled`
- `registration_approval_required`
- `owner_share_management_enabled`
- `dav_compatibility_mode_enabled`
- `contact_management_enabled`
- `contact_change_moderation_enabled`

## Authenticated Endpoints

### Session and Profile

#### `GET /api/auth/me`
Current user + current feature flags.

#### `POST /api/auth/logout`
Destroy current session.

#### `PATCH /api/auth/password`
Change current user's password.

Request body:
- `current_password` (required)
- `password` (required, min 8, must differ from current)
- `password_confirmation` (required)

Rate limited.

### Dashboard and Resource Views

#### `GET /api/dashboard`
Primary dashboard payload:
- `owned.calendars`
- `owned.address_books`
- `shared.calendars`
- `shared.address_books`
- `sharing`:
  - `owner_share_management_enabled`
  - `can_manage`
  - `targets`
  - `outgoing`
- `apple_compat`:
  - mirror target/source options and selected config

### Calendar Endpoints

#### `POST /api/calendars`
Create owned calendar.

Body:
- `display_name` (required)
- `uri` (optional, slug/unique by owner)
- `description` (optional)
- `color` (optional)
- `timezone` (optional)
- `is_sharable` (optional bool)

#### `PATCH /api/calendars/{calendar}`
Update calendar metadata/sharable flag.

#### `DELETE /api/calendars/{calendar}`
Delete calendar (except default calendar).

### Address Book Endpoints

#### `POST /api/address-books`
Create owned address book.

Body:
- `display_name` (required)
- `uri` (optional, slug/unique by owner)
- `description` (optional)
- `is_sharable` (optional bool)

#### `PATCH /api/address-books/{addressBook}`
Update address book metadata/sharable flag.

#### `DELETE /api/address-books/{addressBook}`
Delete address book (except default address book).

#### `PATCH /api/address-books/{addressBook}/milestone-calendars`
Configure generated birthday/anniversary calendars.

Body fields:
- `birthdays_enabled` (optional bool)
- `anniversaries_enabled` (optional bool)
- `birthday_calendar_name` (optional string)
- `anniversary_calendar_name` (optional string)

#### `PATCH /api/address-books/apple-compat`
Configure Apple-compatibility mirroring into user's default contacts book.

Body:
- `enabled` (required bool)
- `source_ids` (optional array of address-book IDs)

### Export Endpoints

#### `GET /api/exports/calendars`
Download ZIP of all readable calendars (`.ics` files).

#### `GET /api/exports/calendars/{calendar}`
Download one readable calendar as `.ics`.

#### `GET /api/exports/address-books`
Download ZIP of all readable address books (`.vcf` files).

#### `GET /api/exports/address-books/{addressBook}`
Download one readable address book as `.vcf`.

### Sharing Endpoints (Owner/Admin Context)

#### `GET /api/shares`
List shares manageable by current actor:
- admin: all shares
- regular: own shares only, and only when owner-share-management is enabled

#### `POST /api/shares`
Create or update share grant.

Body:
- `resource_type`: `calendar` | `address_book`
- `resource_id`: integer
- `shared_with_id`: integer
- `permission`: `read_only` | `editor` | `admin`

Rules:
- resource must be marked `is_sharable=true`
- cannot share resource with owner

#### `DELETE /api/shares/{share}`
Revoke share.

### Contact Management Endpoints (Feature-Gated)

All endpoints below return `403` when contact management is disabled.

#### `GET /api/contacts`
Returns:
- `contacts`: managed contacts current actor can write
- `address_books`: writable owned/shared address books

#### `POST /api/contacts`
Create managed contact and sync corresponding vCards.

#### `PATCH /api/contacts/{contact}`
Update managed contact.

#### `DELETE /api/contacts/{contact}`
Delete managed contact.

Contact write notes:
- Must include at least one of: `first_name`, `last_name`, `company`
- Must include `address_book_ids` with at least one writable address book
- If change requires owner/admin approval, API returns `202` with:
  - `queued: true`
  - `message`
  - `group_uuid`
  - `request_ids`

Common top-level contact payload fields:
- Name/work/personal fields: `prefix`, `first_name`, `middle_name`, `last_name`, `suffix`, `nickname`, `company`, `job_title`, `department`, `pronouns`, `pronouns_custom`, `ringtone`, `text_tone`, `phonetic_first_name`, `phonetic_last_name`, `phonetic_company`, `maiden_name`, `verification_code`, `profile`
- Milestone behavior: `exclude_milestone_calendars`, `head_of_household` (combined anniversary title ordering), `related_names[]` (mutual spouse-like matching for combined anniversary events)
- Structured fields:
  - `birthday` (`year`, `month`, `day`)
  - `phones[]`, `emails[]`, `urls[]` (labeled value rows)
  - `addresses[]`
  - `dates[]`
  - `related_names[]`
  - `instant_messages[]`
- Assignment: `address_book_ids[]`

### Contact Change Queue Endpoints

All endpoints below return `403` when review queue moderation is disabled.

#### `GET /api/contact-change-requests`
List queued/history requests visible to reviewer.

Query params:
- `status`: `open`, `history`, specific status, or `all`
- `operation`: `all`, `update`, `delete`
- `search`: text
- `limit`: 1-500

#### `GET /api/contact-change-requests/summary`
Returns queue count requiring current user's review:
- `needs_review_count`

#### `POST /api/contact-change-requests/bulk`
Bulk approve/deny grouped requests.

Body:
- `action`: `approve` | `deny`
- `request_ids[]`

#### `PATCH /api/contact-change-requests/{contactChangeRequest}/approve`
Approve one queued request.

Optional body for manual merge resolution:
- `resolved_payload`
- `resolved_address_book_ids[]`

#### `PATCH /api/contact-change-requests/{contactChangeRequest}/deny`
Deny one queued request.

## Admin-Only Endpoints

### Users and Resource Discovery

#### `GET /api/admin/users`
List users with resource counts.

#### `POST /api/admin/users`
Create user.

Body:
- `name`
- `email`
- `password`
- `role`: `admin` | `regular`

Admin-created users are marked approved immediately.

#### `PATCH /api/admin/users/{user}/approve`
Approve a pending user account.

#### `PATCH /api/admin/users/approve-pending`
Approve all currently pending user accounts.

Response:
- `approved_count`

#### `GET /api/admin/resources`
List sharable calendars/address books across users.

### Settings

#### `PATCH /api/admin/settings/registration`
Toggle public registration.

Response:
- `enabled`
- `require_approval`

#### `PATCH /api/admin/settings/registration-approval`
Toggle whether newly registered public users require admin approval before sign-in.

#### `PATCH /api/admin/settings/owner-share-management`
Toggle owner-managed sharing.

#### `PATCH /api/admin/settings/dav-compatibility-mode`
Toggle strict-vs-compatible DAV validation mode.

#### `PATCH /api/admin/settings/contact-management`
Toggle managed contacts feature.

#### `PATCH /api/admin/settings/contact-change-moderation`
Toggle review queue moderation for cross-owner contact changes.

Disable guard:
- returns `422` if unresolved queue requests still exist

#### `GET /api/admin/settings/contact-change-retention`
Get queue history retention days.

#### `PATCH /api/admin/settings/contact-change-retention`
Set queue history retention days (`1..3650`).

#### `GET /api/admin/settings/backups`
Get backup automation settings (effective values with env fallback).

Returns:
- `enabled`
- `local_enabled`
- `local_path`
- `s3_enabled`
- `s3_disk`
- `s3_prefix`
- `schedule_times[]` (`HH:MM`)
- `timezone`
- `weekly_day` (`0..6`)
- `monthly_day` (`1..31`)
- `yearly_month` (`1..12`)
- `yearly_day` (`1..31`)
- `retention_daily`
- `retention_weekly`
- `retention_monthly`
- `retention_yearly`
- `last_run`:
  - `at`
  - `status`
  - `message`

#### `PATCH /api/admin/settings/backups`
Update backup automation settings.

Body:
- `enabled` (bool)
- `local_enabled` (bool)
- `local_path` (string)
- `s3_enabled` (bool)
- `s3_disk` (string)
- `s3_prefix` (string, optional)
- `schedule_times[]` (`HH:MM`)
- `timezone` (IANA timezone string)
- `weekly_day` (`0..6`)
- `monthly_day` (`1..31`)
- `yearly_month` (`1..12`)
- `yearly_day` (`1..31`)
- `retention_daily` (`0..3650`)
- `retention_weekly` (`0..520`)
- `retention_monthly` (`0..240`)
- `retention_yearly` (`0..50`)

Validation rules:
- when `enabled=true`, at least one destination must be enabled (`local_enabled` or `s3_enabled`)
- at least one retention tier must be greater than zero

#### `POST /api/admin/backups/run`
Run backup immediately (manual trigger, admin only).

Response:
- `status`: `success` | `skipped` | `failed`
- `reason`
- `tiers[]`
- `artifact_count`
- `artifacts[]` (`tier`, `period`, `file_name`, `local_path`, `s3_path`)
- `resource_counts` (`calendars`, `address_books`, `calendar_objects`, `cards`)

Period behavior:
- each tier keeps one snapshot per period key (manual reruns replace the same period artifact instead of creating duplicates).

#### `POST /api/admin/backups/restore`
Restore calendars and address books from an uploaded backup ZIP archive (admin only).

Multipart form body:
- `backup` (required file, `.zip`)
- `mode` (optional): `merge` (default) or `replace`
- `dry_run` (optional bool): preview only, no writes
- `fallback_owner_id` (optional int): remap unresolved owner IDs to an existing user (defaults to current admin user when omitted)

Response:
- `status`: `success` | `failed`
- `mode`: `merge` | `replace`
- `dry_run` (bool)
- `reason`
- `executed_at_utc`
- `manifest` (if present in ZIP)
- `summary`:
  - `files_total`, `files_processed`, `files_skipped`
  - `owners_total`, `owners_resolved`, `owners_missing`, `fallback_owner_id`
  - created/updated/deleted counters for calendars, address books, and objects/cards
  - `resources_skipped_invalid`, `resources_skipped_owner`
- `warnings[]`

### Admin Share Management

#### `GET /api/admin/shares`
List all shares.

#### `POST /api/admin/shares`
Create or update share (same body as `POST /api/shares`).

#### `DELETE /api/admin/shares/{share}`
Delete share.

### Milestone Maintenance

#### `POST /api/admin/contact-milestones/purge-generated-calendars`
Delete generated birthday/anniversary calendars and disable milestone settings.

Response summary fields:
- `purged_calendar_count`
- `purged_event_count`
- `disabled_setting_count`

## DAV Endpoints

### `ANY /dav/{path?}`
Single DAV gateway route for CalDAV/CardDAV methods.

Supported methods include standard DAV verbs such as:
- `OPTIONS`, `PROPFIND`, `REPORT`, `PROPPATCH`
- `GET`, `PUT`, `DELETE`
- `MKCOL`, `MKCALENDAR`, `MOVE`, `COPY`, `LOCK`, `UNLOCK`, `ACL`

### Well-Known Redirects

- `/.well-known/caldav` -> `/dav`
- `/.well-known/carddav` -> `/dav`

GET/HEAD use `301`; DAV methods preserve semantics with `308` redirects.
