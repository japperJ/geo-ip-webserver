---
phase: C
plan: 1-5
status: complete
tasks_completed: 5/5
commits: [0bc1d29, 404255d, 5e55c9b]
files_modified:
  - packages/backend/src/routes/__tests__/auth-flow.test.ts
  - packages/backend/src/routes/__tests__/site-delegation-flow.test.ts
  - packages/backend/src/index.ts
  - packages/backend/src/routes/users.ts
  - packages/backend/src/services/AuthService.ts
  - packages/frontend/src/App.tsx
  - packages/frontend/src/components/Layout.tsx
  - packages/frontend/src/lib/auth.tsx
  - packages/frontend/src/lib/siteRolesApi.ts
  - packages/frontend/src/lib/usersApi.ts
  - packages/frontend/src/pages/LoginPage.tsx
  - packages/frontend/src/pages/RegisterPage.tsx
  - packages/frontend/src/pages/SiteUsersPage.tsx
  - packages/frontend/src/pages/UsersPage.tsx
deviations:
  - "Grouped Plans 3-5 into one atomic frontend commit because App/Layout routing and navigation changes overlap across those plans."
decisions:
  - "Kept refresh backend response unchanged; frontend now fetches /api/auth/me when refresh response lacks user."
  - "Standardized user lookup contract to /api/users?q= in usersApi and SiteUsersPage picker."
---

# Phase C Summary

## What was implemented

### Plan 1 — Backend minimal `/api/users` endpoints
- Added `packages/backend/src/routes/users.ts` with super-admin-only endpoints:
  - `GET /api/users` with optional `q` search
  - `PATCH /api/users/:id` to update `global_role`
  - `DELETE /api/users/:id` to soft-delete users
- Added service support in `packages/backend/src/services/AuthService.ts`:
  - `listUsers(query?)`
  - `updateUserGlobalRole(userId, globalRole)`
  - `softDeleteUser(userId)`
- Registered users route in `packages/backend/src/index.ts` under `/api/users`.

### Plan 2 — Frontend auth refresh alignment
- Updated `packages/frontend/src/lib/auth.tsx`:
  - Refresh flow restores token from `/api/auth/refresh`.
  - If refresh does not include user, calls `/api/auth/me` to populate user state.
  - Added user normalization for `role` vs `global_role` payload compatibility.

### Plan 3 — Register page
- Added `packages/frontend/src/pages/RegisterPage.tsx` (email/password + confirm password, success/error handling).
- Added public route `/register` in `packages/frontend/src/App.tsx`.
- Added login-page navigation link to register in `packages/frontend/src/pages/LoginPage.tsx`.

### Plan 4 — Users page + nav
- Added `packages/frontend/src/lib/usersApi.ts` with:
  - `list(q?)` using `/api/users?q=`
  - `updateRole(id, global_role)`
  - `delete(id)`
- Added `packages/frontend/src/pages/UsersPage.tsx` with:
  - super-admin page-level gate
  - users table + search + role update + delete actions
- Added protected route `/users` in `packages/frontend/src/App.tsx`.
- Added `Users` sidebar nav item for `super_admin` only in `packages/frontend/src/components/Layout.tsx`.

### Plan 5 — Site users delegation + denied UX
- Added `packages/frontend/src/lib/siteRolesApi.ts` for site role list/upsert/revoke.
- Added `packages/frontend/src/pages/SiteUsersPage.tsx`:
  - view site roles via `/api/sites/:id/roles`
  - super-admin-only grant/revoke controls
  - user picker powered by `/api/users?q=` via `usersApi`
  - explicit denied UX for 403/no-access states
- Added protected route `/sites/:id/users` in `packages/frontend/src/App.tsx`.
- Updated site-context nav logic in `packages/frontend/src/components/Layout.tsx`:
  - regex now supports `users`
  - added `Site Users` link when active site context exists.

## Verification evidence
- Backend build: `npm run build -w packages/backend` ✅
- Backend targeted test: `npm test -w packages/backend -- src/utils/__tests__/getClientIP.test.ts` ✅ (7 tests passed)
- Frontend build: `npm run build -w packages/frontend` ✅
  - Existing warning persists in `AccessLogsPage.tsx` regarding `AccessLog` export/import mismatch (pre-existing, non-blocking to Phase C scope).

## GAP-CLOSURE evidence (Phase-C-only)

Added two backend integration proofs (Vitest + Fastify `inject`) to convert key Phase C checks from manual to automated:

1. **Auth chain proof** — `packages/backend/src/routes/__tests__/auth-flow.test.ts`
   - Verifies: `POST /api/auth/register` → `POST /api/auth/login` (access token + refresh cookie) → `GET /api/auth/me` → `POST /api/auth/refresh` (cookie-based) → `GET /api/auth/me` with refreshed token.
   - DB hygiene in suite: cleans `user_site_roles`, `refresh_tokens`, `users`.

2. **Site delegation proof** — `packages/backend/src/routes/__tests__/site-delegation-flow.test.ts`
   - Verifies via HTTP:
     - super_admin grants delegated user a site role (`POST /api/sites/:id/roles`)
     - delegated user can read roles (`GET /api/sites/:id/roles` → 200)
     - delegated user cannot grant (`POST /api/sites/:id/roles` → 403)
     - outsider cannot read (`GET /api/sites/:id/roles` → 403)
     - super_admin revokes delegated role (`DELETE /api/sites/:id/roles/:userId`)
     - delegated access removed with freshly issued token (`GET /api/sites/:id/roles` → 403)
   - DB hygiene in suite: cleans `user_site_roles`, `refresh_tokens`, `users`, `sites`.

### GAP-CLOSURE test run output
- `npm test -w packages/backend -- src/routes/__tests__/auth-flow.test.ts src/routes/__tests__/site-delegation-flow.test.ts` ✅
  - Test files: **2 passed**
  - Tests: **2 passed**

## Commits
1. `0bc1d29` — feat: add super-admin users API endpoints for Phase C
2. `404255d` — fix: align auth refresh with token-plus-user restoration
3. `5e55c9b` — feat: add Phase C register and user delegation frontend flows
