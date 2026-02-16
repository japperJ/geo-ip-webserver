---
phase: E
plan: 0
type: implement
wave: 1
depends_on:
  - "Phase A complete (auth working end-to-end; JWT available in Axios interceptor)"
files_modified:
  - .planning/phases/E/PLAN.md
autonomous: true
must_haves:
  observable_truths:
    - "E1: Authenticated users with site access can download a CSV export of access logs for that site."
    - "E1: Export respects the same filter semantics as the Access Logs list (allowed/start_date/end_date/ip)."
    - "E1: Export endpoint is site-scoped and RBAC-gated via existing middleware patterns (fastify.authenticate + requireSiteAccess)."
    - "E2: AccessLogsPage provides an Export CSV button that downloads via an authenticated blob request (not window.location navigation) and preserves current filters."
    - "Phase E gate: Export CSV downloads a filtered CSV file."
  artifacts:
    - path: packages/backend/src/routes/accessLogs.ts
      has:
        - "GET /api/sites/:siteId/access-logs/export endpoint"
        - "RBAC enforcement: onRequest includes fastify.authenticate + requireSiteAccess"
        - "CSV response headers: Content-Type text/csv + Content-Disposition attachment"
    - path: packages/backend/src/services/AccessLogService.ts
      has:
        - "(No breaking changes) export reuses existing query(filters) semantics for allowed/start_date/end_date/ip"
    - path: packages/backend/src/routes/__tests__/accessLogsExportCsv.test.ts
      has:
        - "Integration test proving export returns CSV + respects filters"
    - path: packages/frontend/src/lib/accessLogApi.ts
      has:
        - "exportCsv(siteId, filters) method using axios responseType: 'blob'"
    - path: packages/frontend/src/pages/AccessLogsPage.tsx
      has:
        - "Export CSV button that is disabled until a site is selected"
        - "Download implementation uses blob URL + anchor download"
  key_links:
    - from: "packages/backend/src/routes/accessLogs.ts (existing query schema and list route)"
      to: "packages/backend/src/routes/accessLogs.ts (new site-scoped export route reusing same filter parsing)"
      research_anchor: ".planning/phases/E/RESEARCH.md §1 (Existing access logs routes, filters, and query patterns) + quick index §5; lines: L7-L33"
      verify: "Export route accepts allowed/start_date/end_date/ip and yields the same subset of rows as the list endpoint for identical filters (ignoring pagination)."
    - from: "packages/backend/src/services/AccessLogService.ts query(filters) (dynamic WHERE clauses)"
      to: "packages/backend/src/routes/accessLogs.ts export handler (calls service.query with site_id forced from :siteId + other filters forwarded)"
      research_anchor: ".planning/phases/E/RESEARCH.md §1 (query pattern in service) + quick index §5; lines: L44-L60"
      verify: "Export filters match service semantics: site_id/allowed/start_date/end_date/ip clauses are applied (no new ad-hoc SQL in the route)."
    - from: "packages/backend/src/middleware/requireSiteAccess.ts (site access gate)"
      to: "packages/backend/src/routes/accessLogs.ts export endpoint (onRequest: [fastify.authenticate, requireSiteAccess])"
      research_anchor: ".planning/phases/E/RESEARCH.md §4 (RBAC and site access requirements) + quick index §5; lines: L167-L205"
      verify: "User without access to :siteId receives 403; super_admin can export any site (requireSiteAccess bypass)"
    - from: "packages/backend/src/routes/gdpr.ts (attachment header pattern)"
      to: "packages/backend/src/routes/accessLogs.ts (CSV Content-Disposition + Content-Type headers)"
      research_anchor: ".planning/phases/E/RESEARCH.md §2 (download as attachment pattern) + quick index §5; lines: L90-L104"
      verify: "Response includes Content-Disposition attachment filename and Content-Type text/csv; charset=utf-8."
    - from: "packages/frontend/src/pages/AccessLogsPage.tsx (filters state + list query wiring)"
      to: "packages/frontend/src/pages/AccessLogsPage.tsx (export action reuses same filters object and requires site_id selection)"
      research_anchor: ".planning/phases/E/RESEARCH.md §3 (AccessLogsPage filter state + hook points) + quick index §5; lines: L118-L151"
      verify: "Changing UI filters changes both the table query and the exported CSV filters; export disabled when site_id is missing/all."
    - from: "packages/frontend/src/lib/api.ts (Axios baseURL + Authorization injection)"
      to: "packages/frontend/src/lib/accessLogApi.ts exportCsv (authenticated blob download)"
      research_anchor: ".planning/phases/E/RESEARCH.md §3 (How export should work with current auth approach) + quick index §5; lines: L153-L165"
      verify: "Export uses api.get(..., { responseType: 'blob' }) so the Authorization header is included; no window.location navigation is used."
---

# Phase E: Audit Log CSV Export (E1–E2)

## Objective
Deliver Phase E’s gate end-to-end:

> **“Export CSV downloads filtered CSV file”**

Implement:
- **E1 (backend):** a site-scoped, RBAC-controlled CSV export endpoint for access logs, preserving existing filters.
- **E2 (frontend):** an “Export CSV” button in `AccessLogsPage` using an authenticated blob download pattern.

## Context (required anchors)
Primary reference: `.planning/phases/E/RESEARCH.md`.

Key sections used by this plan:
- Existing access logs routes + filters: `.planning/phases/E/RESEARCH.md §1` (lines: L7-L33)
- Service query filter semantics: `.planning/phases/E/RESEARCH.md §1` (lines: L44-L60)
- CSV/attachment header precedent: `.planning/phases/E/RESEARCH.md §2` (lines: L80-L104)
- Frontend filters wiring + where to hook export: `.planning/phases/E/RESEARCH.md §3` (lines: L118-L151)
- Authenticated blob download requirement (no window.location): `.planning/phases/E/RESEARCH.md §3` (lines: L153-L165)
- RBAC guidance (authenticate + requireSiteAccess): `.planning/phases/E/RESEARCH.md §4` (lines: L167-L205)

Stable pointers note: line numbers are helpful for quick navigation, but headings/sections above are the stable anchors to avoid drift as research notes evolve.

## Tasks

### Task E1.1: Backend — add site-scoped CSV export endpoint (RBAC + filters preserved)
- **files:**
  - `packages/backend/src/routes/accessLogs.ts`
  - `packages/backend/src/middleware/requireSiteAccess.ts` (reference for behavior; no change expected)
  - `packages/backend/src/services/AccessLogService.ts` (reuse; no change expected)
- **action:**
  - Add a new site-scoped export route.
    - **Route-prefix clarity:** `accessLogRoutes` is registered under the `/api` prefix in `packages/backend/src/index.ts`, so define the Fastify route path **without** the `/api` prefix (e.g., `GET /sites/:siteId/access-logs/export`). The externally visible URL will be `GET /api/sites/:siteId/access-logs/export`.
  - Enforce site scoping and access control using existing middleware patterns:
    - `onRequest: [fastify.authenticate, requireSiteAccess]` (viewer+ by default)
  - Preserve filter semantics by reusing the same filter fields as the list endpoint:
    - `allowed`, `start_date`, `end_date`, `ip`
    - Force the effective `site_id` from `:siteId` (ignore any `site_id` query param if present).
  - Build CSV output from the filtered logs:
    - Include a header row.
    - Use safe CSV escaping (quote fields containing commas/newlines/quotes; double quotes inside quoted fields).
  - Set download headers similar to GDPR export:
    - `Content-Type: text/csv; charset=utf-8`
    - `Content-Disposition: attachment; filename="access-logs-<siteId>-<timestamp>.csv"`
  - Pagination/cap default (Phase E decision): export should **not** be page-limited and should have **no explicit cap** in Phase E. (If you later add a safety cap/streaming, document it clearly in code comments and tests so behavior is explicit.)
- **research anchors:**
  - Existing list route + query schema: `.planning/phases/E/RESEARCH.md §1` (lines: L11-L33)
  - Filter fields supported: `.planning/phases/E/RESEARCH.md §1` (lines: L22-L28)
  - Service query semantics (dynamic WHERE): `.planning/phases/E/RESEARCH.md §1` (lines: L47-L54)
  - Attachment header precedent: `.planning/phases/E/RESEARCH.md §2` (lines: L90-L104)
  - RBAC recommendation for export: `.planning/phases/E/RESEARCH.md §4` (lines: L167-L205)
- **verify:**
  - Manual (fast sanity): with a valid JWT, call the endpoint for a site the user can access.
    - Expect: HTTP 200, `Content-Type` contains `text/csv`, and `Content-Disposition` contains `attachment; filename=`.
  - AuthZ: call the endpoint for a site the user cannot access.
    - Expect: HTTP 403.
- **done:**
  - Endpoint returns a downloadable CSV for a single site, enforced by `requireSiteAccess`.
  - Query parameters `allowed/start_date/end_date/ip` affect the CSV exactly as they affect the list endpoint’s filtering semantics.

### Task E1.2: Backend — add an integration test that proves “filtered CSV” (Phase E gate proof)
- **files:**
  - `packages/backend/src/routes/__tests__/accessLogsExportCsv.test.ts` (new)
  - `packages/backend/src/tests/setup.js` (reference for test DB/bootstrap; modify only if needed)
- **action:**
  - Add a Fastify integration test using `app.inject(...)` to exercise:
    1) A user with access to a site exports CSV successfully.
    2) A user without access receives 403.
    3) Filters are applied:
       - `allowed=false` reduces rows to blocked entries.
       - `ip=<substring>` filters rows.
       - `start_date/end_date` constrain timestamp range.
  - Seed a small set of `access_logs` rows in the test DB across at least two sites so cross-site leakage would be detectable.
  - Assert:
    - `content-type` contains `text/csv`
    - `content-disposition` contains `attachment; filename=`
    - CSV body contains header row + expected subset of lines.
- **research anchors:**
  - Filter semantics list: `.planning/phases/E/RESEARCH.md §1` (lines: L22-L28)
  - Service WHERE clauses: `.planning/phases/E/RESEARCH.md §1` (lines: L47-L54)
  - Gate recommendation for backend verification: `.planning/phases/E/RESEARCH.md §6 (Verification hooks)` (lines: L246-L276)
- **verify:**
  - `npm test -w packages/backend -- src/routes/__tests__/accessLogsExportCsv.test.ts`
- **done:**
  - A single backend test provides automated proof for the Phase E gate’s “filtered CSV” requirement.

### Task E2.1: Frontend — add “Export CSV” button (authenticated blob download, filters preserved)
- **files:**
  - `packages/frontend/src/pages/AccessLogsPage.tsx`
  - `packages/frontend/src/lib/accessLogApi.ts`
  - (optional helper) `packages/frontend/src/lib/download.ts` (new)
- **action:**
  - Add a new API method (keep it colocated with access log APIs):
    - `accessLogApi.exportCsv(siteId, filters)` that calls:
      - `GET /sites/:siteId/access-logs/export` via the existing Axios instance
      - **Route-prefix clarity:** the Axios instance already has `baseURL: '/api'`, so the frontend path should be `/sites/:siteId/access-logs/export` (not `/api/sites/...`) to avoid accidentally calling `/api/api/...`.
      - with `params` built from the current filters (`allowed/start_date/end_date/ip`)
      - and `responseType: 'blob'`
  - In `AccessLogsPage`, add an “Export CSV” button near the logs table header so it’s clearly tied to the current results.
  - Disable the export button unless a specific site is selected (`filters.site_id` is set and not `all`).
  - Implement blob download flow:
    - call `exportCsv(...)`
    - create an object URL
    - trigger a programmatic `<a download>` click
    - revoke object URL
    - derive filename from `Content-Disposition` if present; else fall back to `access-logs-<siteId>.csv`.
  - Ensure the export action uses the same filter state as the list query (no duplicated state).
- **research anchors:**
  - AccessLogsPage filters and query wiring: `.planning/phases/E/RESEARCH.md §3` (lines: L124-L138)
  - Export button UX recommendation (disable until site selected): `.planning/phases/E/RESEARCH.md §3` (lines: L146-L151)
  - Axios auth model + blob requirement: `.planning/phases/E/RESEARCH.md §3` (lines: L153-L165)
  - “Do not use window.location.assign” warning: `.planning/phases/E/RESEARCH.md §3` (lines: L153-L165; related example in §2)
- **verify:**
  - Manual in browser:
    1) Select a site.
    2) Apply a filter (e.g., Status = Blocked, IP contains `1.0`).
    3) Click “Export CSV”.
    4) Confirm the browser downloads a `.csv` file.
    5) Open the file and confirm rows match the filtered table semantics (at least for allowed/IP/date constraints).
- **done:**
  - Export button reliably downloads a CSV without navigation and respects current filters.

## Verification (Phase E gate)
Gate: **“Export CSV downloads filtered CSV file”**.

Checklist (must all pass):
1. **RBAC:** user without access to the target site cannot export (403).
2. **Download behavior:** browser downloads a `.csv` file via authenticated blob request (no `window.location` pattern).
3. **Filter parity:** at minimum, `allowed`, `ip`, and `start_date/end_date` impact CSV rows consistently with the list endpoint.
4. **Content headers:** response includes `Content-Type: text/csv` and `Content-Disposition: attachment`.

## GAP-CLOSURE (required to eliminate HUMAN_NEEDED)

Phase E verification is currently blocked only by **manual browser download confidence**. The backend route behavior and filter semantics are already covered by Vitest integration tests; this gap-closure adds deterministic automated evidence that the **real browser** triggers a file download and that the **frontend includes current filters** in the export request.

### Task EG.1: Frontend E2E — deterministic “Export CSV downloads a file” proof (Playwright)
- **type:** auto
- **files:**
  - `packages/frontend/e2e/access-logs-export-csv.spec.ts` (new)
  - `packages/frontend/playwright.config.ts` (reference only; adjust only if needed)
- **action:**
  - Add a focused Playwright test that:
    1) Navigates to the Access Logs page (using existing auth setup/state).
    2) Sets a specific site selection (whatever the UI uses today) and applies at least two filters (e.g., `allowed=false` and `ip` contains).
    3) Clicks **Export CSV** and asserts the browser fires a download event.
  - Make the test deterministic by **intercepting** the export request and fulfilling it with a small CSV payload and download headers:
    - `Content-Type: text/csv; charset=utf-8`
    - `Content-Disposition: attachment; filename="access-logs-test.csv"`
  - Assert the export request includes the active filters in the query string (parity proof that UI filter state flows into export params).
  - Assert the downloaded file:
    - has `.csv` filename (prefer `download.suggestedFilename()` if used)
    - contains the expected CSV body (read the downloaded file and compare contents)
- **verify:**
  - Run only this spec in CI/dev:
    - `npm run test:e2e -w packages/frontend -- e2e/access-logs-export-csv.spec.ts`
- **done:**
  - A deterministic Playwright test passes and provides automated evidence for the gate’s “downloads a CSV file in a real browser” requirement.
  - The test also proves filter propagation by asserting request query params.

### Task EG.2: Optional hardening — prove no navigation-based download (anti-regression)
- **type:** auto
- **files:**
  - `packages/frontend/e2e/access-logs-export-csv.spec.ts`
- **action:**
  - Add an assertion that the page does not navigate away during export (guard against regressions to `window.location` style downloads). Example acceptable signals:
    - URL remains on `/logs` (or equivalent) after clicking Export.
    - No `page.on('framenavigated', ...)` event to a different URL during export.
- **verify:**
  - Same as EG.1.
- **done:**
  - Test fails if export triggers a navigation away from the Access Logs page.

## Notes / guardrails
- Keep export endpoint **site-scoped** (`/api/sites/:siteId/...`) and do not allow callers to override the site by query param.
- Prefer viewer+ access by default (export is read-only). If you decide export should be admin-only, add an explicit authorization check based on `request.siteRole` (research notes this option).

Decision defaults (Phase E; keep minimal and consistent with existing list semantics):
- **CSV columns:** export the canonical `AccessLog` fields returned by `AccessLogService` (recommended minimum: `timestamp, ip_address, url, allowed, reason, ip_country, ip_city, ip_lat, ip_lng, gps_lat, gps_lng, gps_accuracy, screenshot_url`).
- **Date interpretation:** accept the same query params as the list endpoint (`start_date`, `end_date`) and apply service semantics as-is (`timestamp >= start_date`, `timestamp <= end_date`). For date-only strings coming from `<input type="date">` (e.g. `YYYY-MM-DD`), use the platform’s standard JS `Date` parsing via existing Zod coercion (no extra timezone normalization in Phase E).
- **Export cap behavior:** default is **no cap** in Phase E (export all matching rows). If a cap/streaming is introduced later, it must be explicitly documented and covered by tests.

- Large exports can be memory-heavy. If you later add a cap or streaming writer, document it and reflect it in tests so behavior is explicit (pitfall called out in research).
