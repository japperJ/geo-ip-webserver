# Local Testing with Host File Site Names (Desktop Docker)

This guide is for running locally with Docker Desktop when your site routing tests depend on **real hostnames** mapped via your OS host file.

> Key idea: site hostname resolution is enforced on non-API routes, so local host entries are required when validating hostname-based site behavior.

## 1) Start the stack

From repo root (`c:\REP\geo-ip-webserver`):

- Start full stack (frontend + backend + postgres + redis + minio):
  - `docker compose up -d`

Expected local ports:
- Frontend proxy: `http://localhost:8080`
- Backend API direct: `http://localhost:3001`
- Postgres: `localhost:5434`
- Redis: `localhost:6380`
- MinIO: `localhost:9002` (API), `localhost:9003` (console)

## 2) Add host file entries

### Windows (Admin required)

Edit:
- `C:\Windows\System32\drivers\etc\hosts`

Add entries like:

```text
127.0.0.1 admin.localtest
127.0.0.1 site-a.localtest
127.0.0.1 site-b.localtest
```

Then flush DNS cache:

```powershell
ipconfig /flushdns
```

### macOS/Linux (if teammates need it)

Edit `/etc/hosts` with the same entries and flush DNS per OS.

## 3) Create/login a super admin

1. Open dashboard at `http://localhost:8080`.
2. Register first account at `/register` (first user becomes `super_admin`).
3. Login at `/login`.

## 4) Create sites that match hostnames

In **Sites → Create Site**, create a site per hostname entry.

Example values:
- `slug`: `site-a`
- `name`: `Site A`
- `hostname`: `site-a.localtest`
- `access_mode`: start with `ip_only` for simple testing
- `enabled`: true

Repeat for other hostnames (e.g., `site-b.localtest`).

## 5) Validate hostname-based routing behavior

## A) Browser checks

Open each hostname in browser:
- `http://site-a.localtest:8080`
- `http://site-b.localtest:8080`

You should reach the same frontend app origin path, but backend hostname-dependent behavior can now be tested correctly using those hostnames.

## B) Backend hostname resolution check

Use backend direct endpoint (non-API route) to confirm host-based site resolution:

- `http://site-a.localtest:3001/test-protected`
- `http://site-b.localtest:3001/test-protected`

Expected:
- Successful response includes resolved site details when policy allows.
- If no site exists for hostname, backend returns `404` with site-not-configured style message.

## C) API + policy checks from UI

From dashboard at `:8080`:
- Edit site access policy (allow/deny lists, country lists, VPN blocking, geofence).
- Use **Access Logs** page to confirm decisions and reasons.

## 6) Fast troubleshooting

### "No site configured for hostname"

- Host file entry missing/typo.
- Site `hostname` field does not exactly match requested host.
- DNS cache not flushed yet.

### Works on `localhost`, fails on `*.localtest`

- Host file not loaded by OS.
- Browser still caching DNS result.
- Try incognito and verify with ping/nslookup.

### 403 when testing site config changes

- User role is not sufficient (`viewer` cannot edit).
- Confirm assignment in Site Users and global role in Users.

### 401 after login/refresh

- Refresh cookie blocked or expired.
- Check backend/frontend are both healthy and running.

### API seems fine but hostname checks fail

- `/api/*` routes bypass hostname site resolution middleware.
- Validate non-API hostname behavior via `/test-protected` or site content routes.

## 7) Suggested local hostnames convention

Use consistent local domains for team onboarding:
- `admin.localtest` for dashboard access docs/examples
- `site-<name>.localtest` for each test site

Example set:

```text
127.0.0.1 admin.localtest
127.0.0.1 site-a.localtest
127.0.0.1 site-b.localtest
127.0.0.1 geofence.localtest
```

## 8) Optional cleanup

When done testing hostname routing:
- Remove temporary entries from hosts file.
- `docker compose down` (or `docker compose down -v` if you want a clean local reset).
