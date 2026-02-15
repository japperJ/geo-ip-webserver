# Improvement Roadmap: Geo-IP Webserver (geo v1) — Port Best Features + Close Gaps

**Version:** 1.0  
**Last Updated:** 2026-02-15  
**Project Type:** Stabilization + feature completion (geo v1 → “production-complete”)  
**Baseline Reality:** geo v1 is ~85–90% implemented but has critical bugs, security gaps, and missing product surfaces.

---

## Executive Summary

This roadmap is a **new, post-Phase-5 improvement plan** for geo v1. It focuses on:

1. **Unblocking correctness + security first** (GPS middleware wiring, GDPR privacy violations, JWT storage risk, API type mismatches).
2. **Porting the highest-value missing capability** from geo2: **site content management**.
3. Filling remaining admin UX gaps (registration + user & site delegation UIs).
4. Completing the **async screenshot worker** architecture that geo v1 already chose (BullMQ + Playwright).
5. Adding a pragmatic **audit log CSV export**.
6. Synchronizing documentation to reflect reality and expose Swagger UI.

This roadmap preserves the user’s priorities and decisions:
- **Keep Node.js/Fastify/TypeScript** (do not port the Python stack).
- **Port concepts, not code** from geo2/geo3.
- **Keep BullMQ async** for screenshots (avoid geo2’s synchronous request blocking).
- **Explicitly excluded for this project:** cookie banner, CSRF middleware, email verification, dashboard page (lower priority).

---

## Phase Overview

| Phase | Name | Est. Duration | Goal | Dependencies |
|---|---|---:|---|---|
| **A** | Critical Bug Fixes | 3–7 days | Restore correctness + close security/privacy gaps | None |
| **B** | Content Management (geo2 concept port) | 1–2 weeks | Add per-site content upload/list/delete + public serving | Phase A |
| **C** | Missing Frontend Pages | 1–2 weeks | Complete user/admin surfaces (register, users, delegation, nav) | Phase A (and B for Content UI) |
| **D** | Screenshot Worker (BullMQ async) | 4–10 days | Implement queue worker + UI viewer for screenshots | Phase A (recommended), Phase B/C optional |
| **E** | Audit Log CSV Export | 2–5 days | Export filtered logs as CSV + frontend button | Phase A |
| **F** | Documentation Sync | 2–5 days | Make docs match reality + add Swagger UI | Phase A (recommended) |

**Estimated total:** ~4–8 weeks (single developer, normal interruption).  
**Critical path:** A → B → C (parallelizable with D/E/F after A).

---

## Phase A: Critical Bug Fixes *(blocks everything)*

**Objective:** Make existing features real, safe, and testable. This phase restores GPS enforcement, prevents GDPR data leaks, aligns frontend/backend contracts, and removes high-risk auth storage practices.

### Tasks

- **BUG-001: Wire GPS middleware into request pipeline**
  - **Outcome:** `gpsAccessControl.ts` is actually executed for `geo_*` access modes.
  - **Primary file:** `packages/backend/src/index.ts`

- **BUG-002: Fix GDPR export/delete user filtering (privacy violation)**
  - **Outcome:** `exportUserData()` and `deleteUserData()` are scoped to the requesting user (no cross-tenant/user data leakage).
  - **Primary file:** `packages/backend/src/services/GDPRService.ts`

- **BUG-003: Align frontend API types with backend access_mode + geofence fields**
  - **Outcome:** Frontend models correctly reflect backend modes: `'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo'` (and associated geofence fields).
  - **Primary file:** `packages/frontend/src/lib/api.ts`

- **SEC-001: Move JWT access token out of localStorage**
  - **Outcome:** No JWT persisted in localStorage (mitigates XSS token theft risk).
  - **Primary files:**
    - `packages/frontend/src/pages/LoginPage.tsx`
    - `packages/frontend/src/lib/auth.tsx`

- **CHORE-001: Remove debug console logs**
  - **Primary files:**
    - `packages/frontend/src/lib/auth.tsx`
    - `packages/frontend/src/components/ProtectedRoute.tsx`

- **CHORE-002: Update version label to reflect current reality**
  - **Primary file:** `packages/frontend/src/components/Layout.tsx`

### Deliverables
- GPS geofencing is enforced in the live request pipeline.
- GDPR user export/delete does not leak other users’ logs.
- Frontend compiles cleanly with correct access mode + geofence typing.
- JWT is not stored in localStorage.
- Debug logs removed; UI version label updated.

### Phase Verification (must pass)
From the user’s verification gates:
- `npm test -w packages/backend` passes.
- GPS geofencing works with GPS headers (i.e., requests can be blocked/allowed based on GPS).
- GDPR export returns **only** requesting user’s data.
- JWT is **absent** from localStorage.

### Dependencies
- None. This phase is the foundation for all remaining work.

### Relevant Files (touched in this phase)
- `packages/backend/src/index.ts`
- `packages/backend/src/services/GDPRService.ts`
- `packages/frontend/src/lib/api.ts`
- `packages/frontend/src/lib/auth.tsx`
- `packages/frontend/src/pages/LoginPage.tsx`
- `packages/frontend/src/components/ProtectedRoute.tsx`
- `packages/frontend/src/components/Layout.tsx`

---

## Phase B: Content Management *(ported from geo2 — biggest missing feature)*

**Objective:** Add per-site content storage and serving, using geo v1’s existing Node/TypeScript patterns and existing S3/MinIO integration patterns.

### Tasks

- **CONTENT-001: Implement ContentService (S3-backed)**
  - **Outcome:** Upload/download/delete/list per site.
  - **Create:** `packages/backend/src/services/ContentService.ts`
  - **Reference:** geo2 `backend/app/services/content.py` (concepts only)

- **CONTENT-002: Add content API routes (RBAC enforced)**
  - **Outcome:**
    - `GET /api/sites/:siteId/content` (viewer+)
    - `POST /api/sites/:siteId/content/upload` (admin)
    - `DELETE /api/sites/:siteId/content/:key` (admin)
  - **Create:** `packages/backend/src/routes/content.ts`

- **CONTENT-003: Add public content serving endpoint with access-control pipeline**
  - **Outcome:** `GET /s/:siteId/content/:filename` enforces access control before serving.

- **CONTENT-004: Add content UI page**
  - **Outcome:** Admin UI for list/upload/download/delete with sensible UX (icons, sizes, hints).
  - **Create:** `packages/frontend/src/pages/SiteContentPage.tsx`
  - **Modify:** `packages/frontend/src/lib/api.ts` (content API client)
  - **Reference:** geo2 `frontend/src/pages/SiteContent.tsx` (concepts only)

### Deliverables
- S3/MinIO content management available per site.
- Public serving endpoint is protected by the same access control logic as the site.
- Content management UI integrated into admin app.

### Phase Verification (must pass)
From the user’s verification gates:
- Upload file → appears in MinIO.
- List returns uploaded file.
- Public endpoint serves content (or returns 403 when blocked).
- Role restrictions work (viewer can list/download; admin can upload/delete).

### Dependencies
- **Hard:** Phase A (stability + correct auth/typing assumptions).

### Relevant Files
- **Create:**
  - `packages/backend/src/services/ContentService.ts`
  - `packages/backend/src/routes/content.ts`
  - `packages/frontend/src/pages/SiteContentPage.tsx`
- **Modify:**
  - `packages/frontend/src/lib/api.ts`
  - `packages/frontend/src/App.tsx` (routing)
  - `packages/frontend/src/components/Layout.tsx` (nav)

---

## Phase C: Missing Frontend Pages *(ported from geo2 patterns)*

**Objective:** Complete core admin surfaces that the backend already supports (or that are required for multi-tenant operations): registration, super-admin user management, and site delegation UI.

### Tasks

- **UI-REG-001: Add registration page**
  - **Outcome:** `RegisterPage.tsx` calls existing `POST /api/auth/register`.
  - **Create:** `packages/frontend/src/pages/RegisterPage.tsx`

- **UI-USERS-001: Add super_admin user management page**
  - **Outcome:** List/create/delete users, change roles (super_admin only).
  - **Create:** `packages/frontend/src/pages/UsersPage.tsx`

- **UI-SITEUSERS-001: Add site delegation page**
  - **Outcome:** Assign/remove users + roles for a specific site.
  - **Create:** `packages/frontend/src/pages/SiteUsersPage.tsx`
  - **Reference:** geo2 `frontend/src/pages/SiteUsers.tsx` (concepts only)

- **UI-NAV-001: Update app routing + navigation**
  - **Outcome:** Layout shows “Users” (admin-only) + site sub-nav entries for Content + Site Users.
  - **Modify:**
    - `packages/frontend/src/components/Layout.tsx`
    - `packages/frontend/src/App.tsx`

### Deliverables
- Registration UI exists and is usable.
- Super admin can manage users from the UI.
- Site-specific user delegation is manageable from the UI.
- Navigation reflects the real product surfaces.

### Phase Verification (must pass)
From the user’s verification gates:
- Register → login works.
- Super admin sees Users navigation.
- Site delegation works end-to-end.

### Dependencies
- **Hard:** Phase A (auth/token handling and type alignment).
- **Soft:** Phase B (if Content nav/page is introduced here, the backend routes should exist).

### Relevant Files
- **Create:**
  - `packages/frontend/src/pages/RegisterPage.tsx`
  - `packages/frontend/src/pages/UsersPage.tsx`
  - `packages/frontend/src/pages/SiteUsersPage.tsx`
- **Modify:**
  - `packages/frontend/src/components/Layout.tsx`
  - `packages/frontend/src/App.tsx`

---

## Phase D: Screenshot Worker *(BullMQ async; port geo2 capture concepts)*

**Objective:** Implement the missing worker that consumes screenshot jobs, captures via Playwright, uploads to S3/MinIO, and links artifacts to access log records—without blocking requests.

### Tasks

- **WORKER-001: Implement screenshot worker process**
  - **Outcome:** BullMQ Worker consumes screenshot queue jobs.
  - **Create:** `packages/workers/src/screenshotWorker.ts`
  - **Reference:** geo2 `backend/app/services/screenshot.py` (capture logic concepts only)

- **WORKER-002: Ensure access logs link to screenshot artifacts**
  - **Outcome:** Successful worker run results in PNG stored in MinIO + access log record updated to reference it.
  - **Note:** geo v1 already chose the async architecture—this task completes it.

- **UI-LOGS-001: Add screenshot viewer to access logs page**
  - **Outcome:** Access log detail modal shows thumbnail/link when screenshot artifact exists.
  - **Modify:** `packages/frontend/src/pages/AccessLogsPage.tsx`

### Deliverables
- Blocked request → screenshot job processed async.
- Screenshot stored in MinIO/S3 and visible from admin UI.

### Phase Verification (must pass)
From the user’s verification gates:
- Blocked request → BullMQ job → worker captures screenshot → PNG in MinIO → visible in log detail.

### Dependencies
- **Recommended:** Phase A (stability and security fixes reduce test noise).
- **Assumed existing:** Queue + services for enqueue already present in geo v1; if not, scope expands.

### Relevant Files
- **Create:** `packages/workers/src/screenshotWorker.ts`
- **Modify:** `packages/frontend/src/pages/AccessLogsPage.tsx`

---

## Phase E: Audit Log CSV Export *(ported from geo2 concept)*

**Objective:** Provide a practical export for audits and incident review: filterable CSV export of access logs per site.

### Tasks

- **EXPORT-001: Add CSV export endpoint**
  - **Outcome:** `GET /api/sites/:siteId/access-logs/export` returns CSV with filters (date, decision, IP).
  - **Modify:** `packages/backend/src/routes/accessLogs.ts`
  - **Reference:** geo2 `backend/app/api/audit.py export_audit_logs_csv()` (concepts only)

- **EXPORT-002: Add Export CSV UI**
  - **Outcome:** “Export CSV” button downloads filtered CSV.
  - **Modify:** `packages/frontend/src/pages/AccessLogsPage.tsx`

### Deliverables
- CSV export available per site with filters.
- Frontend exposes export affordance.

### Phase Verification (must pass)
From the user’s verification gates:
- “Export CSV” downloads filtered CSV file.

### Dependencies
- **Hard:** Phase A (type correctness and baseline test health).

### Relevant Files
- `packages/backend/src/routes/accessLogs.ts`
- `packages/frontend/src/pages/AccessLogsPage.tsx`

---

## Phase F: Documentation Sync *(last)*

**Objective:** Make the repo’s planning docs consistent with reality and improve operability by adding Swagger UI.

### Tasks

- **DOC-001: Update STATE.md to reflect current reality**
  - **Outcome:** `.planning/STATE.md` no longer claims Phase 0 only; reflects current completion and this new A–F improvement plan status.
  - **Modify:** `.planning/STATE.md`

- **DOC-002: Add Swagger/OpenAPI docs**
  - **Outcome:** Swagger UI accessible at `/documentation`.
  - **Modify:** `packages/backend/src/index.ts`
  - **Note:** Existing Zod schemas should be leveraged.

### Deliverables
- Planning state is accurate and helpful.
- API is discoverable via Swagger UI.

### Phase Verification (must pass)
From the user’s verification gates:
- STATE.md accurate.
- Swagger UI accessible at `/documentation`.

### Dependencies
- **Recommended:** Do after Phase A (and preferably after most functional changes) to avoid repeated doc churn.

### Relevant Files
- `.planning/STATE.md`
- `packages/backend/src/index.ts`

---

## Cross-Phase File Coverage (from the user’s “Relevant Files” list)

All of the following are explicitly in-scope across phases A–F:

### Modify
- `packages/backend/src/index.ts` *(Phase A: GPS wire; Phase F: Swagger)*
- `packages/backend/src/services/GDPRService.ts` *(Phase A)*
- `packages/frontend/src/lib/api.ts` *(Phase A/B)*
- `packages/frontend/src/lib/auth.tsx` *(Phase A)*
- `packages/frontend/src/pages/LoginPage.tsx` *(Phase A)*
- `packages/frontend/src/components/Layout.tsx` *(Phase A/C, plus Content nav for B)*
- `packages/frontend/src/components/ProtectedRoute.tsx` *(Phase A)*
- `packages/frontend/src/App.tsx` *(Phase B/C)*
- `packages/backend/src/routes/accessLogs.ts` *(Phase E)*
- `packages/frontend/src/pages/AccessLogsPage.tsx` *(Phase D/E)*
- `.planning/STATE.md` *(Phase F)*

### Create
- `packages/backend/src/services/ContentService.ts` *(Phase B)*
- `packages/backend/src/routes/content.ts` *(Phase B)*
- `packages/workers/src/screenshotWorker.ts` *(Phase D)*
- `packages/frontend/src/pages/SiteContentPage.tsx` *(Phase B)*
- `packages/frontend/src/pages/RegisterPage.tsx` *(Phase C)*
- `packages/frontend/src/pages/UsersPage.tsx` *(Phase C)*
- `packages/frontend/src/pages/SiteUsersPage.tsx` *(Phase C)*

---

## References (concepts only; do not copy code)

### From geo2
- `backend/app/services/content.py` — content service behaviors
- `backend/app/api/content.py` — RBAC patterns for content endpoints
- `backend/app/services/screenshot.py` — Playwright capture concepts
- `backend/app/api/audit.py` — CSV export behavior
- `frontend/src/pages/SiteContent.tsx` — content UI behavior
- `frontend/src/pages/SiteUsers.tsx` — site delegation UI behavior
- `frontend/src/services/api.ts` — client endpoint coverage

### From geo3
- `backend/app/admin/repositories/serialization.py` — geometry serialization helpers (reference only)
- `backend/app/admin/repositories/` — repository pattern (geo v1’s service layer is already equivalent)

---

## Updated TODO List

- [x] Read the user plan from `untitled:plan-portBestFeaturesFixGaps.prompt.md`
- [x] Read existing `.planning/ROADMAP.md` to match format expectations
- [x] Create new roadmap document `.planning/PORT_FEATURES_ROADMAP.md` (do not modify existing ROADMAP)
- [x] Convert phases A–F into formal phases with objectives, task IDs, success criteria, dependencies, duration, deliverables
- [x] Include all files from the user’s “Relevant Files” section
- [x] Add phase-specific verification criteria from the user’s “Verification” section
- [x] Preserve user decisions and explicitly excluded items
