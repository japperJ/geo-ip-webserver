# Phase B Re-Verification (Post GC-1)

Date: 2026-02-15

## Overall Status

**Status: PASSED**

All five Phase B criteria are now fully verified with fresh evidence from latest code and executed tests, including the new deny-path test in `packages/backend/src/routes/__tests__/content.test.ts`.

## Scope Re-Checked

- `packages/backend/src/routes/content.ts`
- `packages/backend/src/routes/__tests__/content.test.ts`
- `packages/backend/src/services/__tests__/ContentService.test.ts`
- `packages/backend/src/middleware/requireSiteAccess.ts`
- `packages/backend/src/middleware/__tests__/requireSiteAccess.test.ts`
- `packages/backend/src/index.ts`
- `docker-compose.yml`
- `docker-compose.dev.yml`

## Executed Verification Checks

1. Targeted backend tests (latest run):
  - Command: `npm test -w packages/backend -- src/routes/__tests__/content.test.ts src/middleware/__tests__/requireSiteAccess.test.ts src/services/__tests__/ContentService.test.ts`
  - Result: **3 files passed, 12 tests passed**
  - Notable: includes deny-path assertion for public content route returning 403 with `reason: 'gps_required'`.

2. Direct anonymous MinIO probe (latest run):
  - Probe: `GET http://localhost:9002/site-assets?list-type=2` without credentials
  - Result: **HTTP 403**

## Criteria Verification Matrix

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | upload/list | **PASSED** | `ContentService.test.ts` validates upload appears in list and delete removes content. `content.test.ts` validates authenticated list returns 200 and items for viewer role. |
| 2 | public endpoint serve/403 (fully proven) | **PASSED** | Serve path proven in `content.test.ts` (`allows admin upload/delete and public redirect route`) with `GET /s/:siteId/content/:filename` => **302**. Deny path now proven in `content.test.ts` (`returns 403 with gps_required for public route when GPS headers are missing`) with `GET /s/:siteId/content/:filename` => **403** and `{ reason: 'gps_required' }`. Global hook wiring in `index.ts` applies site resolution + access control before route handling. |
| 3 | RBAC viewer/admin | **PASSED** | `content.ts` enforces admin-only upload/delete (`request.siteRole !== 'admin'` => 403). `content.test.ts` verifies viewer denied upload/delete (403) and admin allowed upload/delete (201/204). |
| 4 | direct anonymous MinIO denied | **PASSED** | Compose hardening present: `mc anonymous set none myminio/site-assets` in `docker-compose.yml` and `docker-compose.dev.yml`. Live anonymous probe returns **HTTP 403**. |
| 5 | `:siteId` compatibility/backward support | **PASSED** | `requireSiteAccess.ts` supports both route params (`const siteId = params.siteId || params.id`). `requireSiteAccess.test.ts` verifies both `:siteId` and legacy `:id` routes. |

## Recommendation: Proceed to Phase C

Proceed to **Phase C**.

Rationale: Phase B acceptance criteria are fully met with both behavior and regression coverage now in place, including the previously missing public-route deny-path proof.
