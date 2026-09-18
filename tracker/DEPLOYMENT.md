# Codespaces deployment

## Access

- Portal: https://orange-giggle-69x7gv995jp625p9-8080.app.github.dev
- Admin: https://orange-giggle-69x7gv995jp625p9-8080.app.github.dev/admin

- Admin login ID: `admin`
- Initial password: stored in `tracker/data/admin-credentials.json` (private file, excluded from Git).

The forwarded port is **private**. Sign in to GitHub with access to this Codespace before signing in to the app. This is currently a private Codespaces deployment, not an anonymously accessible public site. Other app users also need access through the Codespaces access boundary. If public user access is later wanted, change only port 8080 to Public in the Codespaces Ports panel. The app still requires its own login. Keep port 3000 private.

Visit the admin URL, log in, and use **Change your password** at the bottom of the page. The initial-credentials file does not update after a password change; remove it once the password is stored in your password manager.

## Request path

```text
Browser HTTPS
  → GitHub Codespaces authentication / TLS
  → nginx HTTP :8080
  → Node.js 127.0.0.1:3000
  → tracker/data/db.json
```

GitHub terminates HTTPS. The forwarded-port protocol stays HTTP because nginx listens for HTTP inside the Codespace. The browser URL is HTTPS, and the app uses Secure, HttpOnly, SameSite session cookies. The exact public origin is supplied automatically at startup for origin checks.

nginx runs as the Codespace user with its own configuration and runtime directory. It does not use the system default site. App and proxy processes run detached from the terminal. The app serves both the HTML/CSS admin and user pages and the userscript download. The script still saves its autofill profiles in the browser; it does not automatically import the server's account records or change official visa results.

## Operations

From the repository root:

```bash
npm run status --prefix tracker
npm run restart --prefix tracker
npm run stop --prefix tracker
npm run deploy --prefix tracker
```

- `deploy` creates an admin only if none exists, starts services if needed, and checks both listeners.
- `restart` reloads application code, userscript content and nginx configuration. Users must sign in again.
- `.vscode/tasks.json` adds **Start application tracker** on folder open, preserving the existing bridge task.
- `.devcontainer/devcontainer.json` installs nginx on container creation, starts the tracker after container start, and forwards port 8080. That configuration applies on the next rebuild/new Codespace; the current installation was started directly without rebuilding.
- Node.js 22+ is required. There are no npm application dependencies. nginx is installed through apt.

## Files and logs

| Purpose | Path |
| --- | --- |
| App and password hashes | `tracker/data/db.json` |
| Initial admin credentials | `tracker/data/admin-credentials.json` |
| App output | `tracker/data/runtime/app.log` |
| Proxy errors | `tracker/data/runtime/nginx-error.log` |
| Proxy configuration | `tracker/deploy/nginx.conf` |
| Process management | `tracker/deploy/manage.mjs` |
| Firefox userscript source | `userscripts/vevo-helper.user.js` |

The complete `tracker/data/` directory is excluded from Git. Credentials use restricted file permissions; record data is not encrypted on disk. Back up `db.json` to private storage. To restore, stop the tracker, restore the file, and deploy again. Run only one app process against the JSON database.

The Codespace must be running for the portal to be available. Stopping or suspending it takes the site offline; the configured startup hooks restart it when the workspace resumes. Detached processes are not a crash-restarting production service manager. This setup is for a running Codespace, not guaranteed always-on hosting.

## Verification

The API integration suite (`npm test --prefix tracker`) tests authentication, record access, updates and persistence. Deployment checks exercise login through nginx, secure cookies, session access, userscript delivery, logout, service restart and the forwarded HTTPS endpoint. The portal keeps admin-managed review statuses separate from official Home Affairs results.

Codespaces forwarding reference: https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
