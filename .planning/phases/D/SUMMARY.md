---
phase: D
plan: 0
status: complete
tasks_completed: 3/3
commits:
  - b6952f3
  - 6a86a8e
  - cb60c88
files_modified:
  - packages/backend/src/index.ts
  - packages/backend/src/middleware/ipAccessControl.ts
  - packages/backend/src/services/AccessLogService.ts
  - packages/backend/src/services/ScreenshotService.ts
  - packages/workers/src/screenshot-worker.ts
  - packages/workers/src/db.ts
  - packages/workers/src/screenshotWorker.ts
  - packages/workers/package.json
  - packages/workers/Dockerfile
  - packages/workers/.env.example
  - docker-compose.monitoring.yml
  - docker-compose.prod.yml
  - packages/backend/.env.example
  - infrastructure/docker/.env.example
  - packages/frontend/src/lib/accessLogApi.ts
  - packages/frontend/src/lib/artifactsApi.ts
  - packages/frontend/src/pages/AccessLogsPage.tsx
  - package-lock.json
deviations:
  - "Expanded env compatibility to support both AWS_S3_* and legacy S3_* aliases in worker runtime to avoid breaking existing deployments."
  - "Worker startup was validated by booting canonical entrypoint; full blocked-request E2E gate was not executed in this session because it requires a fully running stack + configured blocked rule."
decisions:
  - "Canonical worker runtime entrypoint is packages/workers/src/screenshotWorker.ts (shim), preserving existing implementation in screenshot-worker.ts."
---

# Phase D Summary

## What Was Done

Implemented all requested Phase D sub-plans in order:

1. **Sub-plan D-1a (producer wiring + payload correctness)**
   - Closed producer injection gap by wiring the injected `AccessLogService` (with `ScreenshotService`) into `ipAccessControl` middleware.
   - Added `setIpAccessControlAccessLogService(...)` in middleware and connected it from server bootstrap.
   - Standardized logged request URLs used for screenshot jobs to absolute URLs with constrained authority based on resolved site/request host.
   - Added screenshot target URL safety checks (`http/https` only) before enqueue.

2. **Sub-plan D-1b (worker/DB/env alignment)**
   - Added canonical worker entrypoint `packages/workers/src/screenshotWorker.ts` and repointed worker scripts/Docker CMD to it.
   - Completed worker DB linkage by adding `packages/workers/src/db.ts` and updating `access_logs.screenshot_url` using `(id, timestamp)` after successful upload.
   - Updated worker upload key sanitization (`timestamp` and `reason`) and graceful shutdown cleanup of DB pool.
   - Standardized Redis resolution in producer/worker (`REDIS_URL` preferred, host/port fallback).
   - Standardized worker S3 config to support `AWS_S3_*` with compatibility fallback to `S3_*`.
   - Aligned compose/env examples for Redis + AWS S3 naming and worker DB connectivity.

3. **Sub-plan D-2 (frontend screenshot viewer)**
   - Extended frontend access log typing to include backend-aligned fields and `screenshot_url`.
   - Added `packages/frontend/src/lib/artifactsApi.ts` for artifact presign retrieval and `s3://` key extraction.
   - Added screenshot section in Access Logs detail modal:
     - resolves artifact key from `s3://bucket/key`
     - fetches pre-signed URL from `GET /api/artifacts/:key`
     - renders thumbnail + full-size link

## Verification

Executed during implementation:

- `npm test -w packages/backend -- src/services/__tests__/AccessLogService.test.ts`
  - Result: **pass** (6/6 tests)
- `npm run build -w packages/backend`
  - Result: **pass**
- `npm run build -w packages/workers`
  - Result: **pass**
- `npm run start -w packages/workers`
  - Result: worker process booted via canonical entrypoint (`Screenshot worker started`)
- `npm run build -w packages/frontend`
  - Result: **pass** (with existing chunk-size warning only)

## Commits

- `b6952f3` — fix: wire screenshot enqueue path and enforce absolute safe screenshot URLs
- `6a86a8e` — feat: complete screenshot worker db linkage and runtime env alignment
- `cb60c88` — feat: add access-log screenshot viewer via artifact presigned URLs
