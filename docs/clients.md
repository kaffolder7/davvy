# CalDAV/CardDAV Client Setup

Use this guide to connect Apple, Android, Thunderbird, and other DAV clients.

## Connection Values

- Server URL: `https://your-domain.tld/dav`
- Username: account email (for example: `alice@example.com`)
- Password: account password
- Principal URI (manual only): `principals/{user_id}`

Autodiscovery URLs:
- `https://your-domain.tld/.well-known/caldav`
- `https://your-domain.tld/.well-known/carddav`

## Manual DAV Paths (When Client Needs Explicit Paths)

Given user ID `{id}`:

- Principal: `/dav/principals/{id}/`
- Calendar home: `/dav/calendars/{id}/`
- Address-book home: `/dav/addressbooks/{id}/`
- Calendar collection: `/dav/calendars/{id}/{calendar-uri}/`
- Address-book collection: `/dav/addressbooks/{id}/{address-book-uri}/`

Tip: The dashboard shows your principal and collection URI snippets.

## Platform Setup

### macOS / iOS

Calendar (CalDAV):
1. System Settings -> Internet Accounts
2. Add Account -> Other -> Add CalDAV Account
3. Choose `Manual`
4. Enter server URL, username, password

Contacts (CardDAV):
1. System Settings -> Internet Accounts
2. Add Account -> Other -> Add CardDAV Account
3. Choose `Manual`
4. Enter server URL, username, password

### Android

Recommended app: DAVx5
1. Add account in DAVx5
2. Use URL + username sign-in
3. Base URL: `https://your-domain.tld/dav`
4. Enter email/password
5. Select calendars/address books to sync

### Thunderbird

1. Install TbSync and DAV/CardDAV provider add-ons if required
2. Add CalDAV/CardDAV account
3. DAV URL: `https://your-domain.tld/dav`
4. Use account email/password

## Sharing and Permissions Behavior

Shared resources appear in:
- DAV collection discovery
- Web dashboard

Permission impact:
- `read_only`: no write/delete
- `editor`: write/update allowed, collection delete denied
- `admin`: write/update/delete allowed

## Compatibility Mode

By default, Davvy runs in strict validation mode for iCalendar/vCard payloads.

Admins can enable **DAV compatibility mode** when legacy clients send non-strict payloads.

## Troubleshooting

- `401 Unauthorized`
  - Verify email/password
  - Confirm client is using basic auth with correct account

- `403 Forbidden`
  - Common causes: read-only share, non-deletable permission, or disabled owner sharing for web actions

- `409 Conflict` on shared contact edit/delete
  - Change may have been queued for owner/admin approval (contact moderation flow)

- Missing shared collections
  - Verify share exists and target resource is marked sharable

- Sync token errors (`InvalidSyncToken`)
  - Re-sync from scratch in client (drop and re-add account if necessary)

- Legacy payload errors
  - Ask admin to temporarily enable DAV compatibility mode
