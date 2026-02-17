---
phase: A
type: implement
autonomous: true
files_modified: []
depends_on: []
notes:
  - "All file paths are relative to repo root. Line numbers are from .planning/phases/A/RESEARCH.md (2026-02-15)."
  - "If you hit any auth/permission issue (cookies/JWT/etc.), stop and request the user to authenticate or provide required env/config."
---

# Phase A: Critical Bug Fixes — Execution Plan

This document contains **Coder-ready, single-session prompts** for each Phase A task in `.planning/PORT_FEATURES_ROADMAP.md`.

## Dependency order (recommended)

1. **BUG-002** (GDPR leak) — stop the privacy violation first.
2. **BUG-001** (GPS middleware crash risk + GPS headers) — restore correctness and avoid runtime crashes.
3. **SEC-001** (JWT storage + refresh-on-mount) — fix auth correctness and remove localStorage token usage.
4. **BUG-003** (Type alignment) — mostly validation; do after auth/type churn stabilizes.
5. **CHORE-001** (Remove debug logs)
6. **CHORE-002** (Version label)

> Note: While plans are listed separately, the Coder should treat each section as a self-contained mini-plan that can be executed in one session.

---

## BUG-002: Fix GDPR export/delete privacy violation (highest priority)

### Objective
Ensure GDPR **export** and **delete** endpoints operate on **the requesting user’s data only** and do **not leak or modify third-party visitor data**.

### Context (research citations)
- `packages/backend/src/services/GDPRService.ts`
  - `exportUserData(userId: string)` signature — **line 41**
  - Access logs query that returns `al.*` for all sites user can access — **line 60** (privacy leak)
  - `deleteUserData(userId: string)` signature — **line 89**
  - Access logs anonymization UPDATE begins — **line 107** (wrong scope + likely no-op)
- `packages/backend/src/routes/gdpr.ts`
  - Consent route starts — **line 10** (note: currently not authenticated, reads `request.user`)
  - Export endpoint `GET /api/user/data-export` starts — **line 45**, `preHandler: [fastify.authenticate]` — **line 46**
  - Delete endpoint `DELETE /api/user/data` starts — **line 62**, `preHandler: [fastify.authenticate]` — **line 63**
- Schema limitation: `access_logs` has **no `user_id` linkage** (see research section “Schema reality check”).

### Must-haves (goal-backward)
- Export returns **only** user-scoped tables/records (e.g., profile + roles + consent) and does **not** include `access_logs`.
- Delete deletes/anonymizes only user-owned records (profile/roles/consents/tokens), and does **not** update/delete site visitor `access_logs`.

### Tasks

#### Task 1: Remove `access_logs` from GDPR export
- **files:**
  - `packages/backend/src/services/GDPRService.ts` (export query at/around **line 60**)
- **action (WHAT):**
  - Redefine export payload to include only data that is unambiguously “the user’s” (e.g., user row, `user_site_roles`, GDPR consent records, refresh tokens if stored, etc.).
  - Ensure exported structures cannot include other visitors’ IP/GPS/UA data.
- **verify:**
  - Add/update a backend test demonstrating export does **not** include access logs for other actors.
  - Manual: call `GET /api/user/data-export` as a non-super user; response must not contain `access_logs` or any visitor log array.
- **done:**
  - `exportUserData()` no longer queries or returns `access_logs`.

#### Task 2: Fix `deleteUserData()` to avoid touching other visitors’ logs
- **files:**
  - `packages/backend/src/services/GDPRService.ts` (delete at/around **line 89**, the UPDATE at/around **line 107**)
- **action (WHAT):**
  - Remove or strictly scope any attempted access log anonymization, since there is no user linkage.
  - Ensure delete operation removes user-owned data (roles/consents/tokens/user record) inside a transaction.
- **verify:**
  - Backend test: create sample access logs for a site; call delete for a user with site roles; confirm access logs remain unchanged (count + key fields).
  - Manual: call `DELETE /api/user/data` and ensure subsequent authenticated requests fail (user removed / tokens revoked), but access logs for the site still exist.
- **done:**
  - `deleteUserData()` no longer attempts to update unrelated `access_logs`.

#### Task 3 (checkpoint:decision — optional hardening / may defer): Decide consent route identity model
- **files:**
  - `packages/backend/src/routes/gdpr.ts` (consent route at **line 10**)
- **action (WHAT):**
  - Make an explicit product decision: is `POST /api/gdpr/consent` **public** or **authenticated**?
  - If decision is not available during this phase, **defer** this task to a later phase and document the deferral in the PR summary.
- **verify:**
  - Manual: hit consent route without JWT; confirm behavior matches the chosen model (or confirm task is deferred).
- **done:**
  - Decision is recorded and either implemented (public+explicit identity; or authenticated+preHandler) or explicitly deferred.

### Verification checklist (end-to-end)
- `npm test -w packages/backend` passes.
- GDPR export response contains only the requesting user’s data.
- GDPR delete does not delete/anonymize site visitor access logs.

---

## BUG-001: GPS middleware wiring (already wired) — prevent crash + support GPS headers

### Objective
Keep GPS middleware **executing for geo modes**, and make it **robust** when GeoIP databases/plugin are missing. Add GPS coordinate extraction that works for “GPS headers” validation.

### Context (research citations)
- `packages/backend/src/index.ts`
  - Hook order: `siteResolutionMiddleware` — **line 162**, `ipAccessControl` — **line 163**
  - GPS wrapper hook starts — **line 166**
  - Calls `gpsAccessControl(... { geoipService: server.geoip })` — **line 175**
  - Import: `gpsAccessControl` — **line 25**
- `packages/backend/src/middleware/gpsAccessControl.ts`
  - GPS extraction from request body — **line 27**
  - GeoIP anti-spoof lookup `geoipService.lookup(...)` is invoked unconditionally — **lines 87–89**
- `packages/backend/src/routes/sites.ts`
  - Public `POST /sites/:id/validate-location` already expects GPS in body
  - Schema GPS fields — **lines 208–210**, destructuring — **line 224**

### Must-haves (goal-backward)
- No runtime crash when GeoIP MMDB databases are absent.
- For geo access modes, GPS enforcement occurs via `onRequest` pipeline.
- GPS coordinates can be provided via **headers** (per Phase A verification gate in roadmap).

### Tasks

#### Task 1: Make GeoIP cross-validation conditional (no crash if GeoIP plugin missing)
- **files:**
  - `packages/backend/src/index.ts` (GPS wrapper around **lines 166–175**)
  - `packages/backend/src/middleware/gpsAccessControl.ts` (GeoIP usage: `geoipService.lookup(...)` at **lines 87–89**)
- **action (WHAT):**
  - Ensure `gpsAccessControl` is invoked with a `geoipService` only when it is actually available.
  - Ensure `gpsAccessControl` treats `geoipService` as optional and **skips** IP↔GPS distance validation when unavailable (or fails closed—see decision note below).
- **verify:**
  - Add/update unit/integration test: start backend with missing mmdb paths and hit a geo-enabled site route; server must not throw and must still apply GPS geofence.
- **done:**
  - GeoIP DB absence cannot crash requests.

**Decision note (Coder checkpoint:decision):**
- If GeoIP service is missing, should the server:
  - **(A)** allow GPS-only validation (skip spoofing check), or
  - **(B)** deny geo-mode requests until GeoIP is available (fail closed)?

Record the chosen behavior in code comments and (if relevant) in docs/tests.

#### Task 2: Support GPS coordinate extraction from headers (and keep body support)
- **files:**
  - `packages/backend/src/middleware/gpsAccessControl.ts` (extraction at **line 27**)
- **action (WHAT):**
  - Implement a consistent GPS input contract with **header support**, while preserving the existing JSON body contract for `POST /sites/:id/validate-location`.
  - **GPS headers contract (concrete + testable):**
    - **Header names:**
      - `x-gps-lat` (required for header-based GPS)
      - `x-gps-lng` (required for header-based GPS)
      - `x-gps-accuracy` (optional)
    - **Units / formats:**
      - `x-gps-lat`, `x-gps-lng`: WGS84 decimal degrees (e.g., `51.5074`, `-0.1278`)
      - `x-gps-accuracy`: meters (e.g., `12.5`)
    - **Required vs optional:**
      - If either `x-gps-lat` or `x-gps-lng` is present, require **both** (otherwise treat as missing GPS → `gps_required`).
      - `x-gps-accuracy` is optional; if omitted, accuracy validation is skipped (current `validateGPS` behavior).
    - **Parsing rules (strict):**
      - Read header values as strings; `trim()`; parse via `Number(value)`; require `Number.isFinite(...)`.
      - Reject empty strings and any non-finite results (`NaN`, `Infinity`).
    - **Method applicability:**
      - Header contract applies to **all HTTP methods** (especially GET/HEAD, where JSON bodies are not expected).
      - Body contract remains supported for JSON requests (`gps_lat`, `gps_lng`, optional `gps_accuracy` as numbers).
  - Validation errors must be explicit and logged via existing mechanisms.
- **verify:**
  - Add a backend test that passes GPS via headers and expects allow/deny behavior.
  - Add a backend test matrix for header parsing:
    - missing one of `x-gps-lat`/`x-gps-lng` → 403 `gps_required`
    - non-numeric header values → 403 `gps_invalid`
  - Manual: send a request with GPS headers to a geo-only site and confirm decision matches geofence.
- **done:**
  - “GPS headers” verification gate from roadmap is satisfied.

#### Task 3: Confirm GET/HTML asset flow expectations
- **files:**
  - `packages/backend/src/index.ts` (hook applies to all requests)
- **action (WHAT):**
  - Confirm which routes need GPS enforcement and whether GET requests should be blocked without GPS (common outcome) or redirected/served a GPS collection page.
- **verify:**
  - Manual: request a protected HTML page without GPS; confirm expected behavior (e.g., 403 + reason).
- **done:**
  - Product behavior for missing GPS on GET routes is consistent and tested.

### Verification checklist (end-to-end)
- `npm test -w packages/backend` passes.
- With GeoIP mmdb missing, geo-mode requests do not crash.
- With GPS headers present, requests can be allowed/denied by geofence.

---

## SEC-001: Move JWT access token out of localStorage (and fix refresh-on-mount)

### Objective
Ensure **no JWT** is persisted to localStorage, fix the remaining localStorage token reads, and prevent “phantom login” on refresh by refreshing the access token on app mount.

### Context (research citations)
- Frontend:
  - `packages/frontend/src/pages/LoginPage.tsx`
    - `setToken(response.data.accessToken)` — **line 31**
    - stores only `user` in localStorage — **line 33**
  - `packages/frontend/src/lib/auth.tsx`
    - reads `user` from localStorage on mount — **line 36**
    - removes bad user value — **line 44**
    - logout clears user — **line 54**
  - **Remaining gap:** `packages/frontend/src/lib/accessLogApi.ts` reads `localStorage.getItem('authToken')` — **line 12**
  - `packages/frontend/src/pages/AccessLogsPage.tsx` uses `accessLogApi` — import at **line 23**, list call at **line 47**
- Backend supports refresh-cookie auth:
  - `packages/backend/src/routes/auth.ts`
    - Login route — **line 48**, sets HttpOnly refresh cookie — **line 54**
    - Refresh route — **line 78**

### Must-haves (goal-backward)
- No frontend code reads/writes `authToken` in localStorage.
- After a page refresh, if refresh cookie exists, the app reacquires an access token automatically (or logs out cleanly).
- Access logs API calls authenticate correctly without localStorage tokens.

### Tasks

#### Task 1: Remove localStorage token dependency in `accessLogApi.ts`
- **files:**
  - `packages/frontend/src/lib/accessLogApi.ts` (localStorage read at **line 12**)
  - `packages/frontend/src/pages/AccessLogsPage.tsx` (usage at **lines 23, 47**)
- **action (WHAT):**
  - Ensure access logs calls use the same authenticated request mechanism as the main API client (either shared axios instance/interceptor or token injection from auth context).
  - Remove all references to `authToken` localStorage key.
- **verify:**
  - Manual: log in, navigate to Access Logs; network calls include Authorization header and succeed.
- **done:**
  - `localStorage.getItem('authToken')` is gone and access logs still work.

#### Task 2: Implement refresh-on-mount to restore access token
- **files:**
  - `packages/frontend/src/lib/auth.tsx` (mount logic around **line 36**)
  - Potentially `packages/frontend/src/lib/api.ts` if refresh call belongs there
- **action (WHAT):**
  - On app boot, if a user is present (or a refresh cookie might exist), call backend refresh (`POST /api/auth/refresh`) to obtain a new access token.
  - If refresh fails, clear user state and redirect to login (avoid “UI looks logged-in but API is 401”).
  - **Refresh-cookie correctness requirement:** ensure the refresh request sends the HttpOnly `refreshToken` cookie (when applicable) by using axios `withCredentials: true` (either per-call or via axios instance defaults) and verify CORS/credentials settings if frontend and backend are cross-origin.
  - Verify refresh response returns a **new** `accessToken` and that it is persisted only in memory (auth context state).
- **verify:**
  - Manual: log in, hard refresh the browser, then load a page that triggers API calls; calls should succeed without re-login if refresh cookie exists.
  - Manual: in browser devtools, confirm the refresh request includes the cookie (Request Headers → `Cookie`) and that the refresh response contains a new `accessToken` which becomes the active in-memory token.
  - Code-level: confirm the axios call used for refresh sets `withCredentials: true` (and does not attempt to read refresh token from JS).
- **done:**
  - No “phantom login” state after refresh.

#### Task 3: Confirm no token persistence remains
- **files:**
  - Repo-wide quick scan (Coder can grep) for `authToken` and `localStorage.*token`
- **action (WHAT):**
  - Ensure JWT tokens exist only in memory (React state/context) and refresh token is HttpOnly cookie.
- **verify:**
  - Manual: check Application → Local Storage contains no access token.
- **done:**
  - Roadmap Phase A gate “JWT is absent from localStorage” is satisfied.

### Verification checklist (end-to-end)
- Frontend build/test passes (at least `npm run build -w packages/frontend` and unit tests if configured).
- Access Logs page works after login and after refresh.
- No JWT in localStorage.

---

## BUG-003: Align frontend API types with backend access_mode + geofence fields (likely validation only)

### Objective
Confirm frontend types match backend contract for `access_mode` and geofence fields; fix only if drift exists.

### Context (research citations)
- Frontend `packages/frontend/src/lib/api.ts`
  - `Site.access_mode` union — **line 44**
  - Geofence fields — **lines 50–53**
- Backend `packages/backend/src/schemas/site.ts`
  - `accessModeSchema` enum — **line 4**
  - `siteSchema` begins — **line 21**; uses `access_mode` — **line 26**
  - `geofence_radius_km` — **line 35**
- Frontend duplication: `packages/frontend/src/pages/SiteEditorPage.tsx`
  - `access_mode` in `SiteFormData` — **line 28**
  - `geofence_radius_km` — **line 38**
- Known contract nuance: backend uses `z.date()` for `created_at/updated_at`, frontend uses `string` (JSON reality).

### Must-haves (goal-backward)
- Frontend compiles with correct unions and field names.
- No stray/stale type definitions are used in production builds.

### Tasks

#### Task 1: Validate type alignment (no code change if already aligned)
- **files:**
  - `packages/frontend/src/lib/api.ts` (**line 44**, **50–53**)
  - `packages/frontend/src/pages/SiteEditorPage.tsx` (**line 28**, **38**)
- **action (WHAT):**
  - Confirm unions and geofence field names match backend schema.
  - Confirm date field typing is consistent with actual JSON payloads used by the frontend.
- **verify:**
  - `npm run build -w packages/frontend` succeeds.
  - Optional: add a lightweight type-level assertion or runtime schema validation test in frontend if project conventions allow.
- **done:**
  - No mismatch remains; if none existed, document “validated” in PR summary.

#### Task 2: Ensure no legacy `.worktrees/phase-1` code is referenced
- **files:**
  - None (repo search)
- **action (WHAT):**
  - Confirm no imports reference `.worktrees/phase-1/...` or other historical copies.
- **verify:**
  - Repo grep shows no references.
- **done:**
  - Builds cannot accidentally depend on stale worktree code.

---

## CHORE-001: Remove debug console logs

### Objective
Remove/guard debug logging in targeted frontend files so production console output is minimized.

### Context (research citations)
- `packages/frontend/src/lib/auth.tsx` contains `console.error(...)` — **line 43**.
- No `console.log/debug/info` found in targeted files.

### Must-haves (goal-backward)
- No unguarded debug console logs in the targeted files.

### Tasks
- **files:**
  - `packages/frontend/src/lib/auth.tsx` (**line 43**)
  - `packages/frontend/src/components/ProtectedRoute.tsx` (verify remains clean)
- **action (WHAT):**
  - Either remove the console statement or guard it behind a dev-only condition.
- **verify:**
  - Frontend build passes.
  - Manual: exercise auth error path; ensure UX error handling still works.
- **done:**
  - No unintended console output in production path.

---

## CHORE-002: Update version label

### Objective
Update the hardcoded version label in the UI to reflect current reality.

### Context (research citations)
- `packages/frontend/src/components/Layout.tsx`
  - Hardcoded label `Phase 5 - Production Ready - v2.0.0-beta` — **line 68**

### Must-haves (goal-backward)
- Version label matches whatever release/version scheme the repo currently uses.

### Tasks
- **files:**
  - `packages/frontend/src/components/Layout.tsx` (**line 68**)
- **action (WHAT):**
  - Update the displayed version label.
  - (Optional) Prefer reading version from build-time env/define so it doesn’t drift.
- **verify:**
  - Manual: open app layout/header; label shows updated value.
- **done:**
  - Label updated and consistent with repo release notes.

---

## Phase A global verification (after all tasks)

- Backend: `npm test -w packages/backend` passes.
- Frontend: `npm run build -w packages/frontend` passes.
- Manual smoke:
  - GPS headers can allow/deny access on a geo-enabled site.
  - GDPR export returns only requester’s data (no access logs).
  - JWT not present in localStorage, and after refresh the app either refreshes token or logs out cleanly.
