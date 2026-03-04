# API Reference 🔌

All UI endpoints are defined in `routes/web.php`. Most return JSON; export endpoints return downloadable files.

## Public

- `POST /api/auth/login`
- `POST /api/auth/register` (when public registration is enabled)
- `GET /api/public/config`

## Authenticated

- `GET /api/auth/me`
- `POST /api/auth/logout`
- `PATCH /api/auth/password`
- `GET /api/dashboard`
- `GET /api/exports/calendars` (zip download)
- `GET /api/exports/calendars/{calendar}` (`.ics` download)
- `GET /api/exports/address-books` (zip download)
- `GET /api/exports/address-books/{addressBook}` (`.vcf` download)
- `POST /api/calendars`
- `PATCH /api/calendars/{calendar}`
- `DELETE /api/calendars/{calendar}`
- `POST /api/address-books`
- `PATCH /api/address-books/{addressBook}`
- `DELETE /api/address-books/{addressBook}`
- `GET /api/contacts`
- `POST /api/contacts`
- `PATCH /api/contacts/{contact}`
- `DELETE /api/contacts/{contact}`
- `GET /api/shares`
- `POST /api/shares`
- `DELETE /api/shares/{share}`
- `GET /api/contact-change-requests`
- `POST /api/contact-change-requests/bulk`
- `PATCH /api/contact-change-requests/{contactChangeRequest}/approve`
- `PATCH /api/contact-change-requests/{contactChangeRequest}/deny`

## Admin-only

- `GET /api/admin/users`
- `POST /api/admin/users`
- `GET /api/admin/resources`
- `PATCH /api/admin/settings/registration`
- `PATCH /api/admin/settings/owner-share-management`
- `PATCH /api/admin/settings/dav-compatibility-mode`
- `GET /api/admin/settings/contact-change-retention`
- `PATCH /api/admin/settings/contact-change-retention`
- `GET /api/admin/shares`
- `POST /api/admin/shares`
- `DELETE /api/admin/shares/{share}`

## DAV Endpoint

- `ANY /dav/{path?}`

Use HTTP Basic auth with app user email/password.
