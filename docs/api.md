# API Reference

All UI endpoints are JSON routes in `routes/web.php`.

## Public

- `POST /api/auth/login`
- `POST /api/auth/register` (when public registration enabled)
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

## Admin-only

- `GET /api/admin/users`
- `POST /api/admin/users`
- `GET /api/admin/resources`
- `PATCH /api/admin/settings/registration`
- `GET /api/admin/shares`
- `POST /api/admin/shares`
- `DELETE /api/admin/shares/{share}`

## DAV Endpoint

- `ANY /dav/{path?}`

Use HTTP Basic auth with app user email/password.
