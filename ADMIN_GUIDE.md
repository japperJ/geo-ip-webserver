# Admin Guide

This guide covers **admin dashboard workflows**, **role/permission rules**, and **troubleshooting** for the current Geo-IP Webserver implementation.

> Scope: This is for users with admin privileges in the dashboard (`super_admin` globally, plus site-level `admin` where applicable).

## 1) Roles and Permission Model

### Global roles

- `super_admin`
  - Full access across all sites.
  - Can create/delete sites.
  - Can manage global users (`/users`).
  - Can grant/revoke site roles (`admin`/`viewer`) on any site.
- `user`
  - No global admin rights.
  - Access depends on per-site role assignments.

### Site roles

- `admin`
  - Can update site settings for assigned sites.
  - Can upload/delete site content.
  - Can view site logs and role lists where access applies.
- `viewer`
  - Read-only access for assigned sites.
  - Can view site and content lists, but cannot modify content/site config.

### Effective access rules (as enforced)

- Super admins bypass site-level restrictions.
- Site access checks use assigned site mapping in JWT payload.
- Site updates/content writes require site role `admin` (or super admin).
- Site creation/deletion and user management require global `super_admin`.

## 2) Authentication Workflows (UI)

### Sign in

1. Open `/login`.
2. Submit email/password.
3. On success:
   - Access token is kept in memory.
   - Refresh token is set as an HttpOnly cookie.
   - User is redirected to `/sites`.

### Session restoration

On app load, frontend calls `/api/auth/refresh`.
- If refresh succeeds, user context is restored.
- If refresh fails, user is signed out and redirected to login flow.

### Register

1. Open `/register`.
2. Submit email and password.
3. First registered user becomes `super_admin`; later users default to global role `user`.

## 3) Core Admin UI Workflows

## Sites (`/sites`)

### Create a site (super admin)

1. Go to **Sites** → **Create Site**.
2. Fill:
   - `slug` (lowercase letters, numbers, hyphens)
   - `name`
   - `hostname`
   - `access_mode`: `disabled` | `ip_only` | `geo_only` | `ip_and_geo`
   - Optional allow/deny lists, VPN blocking, geofence settings.
3. Save.

### Edit a site (site admin / super admin)

1. Open site row → **Edit**.
2. Update policy fields (`ip_allowlist`, `country_allowlist`, `block_vpn_proxy`, geofence, `enabled`, etc.).
3. Save.

### Delete a site (super admin)

1. In Sites list, click **Delete**.
2. Confirm prompt.
3. Site is soft-deleted.

## Site Content (`/sites/:id/content`)

### Upload content (site admin / super admin)

1. Open Site Content page.
2. Choose file and click **Upload**.
3. File is base64-uploaded to API endpoint and stored via content service.

### Download content (viewer+)

1. Click **Download** for any file.
2. App requests a short-lived signed URL and redirects browser.

### Delete content (site admin / super admin)

1. Click delete icon.
2. Confirm prompt.

## Site Users (`/sites/:id/users`)

### View assigned site roles (viewer+ with access)

- Displays delegated users and their `admin`/`viewer` role for that site.

### Grant/update site role (super admin)

1. Search users by email.
2. Select target user and role (`admin` or `viewer`).
3. Click **Grant / Update**.

### Revoke site role (super admin)

1. Click **Revoke** on target row.
2. Confirm prompt.

## Users (`/users`) — super admin only

### Manage global user role

1. Open **Users**.
2. Change `global_role` between `super_admin` and `user`.

### Deactivate user

1. Click **Delete**.
2. Confirm prompt.

## Access Logs (`/logs`)

### View and filter

- Filter by site, allowed/blocked, IP, start/end date.
- Open detail modal for request metadata and screenshot preview (if available).

### Export CSV

1. Select a specific site in filter (required).
2. Click **Export CSV**.

## 4) Access Policy Rules (How enforcement works)

For site traffic, middleware enforcement follows this sequence:

1. Site resolution (hostname/slug/path context)
2. IP access control
   - denylist first
   - allowlist checks
   - country allow/deny checks
   - optional VPN/proxy blocking
3. GPS geofence checks for `geo_only` / `ip_and_geo`
4. Access logging (with anonymized IP)
5. Optional screenshot artifact capture for blocked attempts (async)

## 5) Current API references used by the dashboard

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`
- Sites: `/api/sites`, `/api/sites/:id`, `/api/sites/:id/validate-location`
- Site roles: `/api/sites/:id/roles`, `/api/sites/:id/roles/:userId`
- Users: `/api/users`, `/api/users/:id`
- Logs: `/api/access-logs`, `/api/access-logs/:id`, `/api/sites/:siteId/access-logs/export`
- Content: `/api/sites/:siteId/content`, `/api/sites/:siteId/content/upload`, `/api/sites/:siteId/content/download`, `/api/sites/:siteId/content/:key`
- GDPR/data rights: `/api/gdpr/consent`, `/api/user/data-export`, `/api/user/data`, `/api/privacy-policy`

## 6) Troubleshooting

### A) “403 Forbidden” when editing site/content

Likely causes:
- User has site role `viewer` (not `admin`).
- User is not assigned to the site.

Checks:
- Confirm assignment in **Site Users**.
- Confirm global role in **Users** page.

### B) “Only super admins can access user management”

- `/users` requires global `super_admin`.
- Promote user via existing super admin using Users page/API.

### C) Login succeeds but user gets signed out on refresh

Likely causes:
- Refresh cookie not present/blocked.
- Cross-site cookie/proxy misconfiguration.

Checks:
- Verify backend `COOKIE_SECRET`, `JWT_SECRET`, and frontend origin settings.
- Verify reverse proxy forwards cookies/headers correctly.

### D) Access Logs screenshot preview missing

Likely causes:
- `screenshot_url` not recorded for that event.
- Artifact presign failed due to authorization/site mismatch.
- Object storage/Redis worker issues.

Checks:
- Inspect backend logs for artifact/screenshot job errors.
- Validate artifact key path includes target site ID and current user has access.

### E) CSV Export disabled

- Export requires a specific `site_id` filter selection.
- Choose a site in filter first.

### F) Geofence checks unexpectedly deny requests

Likely causes:
- Incomplete geofence configuration (`geofence_type` without shape/radius).
- GPS payload invalid (`gps_lat/gps_lng` bounds/accuracy issues).
- GPS-IP cross-validation mismatch in strict scenarios.

Checks:
- Validate geofence shape/radius is fully saved.
- Test with `/api/sites/:id/validate-location`.

## 7) Operational expectations for admins

- Treat `super_admin` as tightly controlled break-glass role.
- Prefer site-level delegation (`admin`/`viewer`) for daily operations.
- Keep allow/deny lists and country rules minimal and intentional.
- Review access logs regularly for deny reason trends.
- Validate policy changes in staging before production rollout.
