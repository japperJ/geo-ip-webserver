---
phase: C
plan: 1
type: implement
wave: 1
depends_on:
  - "Phase A complete (auth + JWT/role enforcement available)"
files_modified:
  - packages/backend/src/routes/users.ts
  - packages/backend/src/index.ts
  - packages/backend/src/services/AuthService.ts
autonomous: true
must_haves:
  observable_truths:
    - "A super_admin can list users for UsersPage and SiteUsersPage user picking"
    - "A super_admin can update a user's global role and soft-delete a user"
    - "A non-super_admin cannot access any /api/users endpoints"
  artifacts:
    - path: packages/backend/src/routes/users.ts
      has:
        - "GET /api/users (super_admin only) with optional search (?q=<string>, used for email lookup)"
        - "PATCH /api/users/:id (super_admin only) to update global role"
        - "DELETE /api/users/:id (super_admin only) to soft-delete user"
    - path: packages/backend/src/index.ts
      has:
        - "Route registration for users routes under /api/users"
  key_links:
    - from: "packages/frontend/src/pages/UsersPage.tsx (C2 needs user list)"
      to: "packages/backend/src/routes/users.ts (GET /api/users)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L143-L163"
      verify: "As super_admin, GET /api/users returns {id,email,global_role}; as non-admin returns 403"
    - from: "packages/frontend/src/pages/SiteUsersPage.tsx (C3 needs a user picker)"
      to: "packages/backend/src/routes/users.ts (GET /api/users?q=...)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L164-L175"
      verify: "Site delegation UI can resolve userId from email/search results (no manual UUID pasting)"
    - from: "packages/backend/src/index.ts (route prefix wiring)"
      to: "packages/backend/src/routes/users.ts (mounted under /api)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L108-L112"
      verify: "Server exposes /api/users endpoints with the expected prefix"
---

# Phase C, Plan 1: Backend minimal `/api/users` endpoints (unblocks C2 + C3)

## Objective
Add the smallest backend API surface needed for Phase C's frontend pages to be usable: a **super_admin-only** users list/search, plus minimal role update and soft-delete operations.

## Constraints
- Preserve backend minimality: implement only what Phase C UI needs (RESEARCH.md:L143-L175).
- Do not introduce new auth flows; reuse existing JWT auth + role middleware.

## Tasks

### Task 1: Create `/api/users` route surface (super_admin only)
- **files:**
  - `packages/backend/src/routes/users.ts`
  - `packages/backend/src/services/AuthService.ts`
- **action:**
  - Provide endpoints required by Phase C:
    - `GET /api/users` with optional search parameter `q` (i.e., `?q=`) to support user picking by email.
    - `PATCH /api/users/:id` to update the user's global role.
    - `DELETE /api/users/:id` to soft-delete (or otherwise deactivate) a user.
  - Ensure response fields are sufficient for frontend tables and pickers: `id`, `email`, `global_role`.
- **verify:**
  - As super_admin, each endpoint succeeds with expected shape.
  - As non-super_admin, each endpoint is rejected (403).
- **done:**
  - `/api/users` supports list/search + update role + soft-delete, and is protected by super_admin-only authorization.

### Task 2: Register the route in the server
- **files:**
  - `packages/backend/src/index.ts`
- **action:**
  - Mount the new users routes under `/api/users` following existing route registration patterns (RESEARCH.md:L108-L112).
- **verify:**
  - Requests reach the new handler and enforce auth/role checks.
- **done:**
  - `packages/backend/src/routes/users.ts` is reachable at runtime.

## Verification
- Confirm the API unblocks Phase C frontend work:
  - UsersPage can load a user list (C2).
  - SiteUsersPage can find a userId via search/list and grant roles without manual UUID entry (C3).
