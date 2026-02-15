# Plan: Port Best Features from geo2/geo3 + Fix Critical Gaps

The geo1 repo (this one) has ~85-90% of features implemented, but STATE.md was never updated past Phase 0 — it's completely stale. The biggest wins come from porting **geo2's content management system** and **complete frontend pages**, fixing critical bugs (GPS middleware disconnected, GDPR data leaks, localStorage JWT), and implementing the **screenshot worker** that's entirely missing. geo3's architecture patterns (repository layer) are already handled equivalently by geo1's service layer.

---

## Phase A: Critical Bug Fixes *(do first, blocks everything)*

1. **Wire GPS middleware into request pipeline** — `gpsAccessControl.ts` exists but is never registered in `packages/backend/src/index.ts` ~L124-125. GPS geofencing is completely non-functional despite all the code being written.

2. **Fix GDPR data export/delete** — `packages/backend/src/services/GDPRService.ts` `exportUserData()` and `deleteUserData()` query ALL access logs instead of filtering by user_id. This is a privacy violation.

3. **Fix frontend type mismatches** — `packages/frontend/src/lib/api.ts` defines `access_mode` as `'open' | 'ip_only' | 'vpn_blocked'` but backend uses `'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo'`. Missing geofence fields too.

4. **Move JWT from localStorage to memory** — `packages/frontend/src/pages/LoginPage.tsx` stores JWT in localStorage (XSS risk). The ROADMAP explicitly calls this out as RISK-004. Use React context/state for access token, httpOnly cookie for refresh. *(geo2 uses Zustand in-memory store — same idea)*

5. **Remove debug console.logs** from `packages/frontend/src/lib/auth.tsx` and `packages/frontend/src/components/ProtectedRoute.tsx`

6. **Update version label** in `packages/frontend/src/components/Layout.tsx` — still says "Phase 1 MVP - v1.0.0"

---

## Phase B: Content Management *(ported from geo2 — biggest missing feature)*

1. **Create `ContentService.ts`** — S3 file upload/download/delete/list per site. Port logic from geo2's `backend/app/services/content.py`. Use existing `S3Service.ts` patterns.

2. **Create content routes** (`packages/backend/src/routes/content.ts`) — `GET /api/sites/:siteId/content` (list, viewer+), `POST .../upload` (admin), `DELETE .../content/:key` (admin). Follow geo2's role-based access pattern.

3. **Create public content serving** — `GET /s/:siteId/content/:filename` that runs through the full access control pipeline before serving. *(This is how geo2's public endpoint works)*

4. **Create `SiteContentPage.tsx`** — File list with upload/download/delete, file type icons, size formatting, usage docs. Port UI from geo2's `frontend/src/pages/SiteContent.tsx`.

---

## Phase C: Missing Frontend Pages *(ported from geo2)*

1. **Registration page** (`RegisterPage.tsx`) — email/username/password form calling existing `POST /api/auth/register`. *(geo1 has the backend endpoint but no UI)*

2. **User management page** (`UsersPage.tsx`, super_admin only) — list/create/delete users, change roles

3. **Site users/delegation page** (`SiteUsersPage.tsx`) — assign/remove users with roles for a specific site. Port pattern from geo2's `SiteUsers.tsx`

4. **Update Layout navigation** — `packages/frontend/src/components/Layout.tsx` only has "Sites" and "Access Logs". Add "Users" (admin only), and sub-nav for Content and Site Users within site context.

---

## Phase D: Screenshot Worker *(empty in geo1, working in geo2)*

1. **Create Playwright worker** (`packages/workers/src/screenshotWorker.ts`) — BullMQ Worker consuming screenshot queue → Playwright capture → upload to S3 → update access log record. Port capture logic from geo2's `screenshot.py` but keep geo1's **async BullMQ architecture** (superior to geo2's sync approach that blocks requests for 2-5s).

2. **Add screenshot viewer** to `packages/frontend/src/pages/AccessLogsPage.tsx` — show thumbnail/link in log detail modal when artifact exists

---

## Phase E: Audit Log CSV Export *(from geo2)*

1. **Add export endpoint** — `GET /api/sites/:siteId/access-logs/export` returning CSV with date/decision/IP filters. Port from geo2's `audit.py export_audit_logs_csv()`.

2. **Add "Export CSV" button** to the AccessLogsPage frontend

---

## Phase F: Documentation Sync *(last)*

1. **Update STATE.md** to reflect actual implementation status (currently shows 6% / Phase 0 only — reality is ~85-90%)

2. **Add Swagger/OpenAPI docs** — install `@fastify/swagger` + `@fastify/swagger-ui`. Routes already use Zod schemas which auto-generate OpenAPI specs.

---

## Relevant Files

### Modify
- `packages/backend/src/index.ts` — wire GPS middleware, register swagger
- `packages/backend/src/services/GDPRService.ts` — fix user filtering bugs
- `packages/frontend/src/lib/api.ts` — fix type mismatches, add content API
- `packages/frontend/src/lib/auth.tsx` — move JWT to memory, remove console.logs
- `packages/frontend/src/pages/LoginPage.tsx` — remove localStorage JWT
- `packages/frontend/src/components/Layout.tsx` — add nav items, fix version
- `packages/frontend/src/components/ProtectedRoute.tsx` — remove console.logs
- `packages/frontend/src/App.tsx` — add new routes
- `packages/backend/src/routes/accessLogs.ts` — add CSV export
- `packages/frontend/src/pages/AccessLogsPage.tsx` — add export button, screenshot viewer
- `.planning/STATE.md` — update to reflect actual status

### Create
- `packages/backend/src/services/ContentService.ts` — S3 content management
- `packages/backend/src/routes/content.ts` — content API routes
- `packages/workers/src/screenshotWorker.ts` — Playwright BullMQ worker
- `packages/frontend/src/pages/SiteContentPage.tsx` — content management UI
- `packages/frontend/src/pages/RegisterPage.tsx` — user registration
- `packages/frontend/src/pages/UsersPage.tsx` — user management (admin)
- `packages/frontend/src/pages/SiteUsersPage.tsx` — site user delegation

### Reference (from geo2)
- `geo2: backend/app/services/content.py` — full content service with S3 upload/download/delete
- `geo2: backend/app/api/content.py` — role-based content endpoints
- `geo2: backend/app/services/screenshot.py` — Playwright capture implementation
- `geo2: backend/app/api/audit.py` — CSV export endpoint
- `geo2: frontend/src/pages/SiteContent.tsx` — content management UI
- `geo2: frontend/src/pages/SiteUsers.tsx` — site users management UI
- `geo2: frontend/src/services/api.ts` — complete API client with all endpoints

### Reference (from geo3)
- `geo3: backend/app/admin/repositories/serialization.py` — geometry serialization helpers (for reference only)
- `geo3: backend/app/admin/repositories/` — repository pattern (geo1 already uses service pattern which is equivalent)

---

## Verification

- **Phase A:** `npm test -w packages/backend` passes; GPS geofencing works with GPS headers; GDPR export returns only requesting user's data; JWT absent from localStorage
- **Phase B:** Upload file → appears in MinIO; list returns it; public endpoint serves it (or 403); role restrictions work
- **Phase C:** Register → login works; super admin sees Users nav; site delegation works
- **Phase D:** Blocked request → BullMQ job → worker captures screenshot → PNG in MinIO → visible in log detail
- **Phase E:** "Export CSV" downloads filtered CSV file
- **Phase F:** STATE.md accurate; Swagger UI accessible at `/documentation`

---

## Decisions

- **Keep Node.js/Fastify** — 30k req/s vs ~10k in Python; don't port the stack
- **Port concepts, not code** — geo2/geo3 are Python; implement in TypeScript following geo1's patterns
- **Content management is highest-value addition** — only fully missing feature category
- **Screenshot worker keeps BullMQ async** — geo2's sync Playwright blocks requests 2-5s; geo1's queue is superior
- **Excluded:** Cookie banner, CSRF middleware, email verification, dashboard page — lower priority, not from geo2/geo3
