# User Guide

This guide covers day-to-day Davvy usage in the web UI.

## 1. Sign In

- Open the app URL and sign in with email/password.
- If public registration is enabled, a registration link appears on the login page.
- New users automatically receive:
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
- Some changes (especially cross-owner contexts) may be queued for approval
- UI shows queued notice when server returns `202`

## 4. Review Queue

The `Review Queue` tab is for approving/denying queued contact changes.

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

The `Profile` page shows current account details and lets you change password.

Important:
- Password updates affect both web login and DAV clients.
- Update saved client credentials after password change.

## 6. Admin Control Center (Admin Users)

Admins can:
- Toggle feature flags:
  - public registration
  - owner sharing
  - DAV compatibility mode
  - contact management
- Create users with role selection
- Manage cross-user share assignments globally
- Set contact change queue history retention (days)
- Purge generated milestone calendars (destructive maintenance action)

## 7. DAV Client Connection Quick Values

From the dashboard:
- DAV endpoint: `https://<host>/dav`
- Principal: `principals/<your-user-id>`

See detailed client setup: [DAV Client Setup](./clients.md)
