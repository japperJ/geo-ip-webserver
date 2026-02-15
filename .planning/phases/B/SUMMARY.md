---
phase: B
plan: 2
status: complete
tasks_completed: 1/1
commits: []
files_modified:
   - packages/frontend/src/lib/contentApi.ts
   - packages/frontend/src/pages/SiteContentPage.tsx
   - packages/frontend/src/App.tsx
   - packages/frontend/src/components/Layout.tsx
deviations:
   - "Frontend upload uses base64 JSON payload to match Plan 1 backend upload contract."
decisions:
   - "Content API module reuses shared axios instance from `lib/api.ts` with auth interceptor."
---

# Phase B, Plan 2 Summary

## What Was Done

Implemented frontend content management for `CONTENT-004`:

1. **Created content API client**
    - Added `packages/frontend/src/lib/contentApi.ts`.
    - Reused shared `api` instance from `packages/frontend/src/lib/api.ts`.
    - Added exported functions required by Plan 2:
       - `listSiteContent`
       - `uploadSiteContent`
       - `deleteSiteContent`
       - `getSiteContentDownloadUrl`
    - Matched backend upload contract by sending base64 JSON payload.

2. **Implemented Site Content page UI**
    - Rebuilt `packages/frontend/src/pages/SiteContentPage.tsx`.
    - Added React Query query/mutations for list/upload/delete.
    - Added download action via presigned URL request.
    - Added role-aware rendering:
       - viewers can list/download
       - admin/super-admin can upload/delete

3. **Wired routing and navigation**
    - Confirmed route in `packages/frontend/src/App.tsx`: `sites/:id/content`.
    - Updated `packages/frontend/src/components/Layout.tsx` with contextual `Site Content` navigation when browsing a specific site.

## Verification

- Frontend TypeScript diagnostics for modified files: **no errors**.
- Frontend build executed: `npm run build -w packages/frontend`.
   - Build succeeded for the content UI changes.
   - Existing unrelated warning remains in `AccessLogsPage.tsx` import of `AccessLog` from `accessLogApi.ts`.

## Phase B Outcome

- **Plan 1 (backend): complete**
- **Plan 2 (frontend): complete**
- **Phase B Content Management: complete**

# Historical Plan 1 Notes

## What Was Done

Implemented backend-only Content Management for Phase B Plan 1:

1. **Blocker fixes completed**
   - `requireSiteAccess` now supports both `:siteId` and legacy `:id` params.
   - Disabled anonymous downloads for `site-assets` in both `docker-compose.dev.yml` and `docker-compose.yml`.
   - Verified direct anonymous MinIO object fetch returns `403 AccessDenied`.

2. **CONTENT-001: Content service implemented**
   - Added `ContentService` with per-site namespace under `sites/{siteId}/content/`.
   - Added list, upload, delete, and presigned download URL methods with site-prefix safety checks.
   - Extended `S3Service` with `listFiles(prefix)` support for content listing.

3. **CONTENT-002: Site-scoped RBAC routes implemented**
   - Added `contentRoutes`:
     - `GET /api/sites/:siteId/content` (viewer+)
     - `GET /api/sites/:siteId/content/download` (viewer+)
     - `POST /api/sites/:siteId/content/upload` (admin)
     - `DELETE /api/sites/:siteId/content/:key(.*)` (admin)
   - Route-level admin enforcement uses existing `request.siteRole` pattern.

4. **CONTENT-003: Public endpoint and pipeline wiring implemented**
   - Added `GET /s/:siteId/content/:filename` public route (presign + redirect).
   - Updated global request hooks in `index.ts` so `/s/:siteId/*` resolves and attaches `request.site` before IP/GPS access-control hooks.
   - Registered `contentRoutes` in backend startup.

5. **Configuration alignment**
   - Updated backend compose environment vars and `.env.example` to `AWS_S3_*` for consistency with `S3Service`.

6. **Tests added**
   - `ContentService` unit tests.
   - Content route tests covering viewer/admin role behavior and public redirect.
   - `requireSiteAccess` tests for both route param formats.

## Deviations

- Planned multipart upload was replaced with base64 JSON payload for upload route to avoid introducing new dependency while npm workspace install was failing (`npm/arborist` lockfile error).
- This keeps backend scope complete and testable, but frontend Plan 2 should account for this API contract unless upload route is later switched to multipart.

## Verification

- Targeted tests passed:
  - `packages/backend/src/services/__tests__/ContentService.test.ts`
  - `packages/backend/src/routes/__tests__/content.test.ts`
  - `packages/backend/src/middleware/__tests__/requireSiteAccess.test.ts`
- Full backend tests passed: **128/128**.
- Backend build passed (`tsc`).
- Manual security check passed: anonymous direct object GET to `site-assets` returned **403 AccessDenied**.

## Follow-ups

- **Plan 2 (frontend)** remains pending for UI upload/list/download/delete integration.
- Optional manual runtime scenario validation can be expanded for blocked-vs-allowed behavior on `GET /s/:siteId/content/:filename` under varied IP/GPS site policies.