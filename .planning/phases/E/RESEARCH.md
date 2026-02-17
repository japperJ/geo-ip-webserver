# Phase E Research: Audit Log CSV Export

**Scope:** Phase **E only** from `.planning/PORT_FEATURES_ROADMAP.md` (E1 backend CSV export for access logs, E2 frontend Export CSV button in AccessLogs page). This document maps existing code paths and patterns and proposes the least-surprising implementation approach aligned with current Fastify + TypeScript + Zod conventions.

---

## 1) Existing access logs routes, filters, and query patterns

### Backend: access log routes

**File:** `packages/backend/src/routes/accessLogs.ts`

- **List route:** `GET /api/access-logs`
  - Route definition starts at **L28**.
  - **Auth:** `onRequest: [fastify.authenticate]` (no site-scoped RBAC enforcement today).
  - **Query schema:** `accessLogsQuerySchema` starts at **L8**.

- **Get-by-id route:** `GET /api/access-logs/:id`
  - Route definition starts at **L49**.
  - **Auth:** `onRequest: [fastify.authenticate]`.

**Filters supported (current):**

- `site_id?: uuid` (optional)
- `allowed?: boolean` (optional; via `z.coerce.boolean()`)
- `start_date?: Date` (optional; via `z.coerce.date()`)
- `end_date?: Date` (optional; via `z.coerce.date()`)
- `ip?: string` (optional)
- `page` default `1`
- `limit` default `100` (max `100`)

These are defined in `accessLogsQuerySchema` (**`accessLogs.ts` L8+**).

**Response shape:**

The list endpoint returns:

- `{ logs: result.logs, pagination: { page, limit, total, totalPages } }`

See `accessLogs.ts` list handler at **L28+**.

### Backend: query pattern in service

**File:** `packages/backend/src/services/AccessLogService.ts`

- Query method begins at **L120**: `async query(filters: { ... })`.
- Dynamic WHERE clause construction begins at **L133** (`whereClause = 'WHERE 1=1'`).
- Filter clauses:
  - `site_id` → `AND site_id = $n` (**L139**)
  - `allowed` → `AND allowed = $n` (**L144**)
  - `start_date` → `AND timestamp >= $n` (**L149**)
  - `end_date` → `AND timestamp <= $n` (**L154**)
  - `ip` → `AND ip_address::text LIKE $n` (**L159**), using `%${filters.ip}%`
- Count query at **L163**.
- Paginated list query at **L169+** with `ORDER BY timestamp DESC`.

**Important security note (Phase-E-adjacent):** the service layer is **not** user-aware; it trusts caller-provided `site_id`. The current `/api/access-logs` route does **not** apply `requireSiteAccess`, so a non-super-admin user who knows a `site_id` could potentially query logs cross-site unless other controls exist elsewhere. Phase E should at least ensure the *export* endpoint is site-scoped and RBAC-enforced.

### Frontend: access log API client

**File:** `packages/frontend/src/lib/accessLogApi.ts`

- `accessLogApi.list(...)` uses the axios instance with baseURL `/api`.
- List call is at **L46**: `api.get<ListAccessLogsResponse>('/access-logs', { params })`.

The frontend filter params mirror backend `accessLogsQuerySchema`:

- `site_id?: string`
- `allowed?: boolean`
- `start_date?: string`
- `end_date?: string`
- `ip?: string`
- `page?: number`
- `limit?: number`

See `ListAccessLogsParams` and `accessLogApi` definition (starts **L44**, list call **L46**).

---

## 2) Existing CSV utilities or response patterns in backend

### CSV-specific utilities

No existing CSV serialization helpers were found under `packages/backend/src/**` (no `text/csv` usage; no CSV deps in `packages/backend/package.json`).

### Existing “download as attachment” pattern

There *is* a precedent for attachment downloads (JSON export) that can be reused for CSV headers.

**File:** `packages/backend/src/routes/gdpr.ts`

- GDPR export uses:
  - `reply.header('Content-Type', 'application/json')`
  - `reply.header('Content-Disposition', 'attachment; filename="..."')`

The `Content-Disposition` header line is at **L96**.

**Implication for CSV export:**

Implement Phase E export with the same pattern:

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="access-logs-<siteId>-<timestamp>.csv"`

### Existing “download via redirect/presign” pattern (not suitable for CSV export)

**File:** `packages/backend/src/routes/content.ts`

- Content downloads are done via *pre-signed URL* and redirect, e.g. public content route redirects to storage.
- Admin download route returns `{ url }` and the frontend uses `window.location.assign(url)`.

This works because the *pre-signed URL* doesn’t require Authorization headers.

**For CSV export, presigning is likely overkill** unless you intentionally want exports stored as artifacts. Given Phase E’s minimal scope (audit export), a direct authenticated CSV response is the simplest.

---

## 3) AccessLogsPage current filter state and where export action should hook in

**File:** `packages/frontend/src/pages/AccessLogsPage.tsx`

### Current filter state

- Filter state object is defined at **L32–L38**:
  - `site_id?: string`
  - `allowed?: boolean`
  - `ip?: string`
  - `start_date?: string`
  - `end_date?: string` *(present in state but no UI input currently)*

### Current query wiring

- Sites dropdown data comes from `siteApi.list({ page: 1, limit: 100 })` at **L47**.
- Access logs data comes from `accessLogApi.list({ page, limit, ...filters })` at **L52**.
- `handleFilterChange(...)` begins at **L65**, and resets pagination (`setPage(1)`), which is correct behavior.

### Where to hook “Export CSV”

Best hook points:

1. **Top-right of the Logs Table card header** (near “Recent Access Logs” title), so it’s visually tied to the table and uses the same filters.
2. Alternatively, inside the **Filters** card, aligned with filter controls.

**Key UI decision:** The roadmap wants per-site export (`/api/sites/:siteId/...`). The current page supports `site_id` being “All Sites”. If Phase E keeps export per site:

- Disable the export button when `filters.site_id` is missing or `'all'`.
- Provide a short helper text: “Select a site to export logs.”

### How export should work with current auth approach

**Important:** Frontend auth uses an **in-memory bearer token** attached via Axios interceptor.

**File:** `packages/frontend/src/lib/api.ts`

- Axios baseURL is `/api` (see `api = axios.create({ baseURL: '/api' ... })` at **L12**).
- Authorization header is injected in interceptor (**L20+**).

Because of this, a plain `window.location.assign('/api/...')` download request will **not** include the Authorization header. Therefore, the export should be implemented as:

- `api.get(url, { params, responseType: 'blob' })`
- Create a Blob URL and click an `<a download>` programmatically.

(There isn’t an existing “blob download” helper in the frontend codebase; Site Content downloads rely on pre-signed URLs instead.)

---

## 4) RBAC and site access requirements for export endpoint

### Existing RBAC middleware

**File:** `packages/backend/src/middleware/requireSiteAccess.ts`

- Expects a site identifier in route params `:siteId` or `:id` (extract at **L16–L18**).
- Super admins bypass checks and get `request.siteRole = 'admin'` (**L34**).
- Regular users must have `user.sites?.[siteId]` (**L39**) or get 403 (**L40+**).
- Sets `request.siteRole` to `'admin' | 'viewer'` (**L47**).

**File:** `packages/backend/src/middleware/requireRole.ts`

- Enforces *global role* only (super_admin vs user).

### Recommended enforcement for CSV export (Phase E)

Exporting audit logs is typically allowed for both **site viewers and admins** (read-only action), so:

- `onRequest: [fastify.authenticate, requireSiteAccess]`

If product requirements later decide “export is admin-only”, reuse the same pattern as content upload/delete:

- `requireSiteAccess` + `if (request.siteRole !== 'admin') return 403` (see analogous checks in `packages/backend/src/routes/content.ts`).

### Caveat: inconsistent JWT field naming elsewhere

**File:** `packages/backend/src/middleware/authenticateJWT.ts` defines `JWTPayload` as `{ userId, role, sites }`.

However, `packages/backend/src/routes/gdpr.ts` uses `(request.user as any).id` and `.globalRole`, which does not match `JWTPayload`.

For Phase E, follow the **`requireSiteAccess` + `JWTPayload`** path, since it is the established multi-tenant gate used by site-scoped routes like content.

---

## 5) Exact file paths + line anchors (quick index)

### Backend

- `packages/backend/src/routes/accessLogs.ts`
  - `accessLogsQuerySchema` **L8**
  - `GET /access-logs` **L28** (mounted under `/api` in `index.ts`)
  - `GET /access-logs/:id` **L49**

- `packages/backend/src/services/AccessLogService.ts`
  - `query(...)` **L120**
  - dynamic WHERE building **L133–L160**
  - `COUNT(*)` query **L163**
  - list query template **L169–L175**

- `packages/backend/src/index.ts`
  - registers access log routes under `/api` at **L279**

- `packages/backend/src/routes/gdpr.ts`
  - `Content-Disposition` attachment header at **L96** (JSON export pattern)

- `packages/backend/src/middleware/requireSiteAccess.ts`
  - middleware function declaration **L10**
  - super-admin path sets `request.siteRole = 'admin'` **L34**
  - site-role lookup `user.sites?.[siteId]` **L39**

### Frontend

- `packages/frontend/src/pages/AccessLogsPage.tsx`
  - filter state object **L32–L38** (includes `end_date` but no UI input)
  - sites query `siteApi.list(...)` **L47**
  - logs query `accessLogApi.list(...)` **L52**
  - `handleFilterChange` **L65**

- `packages/frontend/src/lib/accessLogApi.ts`
  - `accessLogApi` object **L44**
  - list call **L46** (`/access-logs`)

- `packages/frontend/src/lib/api.ts`
  - axios baseURL `/api` **L12**
  - Authorization injection interceptor **L20+**

---

## 6) Verification hooks for Planner/Coder

### Backend verification (recommended)

1. **New route unit/integration test** using Fastify `inject` (pattern from `screenshotPipeline.test.ts`):
   - Create site + logs in test DB.
   - Call `GET /api/sites/:siteId/access-logs/export?...` with a valid JWT.
   - Assert:
     - `statusCode === 200`
     - `content-type` includes `text/csv`
     - `content-disposition` includes `attachment; filename=`
     - body starts with CSV header row
     - filters work (`allowed=false`, date range, ip substring)

2. **Service-level test** (cheap fallback):
   - Add a CSV serialization unit test (escaping, quoting, newline behavior) if you hand-roll the CSV writer.

Helpful existing test references:

- `packages/backend/src/services/__tests__/AccessLogService.test.ts` (how to seed logs; uses `setSyncMode(true)`).
- `packages/backend/src/tests/integration/screenshotPipeline.test.ts` (how to build a Fastify instance and call `app.inject(...)`).

### Frontend verification (recommended)

1. **Component-level sanity:**
   - Export button disabled when `filters.site_id` is unset/`all`.
   - Export uses the same `filters` state object as the logs query.

2. **E2E (Playwright) hook:**
   - Add/extend an E2E test to select a site, apply a filter (e.g., blocked), click “Export CSV”, and assert a download occurred.

Note: Playwright download assertions require using Playwright’s download event APIs; implementers should follow existing e2e test organization under `packages/frontend/e2e/`.

---

## Common pitfalls to flag (Phase E)

1. **Auth + download:** do not implement export by navigating to `/api/...` unless the server also authenticates via cookies; the current frontend bearer token is injected by Axios only.
2. **Timezone/date coercion:** `z.coerce.date()` + `<input type="date">` yields date-only strings; timezone interpretation can cause off-by-one-day exports. Consider normalizing dates to explicit UTC boundaries for export (Planner decision).
3. **Large exports:** returning all rows unbounded can cause memory pressure. Prefer an explicit cap (e.g., max rows) or streaming, or require date range.

---

## Open questions for Planner

1. Should CSV export be **site-scoped only** (recommended) or allow “All Sites” export for super_admin?
2. Which columns should be included in the CSV (include `screenshot_url`?)
3. Should export be viewer-allowed or admin-only?
4. Should date filters be interpreted in UTC or local time?

---

## Sources

All findings are derived from repository code (no external sources):

- `.planning/PORT_FEATURES_ROADMAP.md` (Phase E definition)
- `packages/backend/src/routes/accessLogs.ts`
- `packages/backend/src/services/AccessLogService.ts`
- `packages/backend/src/middleware/requireSiteAccess.ts`
- `packages/backend/src/routes/gdpr.ts`
- `packages/frontend/src/pages/AccessLogsPage.tsx`
- `packages/frontend/src/lib/accessLogApi.ts`
- `packages/frontend/src/lib/api.ts`
