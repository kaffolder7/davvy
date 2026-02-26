# API Reference 🔌

All UI endpoints are defined in `routes/web.php` and return JSON.

## Public

- `POST /api/auth/login`
- `POST /api/auth/register` (when public registration is enabled)
- `GET /api/public/config`

## Authenticated

- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/dashboard`
- `POST /api/calendars`
- `PATCH /api/calendars/{calendar}`
- `DELETE /api/calendars/{calendar}`
- `POST /api/address-books`
- `PATCH /api/address-books/{addressBook}`
- `DELETE /api/address-books/{addressBook}`
- `GET /api/shares`
- `POST /api/shares`
- `DELETE /api/shares/{share}`

## Admin-only

- `GET /api/admin/users`
- `POST /api/admin/users`
- `GET /api/admin/resources`
- `PATCH /api/admin/settings/registration`
- `PATCH /api/admin/settings/owner-share-management`
- `GET /api/admin/shares`
- `POST /api/admin/shares`
- `DELETE /api/admin/shares/{share}`

## DAV Endpoint

- `ANY /dav/{path?}`

Use HTTP Basic auth with app user email/password.
