# User Guide

This guide explains **non-admin usage flows** and what regular users should expect in the current Geo-IP Webserver dashboard.

> Scope: For users with global role `user` and site-level role `viewer` or `admin` on one or more sites.

## 1) What a non-admin user can do

Your capabilities depend on your **site role**:

- `viewer`
  - View assigned sites.
  - View access logs.
  - View site content and download files.
  - View site user assignments.
  - Cannot edit site settings or upload/delete content.
- `admin` (site-level)
  - Everything a viewer can do, plus:
  - Edit assigned site settings.
  - Upload and delete site content.

Global restrictions for non-super-admin users:
- Cannot create or delete sites.
- Cannot access global user management (`/users`).
- Cannot grant/revoke site roles (super-admin only).

## 2) Sign in and session behavior

### Sign in

1. Open `/login`.
2. Enter email and password.
3. On success, you are redirected to `/sites`.

### Session refresh

- The app automatically restores your session using refresh cookies.
- If refresh fails/expired, you are asked to sign in again.

### Sign out

- Use **Logout** in sidebar.

## 3) Main usage flows

## View assigned sites

1. Open **Sites**.
2. You will only see sites you are assigned to (unless you are super admin).
3. Check each site's status and access mode.

## Edit a site (site role must be `admin`)

1. From Sites table, click **Edit**.
2. Update allowed fields (hostname, lists, access mode, geofence, enabled state).
3. Save changes.

If you are `viewer`, save actions will be blocked with permission error.

## View or manage site content

1. Open **Content** for a site.
2. Everyone with site access can download files.
3. Only site `admin` can upload/delete files.

## View site users

1. Open **Site Users**.
2. You can view delegated users/roles for that site.
3. Only super admins can change assignments.

## View access logs

1. Open **Access Logs**.
2. Filter by site, status, IP, and date range.
3. Open detail for full event info and screenshot preview (if captured).
4. CSV export is available when a specific site is selected.

## 4) What “Access Mode” means

Current site access modes:

- `disabled`: no IP/GPS policy enforcement
- `ip_only`: enforce IP/country/VPN rules
- `geo_only`: enforce GPS geofence checks
- `ip_and_geo`: enforce both IP and GPS checks

## 5) Common messages and what to do

### “You do not have access to this site”

- You are not assigned to that site.
- Ask a super admin to grant you site `viewer` or `admin` role.

### “Admin role required” on save/upload/delete

- Your site role is `viewer`.
- Ask for site `admin` role if you need edit rights.

### “Only super admins can access user management”

- Expected for non-super-admin users.
- Use Site Users page for visibility only.

### Login or session keeps failing

- Re-enter credentials.
- If persistent, ask admin to confirm account is active and cookies/proxy are configured correctly.

### Screenshot preview unavailable in access log detail

- Not all blocked requests have screenshot artifacts.
- Artifact URL may have expired or be inaccessible for your role/site context.

## 6) Expectations and best practices for users

- Expect least-privilege behavior by design.
- Use site-scoped pages (`/sites/:id/...`) for daily work.
- Coordinate permission changes through super admins.
- Use log filters to quickly isolate deny reasons and time windows.
- Report repeated unexpected denials with timestamp + site + reason for faster troubleshooting.
