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

You should reach the same frontend app origin path.

> Important: `:8080` is the **admin dashboard UI**, so being prompted to log in is expected.
> Hostname mapping works here, but this path is still an authenticated admin app.

If you want to test **anonymous visitor behavior**, use non-admin routes/endpoints (see sections B and C).

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

## D) Anonymous visitor checks (no dashboard login)

Use one of these patterns:

- Non-API backend probe:
  - `http://site-a.localtest:3001/test-protected`
- Public content route (if you uploaded a file for that site):
  - `http://site-a.localtest:3001/s/<siteId>/content/<filename>`

Expected:
- Requests are allowed/blocked by site policy (`access_mode`, IP/country/VPN/geofence), not by end-user dashboard login.

## 6) Fast troubleshooting

### "No site configured for hostname"

- Host file entry missing/typo.
- Site `hostname` field does not exactly match requested host.
- DNS cache not flushed yet.

### Works on `localhost`, fails on `*.localtest`

- Host file not loaded by OS.
- Browser still caching DNS result.
- Try incognito and verify with ping/nslookup.

### "I open `http://<host>:8080` and get prompted"

- This is expected: `:8080` serves the admin dashboard, which requires login.
- To validate anonymous site policy behavior, test via `:3001/test-protected` or public `/s/<siteId>/content/<filename>` route.

### Hostname typo mismatch (example: `hest` vs `test`)

- Host file value and Site `hostname` must match exactly.
- Example: if site is `test.host.local`, opening `test.hest.local` will not resolve to that site.

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

## 9) Test matrix: IP + Country blocking on a public file URL

Target example URL:

- `http://test.hest.local:3001/s/56ee3df7-8735-4663-9c95-5ba02c5c8715/content/test.txt`

### Important behavior

- Blocking decisions happen **before** file redirect/download.
- If blocked, backend returns `403` JSON with `reason`.
- If allowed, backend returns `302` redirect to signed object URL.

### A) IP denylist test (recommended first)

In site settings, set:
- `access_mode = ip_only` (or `ip_and_geo`)
- `ip_denylist` includes `203.0.113.10/32`

Then request with simulated client IP:

```bash
curl -i -H "X-Forwarded-For: 203.0.113.10" "http://test.hest.local:3001/s/56ee3df7-8735-4663-9c95-5ba02c5c8715/content/test.txt"
```

Expected:
- `HTTP/1.1 403`
- body `reason: "ip_denylist"`

### B) IP allowlist test

In site settings, set:
- `ip_allowlist` includes `198.51.100.7/32`
- keep denylist empty for this test

1) Non-allowlisted IP:

```bash
curl -i -H "X-Forwarded-For: 198.51.100.99" "http://test.hest.local:3001/s/56ee3df7-8735-4663-9c95-5ba02c5c8715/content/test.txt"
```

Expected:
- `403`
- `reason: "ip_not_in_allowlist"`

2) Allowlisted IP:

```bash
curl -i -H "X-Forwarded-For: 198.51.100.7" "http://test.hest.local:3001/s/56ee3df7-8735-4663-9c95-5ba02c5c8715/content/test.txt"
```

Expected:
- `302` (allowed path)

### C) Country denylist / allowlist tests

These require GeoIP databases loaded in backend container.

If GeoIP is missing, country is `unknown` and country tests are not reliable.

Quick check:
- Backend logs should **not** show: `GeoIP databases not found - GeoIP functionality disabled`

If GeoIP is loaded:

1) Set `country_denylist` to include the test IP country (e.g. `US`) and call URL with an IP from that country.
- Expected: `403`, `reason: "country_blocked"`.

2) Set `country_allowlist` to only a specific country.
- Test IP outside allowlist -> `403`, `reason: "country_not_allowed"`.
- Test IP inside allowlist -> `302`.

### D) Read result in Access Logs

Open **Access Logs** and verify for each attempt:
- `allowed` = true/false
- `reason` matches expected (`ip_denylist`, `ip_not_in_allowlist`, `country_blocked`, `country_not_allowed`)
- `ip_country` populated for country-based checks when GeoIP is enabled

### E) One-command automated policy smoke

Run:

```bash
npm run smoke:policy
```

Optional overrides:

- `SMOKE_SITE_ID` (target site UUID)
- `SMOKE_SITE_HOST` (hostname, default `test.hest.local`)
- `SMOKE_CONTENT_FILE` (default `test.txt`)
- `SMOKE_CLIENT_IP_CIDR` (actual test client CIDR, default `192.168.32.1/32`)
- `SMOKE_ALLOWLIST_NONMATCH_CIDR` (non-matching CIDR for allowlist mismatch test)

The script:
- runs denylist/allowlist/country sanity checks against the public file URL,
- validates expected HTTP status + reason,
- and restores the original site policy automatically.

### F) One-command automated geofence smoke

Run:

```bash
npm run smoke:geofence
```

What it does:
- temporarily configures a **radius geofence** for the target site,
- calls `POST /api/sites/:id/validate-location` with inside/outside coordinates,
- expects:
  - inside => `allowed: true`
  - outside => `allowed: false`, `reason: outside_geofence`,
- restores original site `access_mode` + geofence fields afterward.

Useful overrides:
- `SMOKE_SITE_ID`
- `SMOKE_BACKEND_PORT` (default `3001`)
- `SMOKE_GEOFENCE_CENTER_LAT`, `SMOKE_GEOFENCE_CENTER_LNG`, `SMOKE_GEOFENCE_RADIUS_KM`
- `SMOKE_GEOFENCE_INSIDE_LAT`, `SMOKE_GEOFENCE_INSIDE_LNG`
- `SMOKE_GEOFENCE_OUTSIDE_LAT`, `SMOKE_GEOFENCE_OUTSIDE_LNG`
