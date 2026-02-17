# Phase B Research: Content Management

## Summary
Phase B (Content Management) can be implemented cleanly by reusing geo v1’s existing patterns:

- **Storage layer:** There is already an S3-compatible client wrapper (`S3Service`) using AWS SDK v3, plus proven S3 upload usage in the screenshot worker.
- **Admin RBAC:** Admin APIs consistently use `fastify.authenticate` + either `requireRole('super_admin')` (global role) or `requireSiteAccess` (site-scoped role). Site-scoped “admin-only” actions are implemented as an explicit `request.siteRole !== 'admin'` check.
- **Public access-control pipeline:** Non-`/api/*` routes automatically flow through `siteResolution → ipAccessControl → gpsAccessControl` via global `onRequest` hooks. This makes it straightforward to protect a public content-serving endpoint *as long as the request can be associated to a site via hostname*.
- **Frontend integration:** The frontend uses Axios (`lib/api.ts`) and React Query (`@tanstack/react-query`) patterns. There is **no existing file upload (FormData/multipart) pattern** in the frontend, so Phase B will introduce it, but can still follow the existing Axios + React Query structure.

Key design pressure point to resolve in implementation planning:

- The roadmap’s proposed public endpoint shape (`GET /s/:siteId/content/:filename`) **does not match the current site-resolution mechanism**, which resolves a site by `request.hostname` (not by `:siteId`). If the public content endpoint is path-based, you’ll need an additional “resolve site by id/slug” middleware *before* running the IP/GPS middlewares.

## Standard Stack
| Need | Solution in geo v1 | Version (repo) | Confidence | Source |
|---|---|---:|---|---|
| S3-compatible object storage | AWS SDK v3 (`@aws-sdk/client-s3`) | ^3.990.0 | HIGH | `packages/backend/package.json` deps; `packages/backend/src/services/S3Service.ts` (lines 1–56) |
| Pre-signed downloads | `@aws-sdk/s3-request-presigner` | ^3.990.0 | HIGH | `packages/backend/package.json`; `S3Service.getPresignedUrl()` at `S3Service.ts:33` |
| Backend web framework | Fastify + hooks | ^5.7.4 | HIGH | `packages/backend/package.json`; global hooks in `packages/backend/src/index.ts` (lines 162–181) |
| RBAC | `fastify.authenticate` + `requireRole`/`requireSiteAccess` | n/a | HIGH | `packages/backend/src/middleware/requireRole.ts` (line 4); `requireSiteAccess.ts` (line 10); usage in routes |
| Frontend data layer | Axios + React Query | axios ^1.6.7, react-query ^5.20.0 | HIGH | `packages/frontend/package.json`; `packages/frontend/src/lib/api.ts` (lines 12–28) |

## 1) Existing S3/MinIO infrastructure (what already exists)

### Backend: S3Service wrapper (AWS SDK v3)
- `packages/backend/src/services/S3Service.ts`
  - Class entry: `export class S3Service` at **line 4**.
  - Bucket default is `AWS_S3_BUCKET || 'screenshots'` at **line 9**.
  - Uses S3-compatible endpoint + `forcePathStyle` at **line 18** (important for MinIO).
  - Provides:
    - `uploadFile()` at **line 22**
    - `getPresignedUrl()` at **line 33**
    - `deleteFile()` later in file (see full file)

**Implication for ContentService:** you can reuse this wrapper, but you’ll need either:
- to extend `S3Service` (or implement in `ContentService`) with listing capability (e.g., ListObjectsV2), and potentially download/stream helpers.

### Workers: screenshot worker demonstrates S3 upload pattern
- `packages/workers/src/screenshot-worker.ts`
  - Constructs `S3Client` and uploads with `PutObjectCommand`.
  - Uses a key convention `screenshots/blocked/{siteId}/...` (see key format around the upload section).

This is a strong “known-good” reference for how geo v1 expects S3/MinIO to behave.

### MinIO is provisioned in Docker, but backend env vars differ
- Docker creates buckets and enables anonymous download for `site-assets`:
  - `docker-compose.yml`: `mc mb myminio/site-assets` at **line 71**, and `mc anonymous set download myminio/site-assets` at **line 73**.
- Dev Docker also enables anonymous download for `site-assets`:
  - `docker-compose.dev.yml`: `mc mb myminio/site-assets` at **line 71**, and `mc anonymous set download myminio/site-assets` at **line 73**.
- Backend `.env.example` uses `MINIO_*` variables (not `AWS_S3_*`):
  - `packages/backend/.env.example` lines **18–24**.
- Worker uses `AWS_S3_*` variables in `packages/workers/.env`:
  - `AWS_S3_ENDPOINT` at **line 2**, `AWS_S3_BUCKET` at **line 6**.

**Implementation risk:** `S3Service` reads `AWS_S3_*`, while backend Docker env currently provides `MINIO_*` (see `docker-compose.yml` lines **104–109**). Phase B should decide whether to:
- standardize backend on `AWS_S3_*` (recommended for consistency with `S3Service` + workers), or
- introduce a mapping layer (e.g., build AWS vars from MINIO vars during startup), or
- rewrite storage access to use MINIO vars directly.

(Phase 4 docs also describe the worker’s S3 env setup: `.planning/phases/4/IMPLEMENTATION_SUMMARY.md`, “Environment Variables” section.)

### 🚨 Security blocker: anonymous download bypass (must fix in Phase B)
If `site-assets` allows anonymous download and content is served from MinIO directly, the public access-control middleware chain can be bypassed entirely.

**Required constraint for Phase B success criteria:**
- The `site-assets` bucket must be **private** (no anonymous download).
- Public content distribution must be via a **gated backend endpoint** that:
  1) resolves the site (hostname or path-param)
  2) runs IP/GPS access-control
  3) only then returns/redirects to a short-lived pre-signed URL.

### Existing “download artifact” API using pre-signed URLs
- `packages/backend/src/routes/gdpr.ts`
  - `GET /api/artifacts/:key(.*)` is defined at **line 78**.
  - Access check details:
    - Extracts `siteId` from the key via regex match at **line 84** and validates the match at **line 85**.
    - Non-super-admins are gated at **line 95**, with the `user_site_roles` membership query starting at **line 96** and the deny condition at **line 101**.
  - Pre-signed URL generated via `s3Service.getPresignedUrl()` at **line 107**, returning `{ url }` at **line 109**.

**Useful pattern for ContentService:** “don’t stream the bytes through the API unless needed; generate a pre-signed URL and let the browser fetch it” (while still enforcing RBAC or access checks before issuing that URL).

## 2) RBAC patterns (global roles + site roles)

### Global role enforcement
- `packages/backend/src/middleware/requireRole.ts`
  - `requireRole(...allowedRoles: Array<'super_admin' | 'user'>)` at **line 4**.
  - Denies if role not allowed at **line 15**.

**Usage example:** Create site is `super_admin` only:
- `packages/backend/src/routes/sites.ts` uses `requireRole('super_admin')` at **line 28**.

### Site-scoped access + roles
- `packages/backend/src/middleware/requireSiteAccess.ts`
  - Adds `request.siteRole?: 'admin' | 'viewer' | null` at **line 6**.
  - Uses `const siteId = request.params.id;` at **line 15** (IMPORTANT: param name is hard-coded to `id`).
  - Super admin shortcut sets `request.siteRole = 'admin'` at **line 26**.
  - Regular users: role comes from `user.sites[siteId]` at **line 31**, sets `request.siteRole` at **line 39**.

**Usage example:** “admin-only within a site” is an explicit check:
- `packages/backend/src/routes/sites.ts` checks `if (request.siteRole !== 'admin')` at **line 155** and returns 403 with message at **line 158**.

### Practical RBAC guidance for Phase B endpoints
Given the above, Phase B can express RBAC as:

- **Viewer+ endpoints:** `onRequest: [fastify.authenticate, requireSiteAccess]` (site roles are already viewer/admin).
- **Admin-only endpoints:** same as viewer+, plus a route-level guard `if (request.siteRole !== 'admin') { ...403... }` (as in `sites.ts:155`).

**Critical detail for route design:** if you want to reuse `requireSiteAccess` unchanged, the route param must be `:id` (not `:siteId`) because it reads `request.params.id` (`requireSiteAccess.ts:15`).

**Roadmap contract note:** Phase B roadmap calls out site-scoped admin APIs as `/api/sites/:siteId/*`. To avoid contract drift, Phase B should update `requireSiteAccess` to support **both** param names (`:id` and `:siteId`) and standardize new/updated routes on `:siteId`.

## 3) Site resolution: how `request.site` is attached
- `packages/backend/src/middleware/siteResolution.ts`
  - Middleware factory `createSiteResolutionMiddleware()` at **line 9**.
  - Explicitly skips `request.url.startsWith('/api/')` at **line 13**, so admin APIs do **not** get `request.site` attached.
  - Uses `const hostname = request.hostname;` at **line 19**.
  - Uses cache lookup `cacheService.getSiteByHostname(hostname)`.
  - Attaches `request.site = site;` at **line 41**.

**Implications for Content endpoints:**
- All `/api/sites/:id/...` content management routes should **not** expect `request.site` to be set by `siteResolution`.
- Public content serving routes **will** have `request.site` set *only if the incoming hostname matches a configured site*.

## 4) Access-control pipeline: how to protect a public serving endpoint

### Global request pipeline (hook ordering)
- `packages/backend/src/index.ts`
  - Global hooks are added in order:
    - site resolution: `addHook('onRequest', siteResolutionMiddleware)` at **line 162**
    - IP checks: `addHook('onRequest', ipAccessControl)` at **line 163**
    - GPS checks wrapper (calls `gpsAccessControl`) begins at **line 166**, invokes `gpsAccessControl(...)` at **line 176**

### IP access-control prerequisites
- `packages/backend/src/middleware/ipAccessControl.ts`
  - Requires `request.site` to be set (see comment) and skips if absent.
  - Enforces only for `access_mode` `ip_only` and `ip_and_geo` (gate at **line 40**).

### GPS access-control contract
- `packages/backend/src/middleware/gpsAccessControl.ts`
  - Accepts GPS via headers `x-gps-lat`, `x-gps-lng`, `x-gps-accuracy` (doc block begins at **line 22**).
  - Extract helper `extractGPSCoordinates()` at **line 31**.
  - Denies with `reason: 'gps_required'` at **line 116**.
  - Denies outside geofence with `reason: 'outside_geofence'` at **line 185**.

### Design options for CONTENT-003 (public serving)
**Option A (fits current pipeline best): host-based public serving**
- Use a route like `GET /content/:key(.*)` on the site’s hostname.
- Pros: `siteResolution` works as-is (hostname → site), and IP/GPS checks run automatically.
- Cons: URL structure differs from roadmap’s `/s/:siteId/...`.

**Option B (roadmap shape): path-based serving** (`/s/:siteId/content/:filename`)
- Pros: predictable URL that doesn’t depend on hostname.
- Cons: **siteResolution cannot resolve a site from `:siteId` today** (it resolves only by `request.hostname`), so IP/GPS checks will likely no-op because `request.site` is missing.
  - To make this work you need a new “resolve site by id/slug from params” middleware that:
    1) loads the site (DB/cache),
    2) assigns `request.site`,
    3) runs **before** `ipAccessControl` / GPS wrapper.

Recommendation (implementation planning): choose A unless you explicitly need multi-site serving under a single hostname.

## 5) Frontend file upload patterns (what exists vs what Phase B must add)

### What exists
- Axios instance + auth token injection:
  - `packages/frontend/src/lib/api.ts`: `axios.create` at **line 12**, request interceptor at **line 20**.
- React Query usage pattern (list pages):
  - `packages/frontend/src/pages/AccessLogsPage.tsx`: site list query at **line 40**, logs query at **line 45**.
- UI primitives used for tables/forms:
  - `AccessLogsPage.tsx` demonstrates `Card`, `Table`, `Select`, `Input`, etc.

### What does *not* exist (as of now)
- No `FormData` usage and no multipart file upload helpers were found in `packages/frontend/src/**`.

### Suggested Phase B frontend upload approach (aligned with existing patterns)
- Use a dedicated API module (mirrors `accessLogApi`): create `contentApi` with Axios calls.
- Use `useMutation` for uploads/deletes and `useQuery` for listing.
- For upload, build a `FormData`, call `api.post(...)`, and let React Query invalidate the list query.

(Implementation detail for Planner: Axios can send FormData without manually setting `Content-Type`; letting Axios set the boundary is usually safest.)

## 6) API client patterns (frontend)
- `packages/frontend/src/lib/api.ts`
  - Central `api` instance is exported and used by modules.
  - Existing API modules follow the pattern:
    - `siteApi` lives in `api.ts` (site CRUD)
    - `accessLogApi` lives in `lib/accessLogApi.ts` (resource-specific API module)

Recommendation for Phase B: follow the `accessLogApi.ts` style (separate `contentApi.ts`) to avoid bloating `api.ts`.

## 7) Routing structure (backend + frontend)

### Backend
- Route registration occurs in `packages/backend/src/index.ts`:
  - `await server.register(authRoutes, { prefix: '/api/auth' });` at **line 236**
  - `await server.register(siteRoutes, { prefix: '/api' });` at **line 237**
  - `await server.register(siteRoleRoutes, { prefix: '/api/sites' });` at **line 238**
  - `await server.register(accessLogRoutes, { prefix: '/api' });` at **line 239**

Recommendation for Phase B:
- Create `packages/backend/src/routes/content.ts` and register it in `index.ts` with a prefix consistent with site-scoped routes (likely `/api/sites`).

### Frontend
- App routes are declared in `packages/frontend/src/App.tsx`:
  - Router setup at **line 1**.
  - Existing site editor uses `sites/:id/edit` at **line 20**.

Recommendation for Phase B:
- Add a page route using the existing `:id` param naming convention, e.g. `sites/:id/content`.
- Add a navigation entry in `packages/frontend/src/components/Layout.tsx`:
  - Navigation array begins at **line 7** with current items at **lines 8–9**.

## Don’t hand-roll (use what’s already there)
| Feature | Use instead | Why |
|---|---|---|
| S3 signing logic | `S3Service.getPresignedUrl()` | Already in repo; consistent w/ Phase 4 artifacts (`gdpr.ts:107`) |
| RBAC | `requireSiteAccess` + route-level `request.siteRole` checks | Established pattern used by site update (`sites.ts:155`) |
| Public access gating | Global `onRequest` hooks | Already enforce IP/GPS based on site config (`index.ts:162–181`) |

## Common pitfalls to flag for the Planner
1. **Route param name mismatch breaks `requireSiteAccess` unless updated.** Today the middleware reads `request.params.id` (`requireSiteAccess.ts:15`). If Phase B adopts the roadmap’s `:siteId` param, update the middleware to support both (`:id` and `:siteId`) before switching routes.
2. **Public endpoint shape must match site resolution.** With the current `siteResolution` design (hostname-only), a `/s/:siteId/...` route won’t get `request.site` unless you add extra resolution logic.
3. **Env var mismatch for storage.** Backend docker uses `MINIO_*` but `S3Service` reads `AWS_S3_*`. Decide how to unify before building ContentService.
4. **RBAC field inconsistencies across code paths.** Some routes read JWT fields differently (e.g., `gdpr.ts` uses `request.user.id` and `globalRole`, while `authenticateJWT.ts` defines `userId`/`role`). Phase B should follow the established middleware (`requireSiteAccess`, `requireRole`) rather than ad-hoc parsing.

## Sources
| Source | Type | Confidence |
|---|---|---|
| `packages/backend/src/services/S3Service.ts` | Code | HIGH |
| `packages/workers/src/screenshot-worker.ts` | Code | HIGH |
| `packages/backend/src/routes/gdpr.ts` | Code | HIGH |
| `packages/backend/src/middleware/requireRole.ts` | Code | HIGH |
| `packages/backend/src/middleware/requireSiteAccess.ts` | Code | HIGH |
| `packages/backend/src/middleware/siteResolution.ts` | Code | HIGH |
| `packages/backend/src/middleware/ipAccessControl.ts` | Code | HIGH |
| `packages/backend/src/middleware/gpsAccessControl.ts` | Code | HIGH |
| `packages/backend/src/index.ts` | Code | HIGH |
| `packages/backend/src/routes/sites.ts` | Code | HIGH |
| `packages/frontend/src/lib/api.ts` | Code | HIGH |
| `packages/frontend/src/lib/accessLogApi.ts` | Code | HIGH |
| `packages/frontend/src/pages/AccessLogsPage.tsx` | Code | HIGH |
| `packages/frontend/src/components/Layout.tsx` | Code | HIGH |
| `packages/frontend/src/App.tsx` | Code | HIGH |
| `docker-compose.yml`, `docker-compose.dev.yml` | Config | HIGH |
| `.planning/phases/4/IMPLEMENTATION_SUMMARY.md` | Planning doc | MEDIUM |
