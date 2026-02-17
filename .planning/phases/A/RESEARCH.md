# Phase A Research: Critical Bug Fixes

**Scope:** Implementation-specific research for Phase A tasks in `.planning/PORT_FEATURES_ROADMAP.md`.

## Summary
Phase A is mostly *locatable* and in a couple places partially implemented already, but there are important correctness/security gaps:

- **BUG-001 (GPS middleware wiring):** GPS middleware is already hooked into Fastify’s `onRequest` pipeline in `packages/backend/src/index.ts`, but the current wrapper will likely **crash when GeoIP databases are missing** (because it passes `server.geoip` to the GPS middleware unconditionally). Also, GPS extraction currently only looks in the **request body** (`gps_lat`, `gps_lng`, `gps_accuracy`), which may not work for GET/HTML asset flows unless clients POST these values.
- **BUG-002 (GDPR export/delete privacy violation):** `GDPRService.exportUserData()` currently exports **all access logs** for sites the user can access (not “the user’s data”), which is a privacy leak of other visitors’ IP/GPS/UA data. `deleteUserData()` also attempts to anonymize logs by site access — which would affect other visitors — and additionally the SQL is placed **after user_site_roles deletion**, making it likely a no-op.
- **BUG-003 (frontend API types):** The mainline `packages/frontend/src/lib/api.ts` appears aligned to backend `access_mode` and geofence fields. The *historical* `.worktrees/phase-1` copy is not aligned, but should not affect builds unless referenced.
- **SEC-001 (JWT in localStorage):** `LoginPage.tsx` stores only the user in localStorage (token stays in memory), **but** `packages/frontend/src/lib/accessLogApi.ts` still reads `authToken` from localStorage. Additionally, the current auth flow will lose the access token on refresh and does not automatically call `/api/auth/refresh` on app mount.
- **CHORE-001 (remove debug logs):** No `console.log` found in the targeted files; there is `console.error` in `auth.tsx`.
- **CHORE-002 (version label):** Version label is hardcoded in `Layout.tsx`.

## Task Findings

### BUG-001: Wire GPS middleware into request pipeline

**Primary file:** `packages/backend/src/index.ts`

**Registration point:**
- `server.addHook('onRequest', siteResolutionMiddleware);` — **line 162**
- `server.addHook('onRequest', ipAccessControl);` — **line 163**
- GPS wrapper hook starts — **line 166**
- `await gpsAccessControl(request, reply, { ... })` — **line 175**

**Imports:**
- `import { gpsAccessControl } from './middleware/gpsAccessControl.js';` — **line 25**

**Pattern:** GPS is invoked via an inline `onRequest` hook that:
- returns early when `!request.site` or `access_mode` is `'disabled' | 'ip_only'`
- calls `gpsAccessControl(request, reply, { site: request.site, geoipService: server.geoip, geofenceService })`

**Dependencies / prerequisites:**
- `siteResolutionMiddleware` must attach `request.site` (hook order already places it first).
- `geoipService` is expected to support `.lookup(...)` in `gpsAccessControl`.

**Risks / likely root cause(s):**
1. **GeoIP plugin optionality can break GPS middleware:** `index.ts` registers `geoipPlugin` only if MMDB files exist, otherwise `server.geoip` may be undefined. The GPS hook still passes `server.geoip` into the context.
  - In `gpsAccessControl.ts`, the code calls `geoipService.lookup(...)` unconditionally — **lines 87–89**.
   - If `server.geoip` is missing, this becomes a runtime error.
2. **GPS coordinate extraction only from request body:**
   - `gpsAccessControl.ts` reads `{ gps_lat, gps_lng, gps_accuracy }` from `request.body`.
   - This works for POST/JSON flows but not for common GET flows (e.g., serving protected content/HTML/assets) unless the client sends GPS in body (unusual).

**Related file:** `packages/backend/src/middleware/gpsAccessControl.ts`
- GPS extraction reads request body keys — **line 27**
- GeoIP anti-spoof lookup is invoked via `geoipService.lookup(...)` — **lines 87–89**

**Potential interaction with existing endpoint:**
- `packages/backend/src/routes/sites.ts` already provides a public POST endpoint `POST /sites/:id/validate-location` that validates GPS in body — see schema at **lines 208–210** and body destructuring at **line 224**.

---

### BUG-002: Fix GDPR export/delete user filtering (privacy violation)

**Primary file:** `packages/backend/src/services/GDPRService.ts`

#### Export issue
- Method signature: `exportUserData(userId: string)` — **line 41**
- Access logs query joins `user_site_roles` and returns `al.*` — **line 60**

**Why it’s a privacy violation:**
- `access_logs` table includes **visitor IP address, user agent, and GPS** (see migration `packages/backend/migrations/1771065929887_access-logs-table.sql`). These records represent *site visitor* data.
- The current export returns **all access logs for all sites the admin user can access**, not just data *about the admin user*.
- This leaks third-party personal data to any authenticated user with site roles.

#### Delete issue
- Method signature: `deleteUserData(userId: string)` — **line 89**
- Access logs anonymization UPDATE begins — **line 107**

**Problems:**
1. **Logical ordering bug:** The code deletes `user_site_roles` first, then tries to update `access_logs ... FROM user_site_roles usr WHERE usr.user_id = $1`. After deleting roles, the `FROM user_site_roles` join is likely empty → **UPDATE affects zero rows**.
2. **Wrong anonymization scope:** Even if the join worked, it would anonymize **all access logs for sites the user had access to**, impacting unrelated visitors’ logs.

**Where it is invoked:**
- `packages/backend/src/routes/gdpr.ts`:
  - Record-consent route `POST /api/gdpr/consent` starts at **line 10** (note: this route does **not** require auth; it attempts to read `(request.user as any)?.id`).
  - Export endpoint `GET /api/user/data-export` starts at **line 45** and sets `preHandler: [fastify.authenticate]` at **line 46**.
  - Delete endpoint `DELETE /api/user/data` starts at **line 62** and sets `preHandler: [fastify.authenticate]` at **line 63**.

**Schema reality check (no user linkage in access_logs):**
- `access_logs` table has no `user_id` / `actor_id` column (see `packages/backend/migrations/1771065929887_access-logs-table.sql`). Therefore, it is not currently possible to reliably identify “logs belonging to this user” beyond coarse heuristics.

**Risk / blocker to implementers:**
- A correct GDPR export/delete may require:
  - redefining what “user data” means for this endpoint (likely: profile + consents + roles + auth tokens), and/or
  - adding explicit linkage fields (e.g., `actor_user_id`) if true per-user log export is required.

---

### BUG-003: Align frontend API types with backend access_mode + geofence fields

**Primary file:** `packages/frontend/src/lib/api.ts`

**Frontend current state:**
- `Site.access_mode` union is `'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo'` — **line 44**
- Geofence fields present:
  - `geofence_type: 'polygon' | 'radius' | null` — **line 50**
  - `geofence_polygon` / `geofence_center` / `geofence_radius_km` — **lines 51–53**

**Backend contract sources:**
- Zod schema: `packages/backend/src/schemas/site.ts`
  - Access mode enum declared at **line 4**: `z.enum(['disabled', 'ip_only', 'geo_only', 'ip_and_geo'])`.
  - `siteSchema` begins at **line 21** and uses `access_mode: accessModeSchema` at **line 26**.
  - `geofence_radius_km` in `siteSchema` at **line 35**.
- DB schema: `packages/backend/migrations/1771065856303_sites-table.sql`
  - `sites_access_mode_valid` constraint includes same values.

**Possible mismatch to be aware of:**
- Backend `siteSchema` models `created_at`/`updated_at` as `z.date()` while frontend uses `string`. In JSON over HTTP these will be strings (ISO), so frontend typing is reasonable, but it’s a contract detail to keep consistent.

**Where else the types are duplicated:**
- `packages/frontend/src/pages/SiteEditorPage.tsx` defines a local `SiteFormData` with the same unions and field names (e.g., `access_mode` — **line 28**, `geofence_radius_km` — **line 38**).

---

### SEC-001: Move JWT access token out of localStorage

**Primary files:**
- `packages/frontend/src/pages/LoginPage.tsx`
- `packages/frontend/src/lib/auth.tsx`

**Current behavior:**
- `LoginPage.tsx`:
  - Receives `response.data.accessToken` and calls `setToken(response.data.accessToken)` — **line 31**
  - Stores only `user` in localStorage — **line 33**
- `auth.tsx`:
  - Reads `localStorage.getItem('user')` on mount — **line 36**
  - Removes localStorage user on parse error — **line 44**
  - Removes localStorage user on logout — **line 54**

**Remaining localStorage token usage (security gap):**
- `packages/frontend/src/lib/accessLogApi.ts`:
  - Reads `localStorage.getItem('authToken')` — **line 12**
- `packages/frontend/src/pages/AccessLogsPage.tsx` imports and uses `accessLogApi` — **line 23**
  - React Query call uses `accessLogApi.list(...)` — **line 47**

**Auth correctness risk introduced by “memory-only token”:**
- On page refresh, the app restores `user` from localStorage but does **not** restore `token`.
- Since `ProtectedRoute` gates on `user` only, the UI can appear authenticated while API calls fail with 401.
- Backend supports refresh via HttpOnly cookie:
  - `POST /api/auth/login` sets `refreshToken` cookie (`httpOnly: true`) — see `packages/backend/src/routes/auth.ts`
  - `POST /api/auth/refresh` exists and returns a new `accessToken`

**Implementation dependency note:**
- A safe approach is typically: keep access token in memory; on app mount call `/api/auth/refresh` (cookie-based) to obtain a new access token; if refresh fails, clear user and redirect to login.

**Backend routes that enable refresh-cookie-based auth:** `packages/backend/src/routes/auth.ts`
- Login route `POST /login` declared at **line 48**
- Sets HttpOnly refresh token cookie via `reply.setCookie('refreshToken', ...)` at **line 54**
- Refresh route `POST /refresh` declared at **line 78**

---

### CHORE-001: Remove debug console.logs

**Targeted files:**
- `packages/frontend/src/lib/auth.tsx`
- `packages/frontend/src/components/ProtectedRoute.tsx`

**Findings:**
- No `console.log` / `console.debug` / `console.info` found in these files.
- `auth.tsx` does contain `console.error('Failed to parse user from localStorage:', error);` — **line 43**

If Phase A intends “no console output in production”, this likely includes removing/guarding `console.error` and also addressing backend `console.error` usage in services (e.g., `AccessLogService`), but that is beyond the specific Phase A file list.

---

### CHORE-002: Update version label

**Primary file:** `packages/frontend/src/components/Layout.tsx`

- Version label string is hardcoded: `Phase 5 - Production Ready - v2.0.0-beta` — **line 68**

## Dependencies Between Tasks

1. **SEC-001 ↔ Access Logs UI:** Removing token from localStorage requires updating `accessLogApi.ts` (and anything else similar) to use the same in-memory token mechanism as `api.ts`, or to share a single axios instance.
2. **SEC-001 ↔ Auth UX correctness:** If tokens are not persisted, the frontend must refresh tokens on load using the backend’s `/api/auth/refresh` route (refresh cookie).
3. **BUG-001 ↔ Optional GeoIP plugin:** GPS middleware currently assumes `server.geoip` exists. Either make GeoIP mandatory for geo modes or make GPS-IP cross validation conditional.
4. **BUG-002 ↔ Product definition:** The correct GDPR behavior is blocked by lack of linkage between `access_logs` and a user identity. Decide whether to (a) remove logs from user export/delete, or (b) add schema linkage.

## Risks / Blockers

- **High:** GDPR endpoints currently leak third-party personal data (IP/GPS/UA). Treat BUG-002 as urgent.
- **Medium:** GeoIP DB absence can cause runtime errors for geo sites if GPS middleware runs without `server.geoip`.
- **Medium:** Memory-only token without refresh-on-mount results in “phantom login” (user present, token missing).

## Source Map (files referenced)
- `packages/backend/src/index.ts`
- `packages/backend/src/middleware/gpsAccessControl.ts`
- `packages/backend/src/services/GDPRService.ts`
- `packages/backend/src/routes/gdpr.ts`
- `packages/backend/src/routes/auth.ts`
- `packages/backend/src/schemas/site.ts`
- `packages/backend/src/routes/sites.ts`
- `packages/backend/migrations/1771065929887_access-logs-table.sql`
- `packages/backend/migrations/1771065856303_sites-table.sql`
- `packages/frontend/src/lib/api.ts`
- `packages/frontend/src/lib/auth.tsx`
- `packages/frontend/src/lib/accessLogApi.ts`
- `packages/frontend/src/pages/LoginPage.tsx`
- `packages/frontend/src/pages/AccessLogsPage.tsx`
- `packages/frontend/src/components/ProtectedRoute.tsx`
- `packages/frontend/src/components/Layout.tsx`
