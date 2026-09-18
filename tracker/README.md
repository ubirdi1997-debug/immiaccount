# Application tracker

An independent, responsive application tracking portal. Admins create accounts and maintain records; users sign in to view their own details, internal review status and timestamp history. This app does not modify Home Affairs pages or issue official visa decisions. The existing Firefox autofill userscript remains separate.

## Run locally

Requires Node.js 22 or newer. No npm dependencies or build step.

```bash
cd tracker
npm run setup
npm start
```

Setup prompts for an admin login ID and generates a password, displayed once in the terminal. Save it securely. Open **http://127.0.0.1:3000**, sign in and optionally change your password using the panel at the bottom. There is no default shared password.

For noninteractive setup, supply `TRACKER_ADMIN_ID` and `TRACKER_ADMIN_PASSWORD` through your environment before `npm run setup`. Passwords must contain 12–128 characters. Setup refuses to overwrite an existing admin.

## Workflow

1. Sign in as administrator and choose **Create user**.
2. Assign a unique login ID and password. Enter name, date of birth, passport number, country and TRN. Application ID, visa/subclass, grant date/number, arrival deadline, stay, travel, conditions and a message are available as optional fields.
3. New accounts always start **In progress**. Share the account credentials securely.
4. Select a user, update the record, choose **In progress**, **Approved** or **Rejected**, optionally add an update note and save. These are internal review statuses, not official visa outcomes.
5. Users sign in at the same URL. They can view only their own details and update history, refresh status and change their password. The page checks for updates every 30 seconds while visible. Users cannot edit their record or status.

Each saved update is recorded with server time, administrator ID, status and note. Times display in the browser's timezone. Admins see a user-view preview below the editor. Concurrent stale edits are rejected; select the user again to reload. Password resets invalidate the user's existing sessions.

## Storage and hosting

`data/db.json` is an automatically created, Git-ignored JSON database. Writes use a temporary file and atomic rename. Passwords use salted scrypt hashes. Other record details are stored as plaintext; protect the data directory and its backups. Run one server process against this database. This simple store is intended for a small local installation.

Sessions live in server memory, expire after eight hours and are cleared on restart. Authentication uses HttpOnly, SameSite cookies; writes require the configured Origin and session CSRF token. Sign-in attempts are limited per remote address. Behind a proxy, users share the proxy address for this limit.

The server binds to `127.0.0.1:3000` by default. For a hosted installation, use an HTTPS reverse proxy and set `PUBLIC_ORIGIN` to the exact public origin (for example `https://tracker.example.com`, without a trailing slash). HTTPS origins enable Secure session cookies. Set `HOST` and `PORT` if needed. Keep the database on a persistent private volume. Use the configured URL exactly: localhost and 127.0.0.1 are different origins.

## Verify

```bash
npm test
```

Integration tests cover login, origin and CSRF checks, role enforcement, user isolation, date validation, duplicate IDs, status transitions/history, stale edits, password reset/change, logout and persistence across restart.

The YouTube reference could not be loaded in the development environment. This implementation uses the supplied image's field names with an independent layout and clear internal-review labels; it does not reproduce government branding.
