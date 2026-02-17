# Phase D Research: Screenshot Worker (BullMQ async) + Logs UI Viewer

**Scope:** Research-only implementation guidance for Phase D items in `.planning/PORT_FEATURES_ROADMAP.md`:
- **D1** Playwright BullMQ worker (queue consume → capture → upload → update access log)
- **D2** Ensure screenshot artifact pipeline end-to-end
- **D3** Add screenshot viewer in `packages/frontend/src/pages/AccessLogsPage.tsx`

This repo already contains a *partial* worker (`packages/workers/src/screenshot-worker.ts`) and enqueue logic, but the end-to-end linkage is currently incomplete.

---

## Summary (what exists vs what’s missing)

### Already present in geo1
- **Queue producer:** `packages/backend/src/services/ScreenshotService.ts` creates a BullMQ `Queue` named **`screenshots`** and enqueues jobs (`queue.add('capture', data, ...)`).
- **Enqueue point:** `packages/backend/src/services/AccessLogService.ts` *attempts* to enqueue a screenshot job when `allowed === false` (see comment `// Phase 4: Enqueue screenshot for blocked requests`).
- **Artifact access endpoint:** `packages/backend/src/routes/gdpr.ts` implements `GET /api/artifacts/:key(.*)` which returns a **pre-signed S3 URL** and enforces site RBAC by extracting `siteId` from the key (expects `screenshots/blocked/{siteId}/...`).
- **Retention cleanup:** `packages/backend/src/jobs/logRetention.ts` deletes S3 artifacts for logs being removed, using `s3Service.extractKeyFromUrl(row.screenshot_url)`.
- **Worker skeleton:** `packages/workers/src/screenshot-worker.ts` consumes the `screenshots` queue, captures a PNG via Playwright, uploads to S3, and returns `{ screenshotUrl, key }`.

### Missing / incomplete for Phase D gate
- **Pipeline break #1 (enqueue not actually wired in request path):** `packages/backend/src/middleware/ipAccessControl.ts` creates a module-level `AccessLogService(pool)` instance **without** calling `setScreenshotService(...)` (anchor: `const accessLogService = new AccessLogService(pool);` at `packages/backend/src/middleware/ipAccessControl.ts:L18`). That means blocked requests logged by this middleware will *not* enqueue screenshot jobs today.
- **Pipeline break #2 (worker does not update access_logs):** worker uploads but does **not** update `access_logs.screenshot_url` using `logId`/`timestamp`.
- **Pipeline break #3 (worker’s `page.goto(url)` likely receives a *relative path*):** `ipAccessControl.ts` passes `url: request.url` to the access log. In Fastify this is typically a path like `/` or `/foo?bar=1`, not an absolute URL. Playwright `page.goto()` generally requires an absolute URL.
- **Frontend viewer missing:** `AccessLogsPage.tsx` shows a detail modal but has no screenshot display; frontend `AccessLog` type in `packages/frontend/src/lib/accessLogApi.ts` doesn’t include `screenshot_url`, and also doesn’t match backend field names.

---

## 1) Existing queue/job infrastructure + screenshot enqueue points (backend)

### Screenshot queue producer
**File:** `packages/backend/src/services/ScreenshotService.ts`
- Anchor: `new Queue<ScreenshotJobData>('screenshots', { connection: redisConnection })` at **L17**
- Anchor: `this.queue.add('capture', data, { ... })` at **L23**
  - `attempts: 3` at **L24**
  - `backoff: { type: 'exponential', delay: 2000 }` at **L25–28**
  - `removeOnComplete` at **L29–32**
  - `removeOnFail` at **L33–35**

**Job payload (current interface):**
```ts
export interface ScreenshotJobData {
  siteId: string;
  url: string;
  reason: string;
  logId: string;
  ipAddress: string;
  timestamp: string;
}
```

### Enqueue point (intended)
**File:** `packages/backend/src/services/AccessLogService.ts`
- Anchor: method `setScreenshotService(service: ScreenshotService)` at **L11–13**
- Anchor: comment `// Phase 4: Enqueue screenshot for blocked requests` at **L65**
- Anchor: enqueue call `await this.screenshotService.enqueueScreenshot({ ... })` at **L71**

**Important behavior:**
- `log()` is **non-blocking** by default (uses `setImmediate(performLog)`), so enqueue is async relative to request.
- It inserts into DB first, then enqueues with the returned `id` and `timestamp`.

### Where access logging is actually called from request pipeline
**File:** `packages/backend/src/middleware/ipAccessControl.ts`
- Anchor: `const accessLogService = new AccessLogService(pool);` at **L18**
- Multiple anchors: `await accessLogService.log({ ... url: request.url, allowed: false, reason: '...' })`

**Critical gap:** this `accessLogService` instance is *not* injected with `ScreenshotService`, so screenshots won’t be enqueued from real blocked requests until that wiring is fixed.

### Server bootstrap creates an injected AccessLogService… but it is not used by middleware
**File:** `packages/backend/src/index.ts`
- Anchor: `const screenshotService = createScreenshotService(server);` at **L136**
- Anchor: `accessLogService.setScreenshotService(screenshotService);` at **L140**

This is currently a “dangling” instance: the middleware uses a different AccessLogService.

---

## 2) Existing S3 upload patterns + key conventions to reuse

### Backend S3 wrapper (preferred pattern)
**File:** `packages/backend/src/services/S3Service.ts`
- Anchor: bucket selection `process.env.AWS_S3_BUCKET || 'screenshots'` at **L21**
- Anchor: env var reads `AWS_S3_ENDPOINT/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY/FORCE_PATH_STYLE` at **L24–30**
- Anchor: `uploadFile(key, body, contentType)` returns `s3://{bucket}/{key}` at **L33–45**
- Anchor: `getPresignedUrl(key, expiresIn)` via AWS SDK v3 presigner at **L47–58**
- Anchor: `extractKeyFromUrl(url)` parses `s3://bucket/key` into `key` at **L77–80**
- Anchor: `uploadFile(key, body, contentType)` returns `s3://{bucket}/{key}`
- Anchor: `getPresignedUrl(key, expiresIn)` via AWS SDK v3 presigner
- Anchor: `extractKeyFromUrl(url)` parses `s3://bucket/key` into `key`

### Artifact key convention (security + RBAC depends on it)
**Backend artifact access route:** `packages/backend/src/routes/gdpr.ts`
- Anchor: route `fastify.get('/api/artifacts/:key(.*)', ...)` at **L78**
- Anchor: siteId extraction comment `format: screenshots/blocked/{siteId}/...` at **L83** and regex around **L84**
- Anchor: RBAC check via `user_site_roles` at **L97–103**
- Anchor: pre-signed URL creation `s3Service.getPresignedUrl(key, 3600)` at **L107**
- Anchor: route `fastify.get('/api/artifacts/:key(.*)', ...)`
- Anchor: key parsing regex `key.match(/screenshots\/blocked\/([^/]+)\//)`

This enforces that screenshot keys look like:
- `screenshots/blocked/{siteId}/...`

### Worker’s current S3 upload logic (to be aligned/reused)
**File:** `packages/workers/src/screenshot-worker.ts`
- Anchor: bucket selection `const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'screenshots';` at **L33**
- Anchor: navigation `await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 })` at **L63–67**
- Anchor: upload call `PutObjectCommand(...)` at **L79–89**
- Anchor: stored URL format `const screenshotUrl = \`s3://${BUCKET_NAME}/${key}\`;` at **L92**
- Anchor: worker consumes queue `new Worker<ScreenshotJob>('screenshots', ...)` at **L105–107**
- Anchor: `const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'screenshots';`
- Anchor: `const key = \`screenshots/blocked/${siteId}/${timestamp}-${reason}.png\`;`
- Anchor: `const screenshotUrl = \`s3://${BUCKET_NAME}/${key}\`;`

**Note on bucket vs key prefix:** because bucket defaults to `screenshots` and key begins with `screenshots/blocked/...`, the effective object location becomes:
- bucket: `screenshots`
- key: `screenshots/blocked/...`

This may be intentional, but it’s worth sanity-checking with how MinIO is organized in dev.

---

## 3) Workers package bootstrap/runtime patterns (and minimal additions)

### What exists
**File:** `packages/workers/package.json`
- Anchor: `"type": "module"` (ESM)
- Scripts:
  - `dev`: `tsx watch --env-file=.env src/screenshot-worker.ts`
  - `start`: `node dist/screenshot-worker.js`

**Folder:** `packages/workers/src/`
- Contains only: `screenshot-worker.ts`

### What Phase D roadmap asks for
Roadmap wants `packages/workers/src/screenshotWorker.ts` (camelCase). Repo currently uses `screenshot-worker.ts` (kebab-case).

**Minimal, scope-safe options:**
1. **Keep existing file name** and update roadmap/task naming (documentation-only), OR
2. **Add a small shim entrypoint** `screenshotWorker.ts` that imports/executes the existing worker module, then update scripts to point to the new file, OR
3. **Rename** `screenshot-worker.ts` → `screenshotWorker.ts` and update scripts/build output accordingly.

### Minimal additions likely required for end-to-end
To update `access_logs.screenshot_url` from the worker, the worker needs DB access:
- Add `pg` dependency (or another minimal DB client) to `packages/workers`.
- Add DB connection env variables for the worker process (match backend’s DB env naming).

(Alternative is calling a backend “update screenshot” API endpoint, but no such endpoint exists currently; adding one increases scope and needs auth/service-to-service trust.)

---

## 4) Access logs schema/fields for screenshot linkage

### Database schema
**File:** `packages/backend/migrations/1771065929887_access-logs-table.sql`
- Anchor: `screenshot_url TEXT,` at **L27**
- Anchor: `COMMENT ON COLUMN access_logs.screenshot_url IS 'URL to screenshot stored in MinIO';` at **L40**
- Table is **partitioned by month** and uses composite PK: `PRIMARY KEY (id, timestamp)`.

**Implication for worker update query:** use both `id` and `timestamp` when updating to avoid any partition/key ambiguity and to enable partition pruning:
- Update target should be identified by `(logId, timestamp)` not just `logId`.

### Model mapping
**File:** `packages/backend/src/models/AccessLog.ts`
- Anchor: `screenshot_url: string | null; // Phase 4`

**File:** `packages/backend/src/services/AccessLogService.ts`
- Anchor in `mapRow`: `screenshot_url: row.screenshot_url,`

---

## 5) Frontend AccessLogsPage structure + insertion point for screenshot viewer

### Access logs page structure
**File:** `packages/frontend/src/pages/AccessLogsPage.tsx`
- Anchor: detail modal marker: `{/* Log Detail Modal - MVP-020 */}` at **L272**
- Modal shows fields like timestamp, IP, status, country, path, reason, user agent.

### Data shape mismatch (risk for Phase D3)
**File:** `packages/frontend/src/lib/accessLogApi.ts`
- Frontend `AccessLog` expects fields like `path`, `country_code`, `vpn_detected`.
  - Anchor: `export interface AccessLog {` at **L4**
  - Anchor: `path: string;` at **L10**
  - Anchor: `country_code: string | null;` at **L13**
  - Anchor: `vpn_detected: boolean;` at **L15**

**Backend returns:** `url`, `ip_country`, and includes `screenshot_url` (see `packages/backend/src/models/AccessLog.ts`).

**File:** `packages/backend/src/routes/accessLogs.ts`
- Returns `result.logs` directly (no transform), despite comment `// Transform to match frontend expectations`.

So Phase D3 will likely need (at least) one of:
- Add a transform layer (backend or frontend) so UI can reliably access `screenshot_url`.
- Update frontend types and render using backend field names.

### Where to add screenshot UI
The most targeted insertion point is inside the detail modal (after Reason/User Agent), e.g. add a “Screenshot” section that:
1. Checks `selectedLog.screenshot_url` (or derived field).
2. Extracts key from `s3://bucket/key`.
3. Calls backend `GET /api/artifacts/:key` to obtain a short-lived URL.
4. Shows a thumbnail (`<img>`) that links to the full image.

Backend already enforces RBAC for artifacts in `gdpr.ts`.

---

## 6) Security + performance constraints (async only; do not block request path)

### Async/non-blocking constraints (current state)
- `AccessLogService.log()` uses `setImmediate` by default → request path should not block on DB insert or queue enqueue.
- Screenshot capture is in a separate process (`packages/workers`) using BullMQ Worker.

### Security risks to account for
1. **SSRF / internal network browsing** (MEDIUM): screenshot worker navigates to a URL derived from a request. Ensure the URL is strictly scoped to expected public hostnames (e.g., the site’s configured hostname) rather than arbitrary user-provided absolute URLs.
2. **Sensitive tokens in URLs** (LOW/MED): if query strings contain secrets, screenshot URLs and object keys must avoid embedding raw URL data.
3. **Artifact access control** (HIGH): do not expose raw S3 URLs directly to frontend; use pre-signed URLs via `/api/artifacts/:key` (already implemented) and keep the RBAC check.

### Performance/operability considerations
- Worker already sets `concurrency: 5` and a limiter `{ max: 10, duration: 1000 }`.
- Playwright timeouts: current `page.goto(... timeout: 10000, waitUntil: 'networkidle')`. Consider if 10s is too low/high for real pages; failures should retry via BullMQ attempts.
- Browser reuse: worker keeps a singleton Chromium instance (good for performance).

---

## 7) Exact file targets + anchors (for Planner/Coder)

This is intended to be “copy/pasteable” into the implementation checklist; every integration point includes **file + line**.

### BullMQ producer (backend)
- `packages/backend/src/services/ScreenshotService.ts`
  - Queue name: `screenshots` at **L17**
  - Job name: `capture` at **L23**
  - Retry/backoff/cleanup: **L24–35**
  - Redis envs (host/port): **L60–61**

### Enqueue trigger (backend)
- `packages/backend/src/services/AccessLogService.ts`
  - Injection hook: `setScreenshotService(...)` at **L11–13**
  - Enqueue-on-block logic: **L65–79**

### Request-path logger (backend middleware)
- `packages/backend/src/middleware/ipAccessControl.ts`
  - Module-level `AccessLogService` without screenshot injection: **L18**
  - Uses `url: request.url` (relative path risk) at multiple call sites (e.g. **L44–50**, **L77–84**)

### Server bootstrap (backend)
- `packages/backend/src/index.ts`
  - Screenshot service creation: **L136**
  - Screenshot service injected into an AccessLogService instance: **L140**
  - NOTE: middleware currently does not use this injected instance.

### Artifact viewing + RBAC (backend)
- `packages/backend/src/routes/gdpr.ts`
  - Endpoint `/api/artifacts/:key(.*)`: **L78**
  - Key must match `screenshots/blocked/{siteId}/...` (siteId extracted around **L83–86**)
  - RBAC check via `user_site_roles`: **L97–103**
  - Pre-signed URL created: **L107**

### Access log storage + linkage field
- `packages/backend/migrations/1771065929887_access-logs-table.sql`
  - `screenshot_url` column: **L27**

### Worker consumer + upload
- `packages/workers/src/screenshot-worker.ts`
  - Consumes queue `screenshots`: **L105–107**
  - Browser navigation: **L63–67**
  - Upload call: **L79–89**
  - Stored URL format `s3://bucket/key`: **L92**
  - Redis host/port env usage: **L112–113**
  - Missing today: DB update to set `access_logs.screenshot_url` by `(logId, timestamp)`

### Worker runtime packaging
- `packages/workers/package.json`
  - `dev` script: **L7**
  - `start` script: **L9**
- `packages/workers/Dockerfile`
  - Installs Chromium deps: **L5**
  - Playwright env configuration: **L14–16**
  - Runs worker: **L40**

### Frontend UI insertion point
- `packages/frontend/src/pages/AccessLogsPage.tsx`
  - Detail modal marker: **L272**

### Frontend access log typing (currently mismatched)
- `packages/frontend/src/lib/accessLogApi.ts`
  - `AccessLog` interface: **L4–16**

---

## 8) Risks / blockers + recommended execution order

### Key risks/blockers
1. **Enqueue wiring not active (HIGH):** `ipAccessControl.ts` uses an AccessLogService without ScreenshotService injection → no jobs produced.
2. **Worker can’t update DB (HIGH):** no DB client/connection currently in worker → screenshot_url never set.
3. **Relative URL in job data (HIGH):** worker likely receives `url: request.url` (path only), so Playwright navigation fails.
4. **Frontend/backend type mismatch (MEDIUM/HIGH):** frontend expects `path`, `country_code`, etc., but backend returns `url`, `ip_country`, and includes `screenshot_url`.

5. **Env var mismatch for S3/MinIO config (HIGH):** backend/worker code reads `AWS_S3_*` env vars (see `packages/backend/src/services/S3Service.ts:L21–30` and worker S3 config in `packages/workers/src/screenshot-worker.ts`), but the monitoring compose file sets `S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY` (see `docker-compose.monitoring.yml:L79–82` and `L110–113`). Without standardization, uploads and presign will not work.

6. **Env var mismatch for Redis (HIGH):**
  - Worker reads `REDIS_HOST/REDIS_PORT` (`packages/workers/src/screenshot-worker.ts:L112–113`), but production compose sets only `REDIS_URL` (`docker-compose.monitoring.yml:L109`).
  - Screenshot producer reads `REDIS_HOST/REDIS_PORT` (`packages/backend/src/services/ScreenshotService.ts:L60–61`), while other backend components use `REDIS_URL` (`packages/backend/src/index.ts` registers redis plugin with `REDIS_URL`). Phase D needs a single, consistent Redis configuration approach across producer + consumer.

7. **Bucket selection / multi-bucket ambiguity (MEDIUM/HIGH):** MinIO init creates both `site-assets` and `screenshots` buckets (see `docker-compose.yml` bucket creation around the `createbuckets` service), but `S3Service` supports only one bucket per process (env `AWS_S3_BUCKET`). If content and screenshots are meant to be stored in separate buckets, Phase D needs a clear convention (either use a single bucket with prefixes, or introduce a second bucket-aware service).

8. **Playwright runtime deps (MEDIUM/HIGH):** screenshot capture requires Chromium and OS libraries.
  - Docker path is covered by `packages/workers/Dockerfile` (system Chromium install at **L5** and Playwright env at **L14–16**).
  - Local execution can fail if Playwright browser binaries/deps are missing; this shows up as browser launch errors.

### Recommended execution order (smallest end-to-end slice first)
1. **Make screenshot jobs actually enqueue on blocked requests** (fix the AccessLogService instance used in middleware so it has screenshotService).
2. **Ensure job payload contains an absolute URL** suitable for Playwright navigation (derive from request host + scheme, or from site.hostname + path).
3. **Worker: after upload, update `access_logs.screenshot_url` using `(logId, timestamp)`**.
4. **Frontend: extend AccessLog types and add viewer in the existing detail modal**.
5. **Verify artifact viewing uses `/api/artifacts/:key` (pre-signed) rather than exposing S3 directly**.

### Concrete verification ideas (matches Phase D gate)
Goal: **Blocked request → BullMQ job → worker captures screenshot → PNG stored → visible in log detail UI**.

Suggested deterministic checks:
- Configure a site with an IP denylist that blocks your current IP (or a country allowlist that excludes you).
- Make a request that triggers a 403 via IP access control.
- Confirm an `access_logs` row is created with `allowed=false` and `reason` set.
- Confirm a BullMQ job appears in the `screenshots` queue with `name='capture'`.
- Confirm worker logs `Job completed` and upload success.
- Confirm DB row is updated: `access_logs.screenshot_url` is non-null and starts with `s3://`.
- In the frontend Access Logs page, open the log detail modal and verify:
  - Screenshot section appears
  - A thumbnail loads via pre-signed URL
  - Clicking opens full PNG

### Verification hooks (Planner → turn into tests)

1. **Producer hook (backend):** When `AccessLogService` has a configured `ScreenshotService`, `log({ allowed: false, url: '/...' })` should invoke `enqueueScreenshot(...)` exactly once.
  - Target logic: `packages/backend/src/services/AccessLogService.ts:L65–79`.

2. **Queue hook (Redis/BullMQ):** A blocked request should create a BullMQ job in queue `screenshots` with job name `capture`.
  - Producer: `packages/backend/src/services/ScreenshotService.ts:L17, L23`.

3. **Worker hook (Playwright + S3):** Processing a job should upload a PNG object whose key matches `screenshots/blocked/{siteId}/...` and return/store a `s3://...` URL.
  - Worker: `packages/workers/src/screenshot-worker.ts:L79–92`.

4. **DB linkage hook:** After successful upload, the worker (or a backend endpoint it calls) must update `access_logs.screenshot_url` for the specific log row.
  - Schema field: `packages/backend/migrations/1771065929887_access-logs-table.sql:L27`.

5. **Artifact RBAC hook:** `/api/artifacts/:key` must deny access when the authenticated user lacks membership in the key’s `{siteId}`.
  - Route and RBAC: `packages/backend/src/routes/gdpr.ts:L78, L97–103`.

6. **Frontend display hook:** If a selected log has a `screenshot_url`, the UI should request a presigned URL and render it as an image thumbnail in the log detail modal.
  - Modal insertion point: `packages/frontend/src/pages/AccessLogsPage.tsx:L272`.

---

## Sources (repo-local)
- `.planning/PORT_FEATURES_ROADMAP.md` (Phase D definition)
- `packages/backend/src/services/ScreenshotService.ts`
- `packages/backend/src/services/AccessLogService.ts`
- `packages/backend/src/middleware/ipAccessControl.ts`
- `packages/backend/src/routes/gdpr.ts` (artifact pre-signed URL + RBAC)
- `packages/backend/src/jobs/logRetention.ts` (S3 cleanup)
- `packages/backend/migrations/1771065929887_access-logs-table.sql` (schema)
- `packages/workers/src/screenshot-worker.ts` (existing worker)
- `packages/workers/package.json` (runtime scripts)
- `packages/frontend/src/pages/AccessLogsPage.tsx` (UI insertion point)
- `packages/frontend/src/lib/accessLogApi.ts` (types)
- `packages/backend/src/routes/accessLogs.ts` (API responses)
