# CalDAV/CardDAV Client Setup 📱💻

Use these account values:

- Server URL: `https://your-domain.tld/dav`
- Username: user email (example: `alice@example.com`)
- Password: account password
- Principal URI (if manual): `principals/{user_id}`

Autodiscovery endpoints:

- `https://your-domain.tld/.well-known/caldav` -> `/dav`
- `https://your-domain.tld/.well-known/carddav` -> `/dav`

## macOS / iOS 🍎

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

## Android 🤖

Recommended app: DAVx5.

1. Add account in DAVx5.
2. Use URL + username sign-in.
3. Base URL: `https://your-domain.tld/dav`.
4. Enter email/password.
5. Select calendars/address books to sync.

## Thunderbird ✉️

1. Install TbSync + provider addon(s) if needed.
2. Add CalDAV/CardDAV account.
3. DAV URL: `https://your-domain.tld/dav`.
4. Use same credentials.

## Sharing Behavior 🤝

- Shared resources appear in client discovery and in the web dashboard.
- `read_only` shares block write operations.
- `admin` shares allow full edits.

## Troubleshooting 🛠️

- `401 Unauthorized`: verify email/password.
- `403 Forbidden`: likely read-only share or owner sharing disabled.
- Missing resources: ensure resource is sharable and share assignment exists.
