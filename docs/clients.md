# CalDAV/CardDAV Client Setup

Use these account values:

- Server URL: `https://your-domain.tld/dav`
- Username: user email (e.g. `alice@example.com`)
- Password: account password
- Principal URI (if manual): `principals/{user_id}`

Autodiscovery endpoints are also enabled:

- `https://your-domain.tld/.well-known/caldav` -> `/dav`
- `https://your-domain.tld/.well-known/carddav` -> `/dav`

## macOS / iOS

### Calendar (CalDAV)

1. Open System Settings -> Internet Accounts.
2. Add Account -> Other Account -> Add CalDAV Account.
3. Choose `Manual`.
4. Enter server URL, username, password.

### Contacts (CardDAV)

1. Open System Settings -> Internet Accounts.
2. Add Account -> Other Account -> Add CardDAV Account.
3. Choose `Manual`.
4. Enter server URL, username, password.

## Android

Recommended app: DAVx5.

1. Add account in DAVx5.
2. Use login with URL and username.
3. Base URL: `https://your-domain.tld/dav`.
4. Enter email/password.
5. Select calendars/address books to sync.

## Thunderbird

1. Install TbSync + provider addon(s) if needed.
2. Add CalDAV/CardDAV account.
3. DAV URL: `https://your-domain.tld/dav`.
4. Use same credentials.

## Sharing Behavior

- Shared resources appear in client discovery and in UI dashboard.
- `read_only` shares block write operations.
- `admin` shares allow full edits.

## Troubleshooting

- `401 Unauthorized`: verify email/password.
- `403 Forbidden`: resource likely shared as read-only.
- Missing resources: confirm resource is marked sharable and a share exists.
