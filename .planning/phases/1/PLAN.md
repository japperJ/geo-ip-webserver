# Phase 1 Task Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the Phase 1 MVP for IP-based access control with MaxMind integration, access logging, and an admin UI that meets Phase 1 success criteria, including validated database migrations and API route accessibility.

**Architecture:** Build a Fastify backend with service and middleware layers, PostgreSQL persistence, and a React admin SPA. Implement IP access control as a Fastify hook, backed by MaxMind MMDB readers with LRU caching. UI uses React Router + TanStack Query for CRUD and logs. Ensure migrations are runnable and access-control middleware does not block API routes.

**Tech Stack:** Node.js 22, Fastify, TypeScript, PostgreSQL 16, MaxMind MMDB, ipaddr.js, React 18, Vite, React Router v6, TanStack Query v5, Playwright, Vitest.

---

## Phase 1 Scope and Success Criteria

- **In Scope:** MVP-001 through MVP-023 as defined in `.planning/ROADMAP.md` Phase 1.
- **Out of Scope:** Phase 2+ GPS features, multi-site/RBAC, artifacts, production hardening.
- **Success Criteria:** SC-1.1 to SC-1.10 in `.planning/ROADMAP.md` Phase 1.

---

## Must-Haves Traceability (Phase 1)

| Success Criteria | Related Requirements | Tasks | Tests |
|---|---|---|---|
| SC-1.1 Create site via API | REQ-F-001, REQ-F-004, REQ-NF-007 | MVP-001, MVP-002, MVP-003, MVP-015 | API tests for create + validation (Task 3), service tests (Task 5) |
| SC-1.2 Allowed IP returns 200 + logged | REQ-F-007, REQ-F-011, REQ-F-027 | MVP-006, MVP-007, MVP-008, MVP-010 | Middleware integration tests (Task 10) |
| SC-1.3 Blocked IP returns 403 + reason | REQ-F-008, REQ-F-027 | MVP-007, MVP-008, MVP-010 | Middleware integration tests (Task 10) |
| SC-1.4 Blocked country returns 403 | REQ-F-009 | MVP-005, MVP-007, MVP-008 | Middleware integration tests (Task 10) |
| SC-1.5 VPN/proxy blocked when enabled | REQ-F-010 | MVP-005, MVP-007, MVP-008 | Middleware integration tests (Task 10) |
| SC-1.6 Admin UI CRUD sites | REQ-F-001, REQ-F-002, REQ-F-003, REQ-F-017, REQ-F-018 | MVP-015, MVP-016, MVP-017, MVP-018 | UI tests/E2E (Task 22) |
| SC-1.7 Admin UI displays logs with pagination | REQ-F-020, REQ-F-030 | MVP-012, MVP-019, MVP-020 | API/UI tests for pagination + filters (Tasks 13, 20) |
| SC-1.8 SQL queries parameterized | REQ-NF-007 | MVP-001, MVP-003, MVP-004 | Service tests + code review checklist (Task 5) |
| SC-1.9 IP anonymized in logs | REQ-F-028 | MVP-011, MVP-010 | Unit tests for anonymizeIP (Task 12) |
| SC-1.10 Unit coverage >80% services/utils | REQ-F-028, REQ-NF-007 | MVP-004, MVP-005, MVP-006, MVP-007, MVP-011, MVP-012 | Coverage gating in CI (Task 5) |

---

## Task-Level Plan (Phase 1)

### Task 1: Confirm baseline project structure, migrations, and dependencies

**Files:**
- Inspect: `packages/`, `package.json`, `packages/backend/`, `packages/frontend/`

**Steps:**
1. Verify Phase 0 deliverables exist (backend, frontend, DB, migrations system).
2. Confirm database migrations directory and execution command exist and are documented.
3. Verify DEV-006 migration is present and applied (`access_logs` table exists).
4. Check for existing Fastify/React setups, and note any existing conventions.
5. Identify test runners in use (Vitest/Jest, Playwright) and their config paths.
6. Document findings in plan notes before coding.

### Task 2: MVP-001 Site model and service layer

**Files:**
- Create/Modify: `packages/backend/src/models/Site.ts`
- Create/Modify: `packages/backend/src/services/SiteService.ts`
- Modify: `packages/backend/src/db/index.ts` (if needed for typed queries)

**Steps:**
1. Define Site types that map to `sites` table (include allow/deny lists, country lists, block flag, `deleted_at`).
2. Implement CRUD methods using parameterized queries (list, getById, create, update, delete).
3. Implement soft delete (set `deleted_at`, exclude deleted from list/getById unless explicitly requested).
4. Add list pagination, filtering by `access_mode`, and search by name/hostname with total count.
5. Add default values (e.g., `block_vpn_proxy` default true if undefined).
6. Add minimal validation helpers for required fields (defer schema validation to MVP-003).
7. Add unit tests for service (create/get/update/delete, soft delete, search/filter, pagination/total).

### Task 3: MVP-002 Site CRUD API routes

**Files:**
- Create/Modify: `packages/backend/src/routes/sites.ts`
- Modify: `packages/backend/src/app.ts` (route registration)

**Steps:**
1. Implement REST endpoints under `/api/admin/sites`: POST/GET list/GET by id/PATCH/DELETE.
2. Ensure correct status codes (201/200/204/404/409/422) and response shapes.
3. Wire routes to SiteService and handle errors with standard Fastify error handler.
4. Add list pagination (page/limit), total count, access_mode filter, and search by name/hostname.
5. Add API tests for endpoints (basic success + not found + list pagination/search/filter).

### Task 4: MVP-003 Request/response validation

**Files:**
- Create/Modify: `packages/backend/src/schemas/site.ts`
- Modify: `packages/backend/src/routes/sites.ts`
- Modify: `packages/backend/src/app.ts` (error handler)

**Steps:**
1. Define JSON schemas for create/update/list/get responses.
2. Validate hostname, slug, IP CIDR lists, ISO country codes, access_mode enum.
3. Add schema to route options for automatic validation.
4. Standardize validation errors in error handler.
5. Add tests for invalid payloads (invalid hostname, CIDR, country code).

### Task 5: MVP-004 Unit tests for SiteService

**Files:**
- Create/Modify: `packages/backend/src/services/__tests__/SiteService.test.ts`

**Steps:**
1. Add tests for create, list, getById, update, delete.
2. Add tests for SQL injection attempts (ensure parameterization).
3. Add tests for list filters (access_mode), search (name/hostname), and pagination totals.
4. Enforce coverage gating for services/utils (>=80%) in unit test config.
5. Run unit test suite; confirm >80% coverage for service layer.

### Task 6: MVP-005 MaxMind GeoIP service

**Files:**
- Create: `packages/backend/src/services/GeoIPService.ts`
- Modify: `packages/backend/src/app.ts` (init on startup)
- Modify: `packages/backend/src/config/env.ts` (paths)

**Steps:**
1. Implement GeoIPService with City + Anonymous IP readers and LRU cache.
2. Add `init()` and fail-fast if DB missing, unless explicitly documented as dev-only optional.
3. Implement `lookup()` and `isAnonymous()` APIs.
4. Ensure GeoIPService is a singleton/shared dependency reused by middleware and AccessLogService.
5. Add health check flag for loaded readers.
6. Add unit tests using mocked readers.

### Task 7: MVP-006 Client IP extraction utility

**Files:**
- Create: `packages/backend/src/utils/getClientIP.ts`
- Modify: `packages/backend/src/app.ts` (trustProxy config)

**Steps:**
1. Implement header parsing (X-Forwarded-For, X-Real-IP) with validation.
2. Fallback to socket remote address.
3. Add unit tests for header parsing and invalid IPs.

### Task 8: MVP-007 IP access control middleware

**Files:**
- Create: `packages/backend/src/middleware/ipAccessControl.ts`
- Create: `packages/backend/src/utils/cidr.ts`

**Steps:**
1. Implement CIDR matching with `ipaddr.js` (denylist first, then allowlist).
2. Integrate GeoIP lookup for country allow/deny.
3. Enforce VPN/proxy blocking (default true if null/undefined).
4. Return 403 with reason codes for each block.
5. Add integration tests with mocked GeoIP service.

### Task 9: MVP-008 Integrate middleware into request pipeline

**Files:**
- Modify: `packages/backend/src/app.ts`
- Modify: `packages/backend/src/middleware/index.ts`

**Steps:**
1. Register `siteResolution` and `ipAccessControl` in Fastify hooks (onRequest).
2. Ensure middleware skips `/api/*` and `/health` to avoid blocking API routes.
3. Ensure site resolution for Phase 1 uses a single-site config only (no hostname lookup/caching in Phase 1).
4. Wire AccessLogService writes in middleware for allowed/blocked outcomes.
5. Add a test route for middleware integration.
6. Add tests for middleware pipeline ordering and API route bypass.

### Task 10: MVP-009 Integration tests for access control

**Files:**
- Create/Modify: `packages/backend/src/middleware/__tests__/ipAccessControl.test.ts`

**Steps:**
1. Test allowlist success (200).
2. Test denylist block (403, reason).
3. Test country block (403, reason).
4. Test VPN/proxy block (403, reason).
5. Add test case asserting API routes are not blocked by access-control hooks.
6. Run integration test suite in CI.

### Task 11: MVP-010 AccessLogService

**Files:**
- Create: `packages/backend/src/services/AccessLogService.ts`
- Modify: `packages/backend/src/app.ts`

**Steps:**
1. Verify `access_logs` table exists (DEV-006 migration applied) before wiring service.
2. Implement async log insertion with non-blocking behavior.
3. Include required fields from requirements (timestamp, site, decision, reason, geo data, user agent, URL, user_id when available).
4. Log to Pino (anonymized IP).
5. Add unit tests (mock DB) and ensure deterministic behavior in tests (test-mode sync or flush helper).

### Task 12: MVP-011 IP anonymization utility

**Files:**
- Create: `packages/backend/src/utils/anonymizeIP.ts`
- Modify: `packages/backend/src/services/AccessLogService.ts`

**Steps:**
1. Implement IPv4 and IPv6 anonymization.
2. Add tests for IPv4/IPv6 cases.
3. Ensure AccessLogService uses anonymized IP.

### Task 13: MVP-012 Log query API

**Files:**
- Create/Modify: `packages/backend/src/routes/logs.ts`
- Modify: `packages/backend/src/app.ts`
- Create/Modify: `packages/backend/src/services/AccessLogService.ts`

**Steps:**
1. Implement GET `/api/admin/access-logs` with pagination, total count, and filtering.
2. Add query validation (page/limit, decision, site_id, date range, ip partial).
3. Enforce RBAC visibility (only assigned sites).
4. Add tests for list pagination, total count, and filters.

### Task 14: MVP-013 Log retention job placeholder

**Files:**
- Create: `packages/backend/src/jobs/logRetention.ts`
- Modify: `packages/backend/src/app.ts`

**Steps:**
1. Add node-cron job placeholder that logs intent.
2. Keep deletion logic stubbed for Phase 4.
3. Add unit test to ensure job schedules without error.

### Task 15: MVP-014 Admin UI layout and routing

**Files:**
- Create/Modify: `packages/frontend/src/App.tsx`
- Create/Modify: `packages/frontend/src/routes.tsx`
- Create: `packages/frontend/src/layouts/AdminLayout.tsx`

**Steps:**
1. Create base layout (nav + sidebar).
2. Configure routes: `/sites`, `/sites/new`, `/sites/:id`, `/sites/:id/logs`.
3. Add responsive layout support.
4. Add smoke test (render + route).

### Task 16: MVP-015 Site list page

**Files:**
- Create: `packages/frontend/src/pages/SitesPage.tsx`
- Modify: `packages/frontend/src/routes.tsx`
- Modify: `packages/frontend/src/lib/api.ts`

**Steps:**
1. Fetch sites list from API with pagination, total count, access_mode filter, and search.
2. Render table with actions, status, and pagination controls.
3. Add loading/error states.
4. Add UI test for list rendering (if test setup exists).

### Task 17: MVP-016 Site editor page

**Files:**
- Create: `packages/frontend/src/pages/SiteEditorPage.tsx`
- Create: `packages/frontend/src/components/IPRulesEditor.tsx`
- Create: `packages/frontend/src/components/CountrySelector.tsx`

**Steps:**
1. Build create-site flow (`/sites/new`) and edit flow (`/sites/:id`).
2. Build form for site settings (name, slug on create, hostname, access mode, enable/disable).
2. Add IP allow/deny editors (textarea by line).
3. Add country allow/deny selector with ISO list.
4. Add VPN blocking toggle.
5. Wire POST create, PATCH update, and optimistic UI feedback.

### Task 18: MVP-017 UI IP list validation

**Files:**
- Modify: `packages/frontend/src/components/IPRulesEditor.tsx`

**Steps:**
1. Validate CIDR and single IP formats using `ipaddr.js`.
2. Highlight invalid entries and show error messages.
3. Add form-level validation tests.

### Task 19: MVP-018 React Query setup

**Files:**
- Create/Modify: `packages/frontend/src/lib/queryClient.ts`
- Modify: `packages/frontend/src/main.tsx`
- Modify: `packages/frontend/src/hooks/useSiteMutations.ts`

**Steps:**
1. Configure QueryClient with defaults (5 min stale, 10 min cache).
2. Wrap app in QueryClientProvider.
3. Add mutations with invalidation and optimistic updates.
4. Add test for query hooks (if present in stack).

### Task 20: MVP-019 Access logs page

**Files:**
- Create: `packages/frontend/src/pages/AccessLogsPage.tsx`
- Modify: `packages/frontend/src/routes.tsx`

**Steps:**
1. Fetch logs from `/api/admin/access-logs` with pagination and total count.
2. Render logs table with allowed/blocked badge.
3. Add filters (site, decision, date range) and search by IP.
4. Add pagination controls.

### Task 21: MVP-020 Log detail view

**Files:**
- Create: `packages/frontend/src/components/AccessLogDetail.tsx`
- Modify: `packages/frontend/src/pages/AccessLogsPage.tsx`

**Steps:**
1. Add modal/drawer for log details (geo: country/region/city, GPS if present, UA, URL, reason).
2. Hook row click to open details.
3. Show anonymized IP; show full IP only for super_admin (Phase 3 RBAC integration).
4. Add UI test for modal rendering.

### Task 22: MVP-021 End-to-end tests

**Files:**
- Create/Modify: `packages/frontend/e2e/site-management.spec.ts`
- Create/Modify: `packages/frontend/e2e/access-logs.spec.ts`

**Steps:**
1. Create site, configure allowlist, validate UI flow.
2. Verify blocking behavior via API and log entry present.
3. Validate access logs view and detail modal.
4. Ensure tests run in CI with required env setup.

### Task 23: MVP-022 Deployment documentation

**Files:**
- Modify: `README.md`
- Create/Modify: `docs/deployment/phase-1.md`

**Steps:**
1. Document local setup (Docker Compose).
2. Document env vars (DB, MaxMind paths, trustProxy).
3. Add API documentation link or endpoint (Swagger if present).
4. Add staging deployment steps.

### Task 24: MVP-023 Staging deployment

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `infrastructure/nginx/` (if present)
- Update: `STAGING.md`

**Steps:**
1. Define staging compose overrides.
2. Add Nginx reverse proxy configuration for staging.
3. Validate deployment steps and document in `STAGING.md`.
4. Run smoke tests in staging.

---

## Phase 1 Verification Checklist

- API: Create site with valid hostname and IP allowlist (SC-1.1).
- Access control: allowed IP returns 200 (SC-1.2).
- Access control: blocked IP returns 403 with reason (SC-1.3).
- Access control: blocked country returns 403 with reason (SC-1.4).
- Access control: VPN/proxy blocked when enabled (SC-1.5).
- Admin UI: CRUD sites, view logs (SC-1.6, SC-1.7).
- SQL safety: parameterized queries confirmed (SC-1.8).
- Logs: IP anonymized (SC-1.9).
- Tests: Unit coverage > 80% for services/utils (SC-1.10).
- DB: access_logs table exists and is migrated (DEV-006 dependency from Phase 0).
- API: `/api/*` routes return 200/201 and are not blocked by middleware.

---

## Plan Notes

- Follow precedence order: denylist → allowlist → country blocking → VPN detection.
- Default `block_vpn_proxy` to true when null/undefined. **Policy deviation:** requirement REQ-F-010 specifies default false; keep true per user choice and document as intentional deviation.
- Fail fast on missing MaxMind databases in Phase 1 unless explicitly documented as dev-only optional.
- Trust proxy only in known reverse-proxy deployments.
- Ensure AccessLogService tests are deterministic (avoid async timing flakiness).
- Access mode enum values must match requirements: `disabled`, `ip_only`, `geo_only`, `ip_and_geo` (Phase 1 uses `disabled`/`ip_only` only).
- Avoid Phase 3 scope creep in site resolution: no hostname-based resolution or caching in Phase 1.
