# User Guide

This guide covers day-to-day Davvy usage in the web UI.

## 1. Sign In

- Open the app URL and sign in with email/password.
- If your account has 2FA enabled, complete the second step using authenticator code or backup code.
- If public registration is enabled, a registration link appears on the login page.
- If registration approval is required, newly registered users must be approved by an admin before they can sign in.
- Approved users automatically receive:
  - one default calendar
  - one default address book (`contacts`)

## 2. Dashboard

The dashboard is the main resource management page.

You can:
- View your DAV endpoint and principal info
- Create calendars and address books
- Rename resources (display name only; URI stays stable)
- Mark owned resources as sharable
- Export all calendars/address books or individual collections
- View resources shared with you and their permission badges

### Sharing Your Resources

If sharing is enabled for your role:
1. Select resource type (`calendar` or `address_book`)
2. Select a sharable owned resource
3. Select target user
4. Choose permission
5. Save share

Permission levels:
- `General` (`read_only`)
- `Editor` (`editor`, full edit without collection delete)
- `Admin` (`admin`, full edit + collection delete)

### Milestone Calendars (Address Books)

For each owned address book, you can configure:
- Birthday calendar on/off
- Anniversary calendar on/off
- Optional custom calendar names

Generated calendars are read from contact data and auto-updated.

Anniversary generation behavior:
- Contacts with the same anniversary month/day can be combined into one event when they are mutually linked with spouse-like related-name labels (`spouse`, `partner`, `husband`, `wife`, including custom labels containing those terms).
- `Head of Household` determines name order in the combined anniversary title.
- `MILESTONE_ANNIVERSARY_PAIR_INCLUDE_LAST_NAME` controls whether combined titles include the shared last name (default is `false`, so `John & Jane`; set `true` for `John & Jane Doe`).
- If either contact has an anniversary year, the combined title includes an ordinal (for example, `13th`). If neither contact has a year, the title omits the ordinal.
- Contacts that do not match a mutual pair still generate individual anniversary events.

### Apple Contacts Compatibility

Optional feature for Apple ecosystem visibility:
- Mirrors selected source address books into your default `contacts` address book
- Source books can be owned or shared books you can access
- You can enable/disable and choose mirror sources in dashboard

## 3. Contacts (When Enabled)

If admin enables contact management, the `Contacts` tab appears.

You can:
- Search/filter contacts
- Create/update/delete managed contacts
- Assign contacts to one or more writable address books
- Edit structured fields (phones, emails, addresses, dates, related names, IM)
- Opt contact out of milestone calendar generation

Validation rules:
- At least one of `First Name`, `Last Name`, or `Company`
- At least one assigned writable address book

Queue behavior:
- If `Review Queue` is enabled by admin, some changes (especially cross-owner contexts) may be queued for approval
- If `Review Queue` is disabled, cross-owner changes apply immediately (latest write wins)
- UI shows queued notice when server returns `202`

## 4. Review Queue

The `Review Queue` tab is optional and appears only when admins enable it.

Recommended usage:
- Personal/single-user deployments: keep disabled (default)
- Family/team deployments: enable when you need owner/admin review before applying cross-owner contact changes

When enabled, the tab is for approving/denying queued contact changes.

Capabilities:
- Filter by status/operation
- Search by requester/contact
- Approve or deny individual requests
- Bulk approve/deny visible actionable groups
- For merge conflicts, use "Edit & Approve" to resolve payload and assignment JSON

Status values include:
- `pending`
- `approved`
- `manual_merge_needed`
- `applied`
- `denied`

## 5. Profile

The `Profile` page shows current account details and security controls.

Important:
- Password updates affect both web login and DAV clients.
- Update saved client credentials after password change.
- You can enable/disable two-factor authentication (TOTP) and regenerate backup codes.
- You can create/revoke DAV app passwords for clients like iOS Calendar/Contacts, DAVx5, or Thunderbird.
- App passwords are shown once at creation time and are required for DAV when 2FA is enabled.

## 6. Admin Control Center (Admin Users)

Admins can:
- Toggle feature flags:
  - public registration
  - require registration approval
  - owner sharing
  - DAV compatibility mode
  - contact management
  - review queue moderation (off by default)
  - 2FA enforcement (with grace period rollout)
- Create users with role selection
- Reset a user's 2FA enrollment and revoke their DAV app passwords (emergency recovery)
- Delete users with typed admin-email confirmation
- Optionally transfer ownership of calendars, address books, and contacts to another user before deleting an account
- Reset a user's 2FA enrollment and revoke their DAV app passwords (emergency recovery)
- Manage cross-user share assignments globally
- Set contact change queue history retention (days)
- Configure automated backups:
  - enable/disable backup automation
  - configure local and optional S3 destinations
  - define one or more daily backup windows (`HH:MM`)
  - tune retention tiers (`daily`, `weekly`, `monthly`, `yearly`)
- Run backups on demand from Admin Control Center
- Restore backups from Admin Control Center using ZIP import (`merge`, `replace`, and optional dry-run)
- Manual backup reruns in the same day/week/month/year replace that period snapshot (no duplicate period artifacts)
- Purge generated milestone calendars (destructive maintenance action)

Important guards:
- Admins cannot disable review queue moderation while unresolved queue requests still exist; requests must be approved/denied first.
- Admins cannot delete their own account.
- Admins cannot delete the last remaining admin account.
- Ownership transfer is blocked if contact UID conflicts exist between source and target owners.

## 7. DAV Client Connection Quick Values

From the dashboard:
- DAV endpoint: `https://<host>/dav`
- Principal: `principals/<your-user-id>`

See detailed client setup: [DAV Client Setup](./clients.md)
