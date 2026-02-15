---
phase: B
plan: 1
type: implement
autonomous: true
depends_on:
  - Phase A (stability + auth/token handling + API typing alignment)
inputs:
  - .planning/phases/B/RESEARCH.md
  - .planning/PORT_FEATURES_ROADMAP.md
scope:
  tasks:
    - CONTENT-001
    - CONTENT-002
    - CONTENT-003
must_haves:
  observable_truths:
    - "Content bucket is private; direct anonymous downloads are not possible"
    - "Admin can upload content for a site; object appears in MinIO/S3"
    - "Viewer (site role) can list content and obtain a download URL"
    - "Admin can delete content and it disappears from list + storage"
    - "Public endpoint serves content only after access-control pipeline allows (otherwise 403)"
  artifacts:
    - path: docker-compose.yml
      has: ["site-assets bucket is NOT configured for anonymous download"]
    - path: docker-compose.dev.yml
      has: ["site-assets bucket is NOT configured for anonymous download"]
    - path: packages/backend/src/services/ContentService.ts
      has: [ContentService, listSiteContent, uploadSiteContent, deleteSiteContent, getDownloadUrl]
    - path: packages/backend/src/routes/content.ts
      has: [contentRoutes]
    - path: packages/backend/src/index.ts
      has: [contentRoutes registration, site-by-param resolution for /s/:siteId/* before access-control hooks]
  key_links:
    - from: "MinIO bucket policy for site-assets"
      to: "Public content is only served via gated backend endpoint (presign + redirect)"
      verify: "Anonymous download is disabled in BOTH docker-compose.yml and docker-compose.dev.yml; direct object URL without credentials fails (403/AccessDenied)"
    - from: "POST /api/sites/:siteId/content/upload"
      to: "ContentService.uploadSiteContent -> S3Service.uploadFile"
      verify: "Uploaded object is visible via list + MinIO UI/cli (authenticated)"
    - from: "GET /api/sites/:siteId/content"
      to: "ContentService.listSiteContent -> S3 ListObjects"
      verify: "Returns uploaded key(s)"
    - from: "GET /s/:siteId/content/:filename"
      to: "site resolved into request.site BEFORE ipAccessControl/gpsAccessControl"
      verify: "Blocked sites return 403 with appropriate reason"
---

# Phase B, Plan 1 (Backend): Content Management (CONTENT-001..003)

## Objective
Implement per-site content management and public content serving.

This plan is intentionally backend-only to keep scope executable in one Coder session.
Frontend UI (CONTENT-004) is split into Phase B, Plan 2 in this same file.

This plan delivers:
- A backend `ContentService` backed by the existing S3-compatible stack.
- Site-scoped admin API routes with RBAC.
- A public serving endpoint that is protected by the same access-control pipeline as normal site traffic.
- A frontend “Content” page to list/upload/download/delete.

## Context anchors (use these exact patterns)

### ✅ Terminology mapping (repo conventions)
- Any mention of a “roleChecker” in older notes maps to:
  - global RBAC: `requireRole(...)`
  - site RBAC: `requireSiteAccess` + route-level `request.siteRole !== 'admin'` guard

### Storage / S3
- Reuse AWS SDK v3 wrapper:
  - `packages/backend/src/services/S3Service.ts`:
    - `export class S3Service` at **line 4**
    - bucket default `AWS_S3_BUCKET || 'screenshots'` at **line 9**
    - `forcePathStyle` for MinIO at **line 18**
    - `uploadFile()` at **line 22**
    - `getPresignedUrl()` at **line 33**
- Known-good pre-signed URL pattern (don’t stream bytes through the API unless needed):
  - `packages/backend/src/routes/gdpr.ts` pre-signed artifact download:
    - route at **line 78**
    - `s3Service.getPresignedUrl()` at **line 107**, returns `{ url }` at **line 109**

### 🚫 Security constraint: MinIO anonymous download MUST be disabled (BLOCKER)
- Current dev compose explicitly enables anonymous download for `site-assets`:
  - `docker-compose.dev.yml` (createbuckets): `mc anonymous set download myminio/site-assets` at **line 73**
- Current main compose also enables anonymous download for `site-assets`:
  - `docker-compose.yml` (createbuckets): `mc anonymous set download myminio/site-assets` at **line 73**
- This creates an access-control bypass if content is served from the bucket directly.

**Rule to enforce:** the `site-assets` bucket must be **private** and content must be served only via a gated backend endpoint:
1) run the access-control pipeline (site resolution + IP/GPS checks)
2) if allowed, issue a short-lived pre-signed URL and redirect (or return it)

**Planner requirement:** Plan 1 MUST include changing the bucket init so `site-assets` is not anonymous.
Recommended concrete change (dev/prod init scripts):
- In BOTH `docker-compose.dev.yml` and `docker-compose.yml`:
  - remove/replace the exact line at **line 73**:
    - from: `mc anonymous set download myminio/site-assets;`
    - to: `mc anonymous set none myminio/site-assets;`

### RBAC / site role
- `requireSiteAccess`:
  - reads `request.params.id` at **line 15** (param name is hard-coded)
  - sets `request.siteRole` at **line 39**
- Admin-only within a site is a *route-level check*:
  - `packages/backend/src/routes/sites.ts` checks `request.siteRole !== 'admin'` at **line 155**

### Public access-control pipeline
- Global hook ordering:
  - `packages/backend/src/index.ts` hooks at **lines 162–181**:
    - site resolution hook at **line 162**
    - `ipAccessControl` at **line 163**
    - GPS wrapper invokes `gpsAccessControl(...)` at **line 176**
- Site resolution behavior:
  - `packages/backend/src/middleware/siteResolution.ts`:
    - skips `/api/*` at **line 13**
    - uses `request.hostname` at **line 19**
    - attaches `request.site` at **line 41**

**MUST-EDIT anchor (critical wiring for CONTENT-003):**
- Edit the *exact* hook block in `packages/backend/src/index.ts` that begins with:
  - `const siteResolutionMiddleware = createSiteResolutionMiddleware(cacheService);`
  - followed immediately by:
    - `server.addHook('onRequest', siteResolutionMiddleware);`
    - `server.addHook('onRequest', ipAccessControl);`
    - the GPS wrapper `server.addHook('onRequest', async (request, reply) => { ... gpsAccessControl(...) ... })`

The site-by-param resolution for `/s/:siteId/*` must occur **before** `ipAccessControl` and the GPS wrapper.

### Frontend patterns
- Axios instance + auth header injection:
  - `packages/frontend/src/lib/api.ts`: axios instance at **line 12**, request interceptor at **line 20**
- React Query list page style:
  - `packages/frontend/src/pages/AccessLogsPage.tsx` queries at **lines 40–45**
- Routing/nav anchor points:
  - `packages/frontend/src/App.tsx` routes: site editor uses `sites/:id/edit` at **line 20**
  - `packages/frontend/src/components/Layout.tsx` navigation array begins at **line 7**

## Decisions to lock (before coding)

1) **Route params for site-scoped admin API MUST use `:siteId`** (roadmap contract: `/api/sites/:siteId/*`).

To avoid breaking existing code and to keep middleware reusable, Phase B must update `requireSiteAccess` to support **both** param names:
- `:siteId` (preferred for all Phase B routes)
- `:id` (backward compatibility; existing routes/tests may still use it)

**Verification requirement:** `requireSiteAccess` correctly resolves the site ID when either param name is present.

2) **Public endpoint shape vs existing site resolution**:
- Roadmap wants: `GET /s/:siteId/content/:filename`.
- Current `siteResolution` only resolves from hostname (`siteResolution.ts:19–41`), so `/s/:siteId/...` would otherwise run access-control hooks with `request.site` missing (no-op).
- Therefore, Phase B must add *site-by-param resolution* that sets `request.site` **before** `ipAccessControl` (`index.ts:163`) and GPS wrapper (`index.ts:176`).

3) **Content storage must not be anonymously accessible**:
- Update MinIO init so `site-assets` is private (remove anonymous download).
- Ensure backend public serving endpoint is the only supported distribution path (presign + redirect).

3) **S3 env var unification**:
- Backend docker provides `MINIO_*` (research notes `docker-compose.yml` **lines 104–109**), but `S3Service` reads `AWS_S3_*`.
- Pick one approach and apply consistently. Recommendation for Phase B: standardize backend on `AWS_S3_*` to match `S3Service` + workers (research section “Env var mismatch”).

## Execution waves + dependencies (Plan 1 only)

- **Wave 1 (backend core):** CONTENT-001
- **Wave 2 (backend HTTP + public serving):** CONTENT-002 + CONTENT-003 (CONTENT-003 depends on site-by-param resolution wiring)

Plan 2 (frontend UI) is a separate session and should be executed only after Plan 1 passes verification.

## Tasks

### BLOCKER FIXES (must be completed before CONTENT-001..003)

- **files (modify):**
  - `packages/backend/src/middleware/requireSiteAccess.ts`
  - `docker-compose.dev.yml` (createbuckets init; anonymous policy line at **73**)
  - `docker-compose.yml` (createbuckets init; anonymous policy line at **73**)

- **action (outcomes):**
  1. Update `requireSiteAccess` so it can resolve the site ID from **either** route param name:
     - preferred: `:siteId` (roadmap contract)
     - fallback: `:id` (backward compatibility)
  2. Disable anonymous downloads for the `site-assets` bucket in **both** compose files by replacing:
     - `mc anonymous set download myminio/site-assets;`
     - with: `mc anonymous set none myminio/site-assets;`

- **verify:**
  1. Route contract: a route defined with `/api/sites/:siteId/*` correctly passes `requireSiteAccess` (no `undefined` site ID).
  2. MinIO privacy: after bringing up the stack and uploading/creating a known object in `site-assets`, an unauthenticated HTTP GET to the object URL returns **403** / **AccessDenied**.

- **done when:**
  - Phase B routes can safely standardize on `:siteId` without breaking RBAC.
  - Anonymous (unauthenticated) direct bucket downloads are not possible in either compose configuration.

### CONTENT-001: Implement `ContentService` (S3-backed upload/download/delete/list per site)

- **files (create/modify):**
  - Create: `packages/backend/src/services/ContentService.ts`
  - Modify (if needed): `packages/backend/src/services/S3Service.ts` (only if adding list helper)
  - Modify: `packages/backend/.env.example` (align storage env vars; see research note `.env.example` **lines 18–24**)
  - Modify: docker compose env wiring (dev/prod as appropriate) to align with chosen env var strategy (research notes `docker-compose.yml` **lines 104–109**)
  - Modify: `docker-compose.dev.yml` (MinIO init) to disable anonymous downloads for `site-assets` (**line 73**, BLOCKER)
  - Modify: `docker-compose.yml` (MinIO init) to disable anonymous downloads for `site-assets` (**line 73**, BLOCKER)
  - Modify: `packages/backend/src/middleware/requireSiteAccess.ts` (support both `:id` and `:siteId` params; roadmap compatibility blocker)

- **action (outcomes, not implementation detail):**
  1. Define a per-site key namespace convention, e.g. `site-assets/{siteId}/{filename}` or `site-assets/sites/{siteId}/content/{filename}`. Ensure it supports listing and safe deletion.
  2. Implement `listSiteContent(siteId)` that returns stable metadata needed by UI (at minimum: key/filename, size, lastModified).
  3. Implement `uploadSiteContent(siteId, file)` using the existing upload pattern from `S3Service.uploadFile()` (`S3Service.ts:22`) and using MinIO-compatible settings (`forcePathStyle` at `S3Service.ts:18`).
  4. Implement `deleteSiteContent(siteId, key)` with safety check to prevent cross-site deletes (must validate key is under the site prefix).
  5. Implement download support via pre-signed URLs using `S3Service.getPresignedUrl()` (`S3Service.ts:33`), following the proven `gdpr.ts` route pattern (`gdpr.ts:107–109`).

- **tests (backend):**
  - Create `packages/backend/src/services/__tests__/ContentService.test.ts` (Vitest):
    - list empty → `[]`
    - upload → list includes new object
    - delete → list excludes object
    - presign → returns URL string (don’t assert exact URL, assert shape + expiry params)
  - If tests cannot hit real MinIO in unit runs, use dependency injection + stubbed S3 client for unit tests, and add a separate integration test profile/documented manual check.

- **verify:**
  - Unit tests pass: `npm test -w packages/backend` (or targeted file).
  - Manual/integration (must satisfy roadmap): Upload a file and confirm it exists in MinIO bucket `site-assets` (docker compose creates it; research `docker-compose.yml` **line 71**). Listing returns that file.
  - Security check (manual): verify anonymous download is disabled for `site-assets` in BOTH compose files.
    - **Required verification:** An unauthenticated HTTP GET to a known object URL in `site-assets` returns **403** / **AccessDenied** (i.e., anonymous fetch fails).

- **done when:**
  - `ContentService` supports list/upload/delete/presign per-site.
  - Storage configuration is consistent (no split-brain `MINIO_*` vs `AWS_S3_*` at runtime).

---

### CONTENT-002: Add content API routes with RBAC enforcement

- **files (create/modify):**
  - Create: `packages/backend/src/routes/content.ts`
  - Modify: `packages/backend/src/index.ts` to register routes (see existing route registration at `index.ts` **lines 236–239**)

- **route shape (align with RBAC middleware expectations):**
  - **List (viewer+):** `GET /api/sites/:siteId/content`
  - **Upload (admin):** `POST /api/sites/:siteId/content/upload`
  - **Delete (admin):** `DELETE /api/sites/:siteId/content/:key(.*)`
  - **Download URL (viewer+):** either return a presigned URL:
    - `GET /api/sites/:siteId/content/download?key=...` OR `GET /api/sites/:siteId/content/:key(.*)/download`

  > Routes use `:siteId` to match roadmap; `requireSiteAccess` must support both `:siteId` and `:id`.

- **action (outcomes):**
  1. Apply RBAC consistently:
     - onRequest: `[fastify.authenticate, requireSiteAccess]` for viewer+.
     - for admin endpoints, also enforce `request.siteRole === 'admin'` using the established pattern (`sites.ts:155`).
  2. Wire each route to `ContentService` methods.
  3. Ensure routes validate inputs:
     - key must be within the site prefix
     - filename restrictions (no path traversal) as needed

- **tests (backend routes):**
  - Add `packages/backend/src/routes/__tests__/content.test.ts` (or match repo’s existing route-test folder naming):
    - viewer can list + get download URL
    - viewer cannot upload/delete (403)
    - admin can upload/delete

- **verify:**
  - Backend tests pass.
  - Manual: using an admin token, upload then list; using a viewer token, list works but upload/delete return 403.

- **done when:**
  - All routes exist, are registered, and RBAC matches roadmap gates.

---

### CONTENT-003: Add public content serving endpoint with access-control pipeline

- **files (create/modify):**
  - Modify: `packages/backend/src/index.ts` (global hook ordering is at `index.ts:162–181`)
  - Create/Modify: `packages/backend/src/routes/content.ts` (add public route handler)
  - Create (if needed): `packages/backend/src/middleware/siteResolutionByParam.ts` (or extend existing site resolution)
  - Modify (if needed): `packages/backend/src/middleware/siteResolution.ts`

- **public endpoint requirement (from roadmap):**
  - `GET /s/:siteId/content/:filename`

- **critical action (must satisfy access-control wiring):**
  1. Implement “site-by-param resolution” for `/s/:siteId/*` and ensure it assigns `request.site` **before**:
     - `ipAccessControl` (`index.ts:163`)
     - GPS wrapper calling `gpsAccessControl` (`index.ts:176`)

    This is mandatory because current site resolution uses hostname only:
    - skip rules at `siteResolution.ts:13`
    - hostname read at `siteResolution.ts:19`
    - attachment at `siteResolution.ts:41`
    …and public path-based URLs otherwise won’t be protected.

  2. Once access-control allows, serve the asset:
     - Preferred: issue a short-lived pre-signed URL and redirect (or return JSON/HTML depending on product) using `S3Service.getPresignedUrl()` (`S3Service.ts:33`)—pattern proven in `gdpr.ts:107–109`.
     - Alternative: stream bytes through Fastify if redirect is unacceptable.

  3. Ensure "blocked" conditions return 403 from the existing middlewares (IP/GPS) when configured (research references `gpsAccessControl` deny reasons at `gpsAccessControl.ts:116` and `:185`).

- **tests:**
  - Add backend tests (route-level) that validate:
    - If site is resolved, middleware pipeline is exercised (deny/allow can be asserted by configuring a site to require GPS and omitting GPS headers).
    - When allowed, response is a redirect (302) to a pre-signed URL or a 200 with correct content.

- **verify:**
  - Manual gate:
    - Configure a site with geo enforcement (or IP denylist), hit `GET /s/:siteId/content/:filename`:
      - expect **403** when blocked
      - expect **success** (redirect/200) when allowed

- **done when:**
  - Public endpoint is protected by the same access-control logic as normal site traffic, despite path-based site selection.

---

### CONTENT-004: Add content UI page with file list/upload/download/delete

- **files (create/modify):**
  - Create: `packages/frontend/src/pages/SiteContentPage.tsx`
  - Create: `packages/frontend/src/lib/contentApi.ts` (recommended by research “separate module”)
  - Modify: `packages/frontend/src/App.tsx` (add route under `sites/:id/*`; anchor `sites/:id/edit` is at `App.tsx:20`)
  - Modify: `packages/frontend/src/components/Layout.tsx` (add nav item; nav array begins at `Layout.tsx:7`)

- **action (outcomes):**
  1. Add a new route, e.g. `sites/:id/content`, consistent with existing `:id` patterns.
  2. Implement `contentApi` using the existing Axios instance and auth injection (`api.ts:12` and interceptor at `api.ts:20`).
  3. Build the page UX:
     - list table: filename/key, size, last modified
     - upload control (multipart/FormData): selection + upload button
     - download action: calls download-url endpoint and navigates to the URL
     - delete action: confirmation + mutation
  4. Use React Query patterns mirroring `AccessLogsPage.tsx` queries (`lines 40–45`):
     - `useQuery` for list
     - `useMutation` for upload/delete
     - invalidate list query on success
  5. Enforce role-based UX (optional but recommended): hide upload/delete buttons for viewers, but rely on backend RBAC as the true control.

- **tests (frontend):**
  - Minimum: Playwright or manual verification is acceptable if unit coverage is heavy to add here.
  - Preferred: add/extend Playwright E2E to cover:
     - admin uploads and sees file in list
     - viewer sees list and can download, but delete/upload actions are not available or fail gracefully

- **verify:**
  - Manual gates match roadmap:
    - upload → appears in list and MinIO
    - list returns uploaded file
    - download works
    - delete removes it
    - viewer vs admin restrictions behave as expected

- **done when:**
  - UI is discoverable via nav + route, and the end-to-end workflow passes.

## Verification (end-to-end)

Backend:
1. Admin token:
   - upload → list shows file → delete removes file
2. Viewer token:
   - list works; download URL works; upload/delete are 403
3. Public:
   - allowed request returns success
   - blocked request returns 403 (from IP/GPS middlewares)

Frontend:
- (Deferred to Plan 2)

## GAP-CLOSURE (Phase B): Prove criterion #2 deny-path (public endpoint returns 403 when blocked)

**Gap source:** `.planning/phases/B/VERIFICATION.md` reports criterion #2 lacks an executed deny-path check for the public endpoint `GET /s/:siteId/content/:filename`.

**Scope constraint:** Minimal + Phase-B-only. Prefer a deterministic automated test; allow a small manual gate as fallback. No broad refactors.

### Task GC-1 (auto): Add a deny-path test for the public endpoint via GPS-required enforcement

- **files:**
  - Modify: `packages/backend/src/routes/__tests__/content.test.ts` *(preferred: add one new test block here to keep it close to existing coverage)*
    - OR create: `packages/backend/src/routes/__tests__/publicContentAccessControl.test.ts`

- **action (outcomes):**
  1. Build a Fastify test server that registers `contentRoutes` **and** a minimal subset of the production access-control pipeline sufficient to enforce a deny decision **before** the public content handler executes:
     - Attach `request.site` for `/s/:siteId/*` (site-by-param resolution) with a stub site object.
     - Invoke the GPS access control wrapper used in `packages/backend/src/index.ts` (or equivalent) so that when the site requires GPS, requests without GPS are denied.
  2. Use a stub site configured to require GPS but avoid database/GeoIP dependencies:
     - `access_mode: 'geo_only'` (so `ipAccessControl` is skipped)
     - `geofence_type: null` (so geofence checks don’t run)
  3. Assert deny-path:
     - `GET /s/:siteId/content/guide.pdf` **without** GPS headers returns **403**
     - response body includes `reason: 'gps_required'` (from `gpsAccessControl`)
  4. (Optional but recommended) Assert allow-path still works:
     - same request **with** valid GPS headers (`x-gps-lat`, `x-gps-lng`, and a small `x-gps-accuracy`) returns **302** redirect.

- **verify:**
  - Targeted test run passes and is stable:
    - `npm test -w packages/backend -- src/routes/__tests__/content.test.ts` *(or the new test file)*

- **done when:**
  - There is an automated test demonstrating **403** on the public endpoint when access-control blocks the request.
  - The test is deterministic and does not require MaxMind DB presence, PostGIS geofence data, or real S3/MinIO.

### Task GC-2 (checkpoint:human-verify, optional fallback): Manual runtime deny verification in dev stack

- **files:** none

- **action (outcomes):**
  1. Configure (or pick) a site with `access_mode` requiring GPS (`geo_only` or `ip_and_geo`).
  2. Ensure at least one content object exists for that site.
  3. Request the public endpoint without GPS headers:
     - expect **403** with a deny reason (e.g., `gps_required`).

- **verify:**
  - Browser/curl/Invoke-WebRequest confirms **403** for the public endpoint when GPS is missing.

- **done when:**
  - A human has observed the deny behavior end-to-end in the running app.

## Checklist against roadmap success criteria
- Upload file → appears in MinIO ✅ (CONTENT-001 + CONTENT-002 + verification)
- List returns uploaded file ✅ (CONTENT-001 + CONTENT-002)
- Public endpoint serves content (or 403 when blocked) ✅ (CONTENT-003)
- Role restrictions work ✅ (CONTENT-002; UI polish deferred to Plan 2)

---
phase: B
plan: 2
type: implement
autonomous: true
depends_on:
  - "Phase B, Plan 1 (Backend): CONTENT-001..003"
inputs:
  - .planning/phases/B/RESEARCH.md
scope:
  tasks:
    - CONTENT-004
must_haves:
  observable_truths:
    - "Admin can upload content via UI; it appears in list"
    - "Viewer can list and download via UI"
    - "Delete removes content from list (admin)"
  artifacts:
    - path: packages/frontend/src/pages/SiteContentPage.tsx
      has: [SiteContentPage]
    - path: packages/frontend/src/lib/contentApi.ts
      has: [listSiteContent, uploadSiteContent, deleteSiteContent, getSiteContentDownloadUrl]
  key_links:
    - from: "packages/frontend/src/lib/contentApi.ts"
      to: "packages/frontend/src/lib/api.ts shared axios instance + auth interceptor"
      verify: "No new axios instance is created; module imports and uses `api`"
---

# Phase B, Plan 2 (Frontend): Content UI (CONTENT-004)

## Objective
Add a site content management UI that uses the backend endpoints from Plan 1.

## Key constraints
- `contentApi.ts` must **reuse** the shared Axios instance exported from `packages/frontend/src/lib/api.ts`.
  - Do **not** create a new `axios.create()` instance in `contentApi.ts`.
  - This resolves the roadmap “api.ts modification vs contentApi.ts creation” mismatch by explicitly depending on `api.ts` for transport/auth.

## Tasks

### CONTENT-004: Add content UI page with file list/upload/download/delete

- **files (create/modify):**
  - Create: `packages/frontend/src/pages/SiteContentPage.tsx`
  - Create: `packages/frontend/src/lib/contentApi.ts` (must import `api` from `lib/api.ts`)
  - Modify: `packages/frontend/src/App.tsx` (add route under `sites/:id/*`; anchor `sites/:id/edit` is at `App.tsx:20`)
  - Modify: `packages/frontend/src/components/Layout.tsx` (add nav item; nav array begins at `Layout.tsx:7`)

- **action (outcomes):**
  1. Add a new route, e.g. `sites/:id/content`, consistent with existing `:id` patterns.
  2. Implement `contentApi` using the existing Axios instance and auth injection (`api.ts:12` and interceptor at `api.ts:20`).
  3. Build the page UX:
     - list table: filename/key, size, last modified
     - upload control (multipart/FormData): selection + upload button
     - download action: calls download-url endpoint and navigates to the URL
     - delete action: confirmation + mutation
  4. Use React Query patterns mirroring `AccessLogsPage.tsx` queries (`lines 40–45`):
     - `useQuery` for list
     - `useMutation` for upload/delete
     - invalidate list query on success
  5. Optional UX: hide upload/delete buttons for viewers; backend remains the source of truth.

- **verify:**
  - Manual: admin uploads then sees file in list; viewer can list and download.
  - Optional: Playwright E2E coverage if time permits.

- **done when:**
  - UI is discoverable via nav + route, and the end-to-end workflow passes.
