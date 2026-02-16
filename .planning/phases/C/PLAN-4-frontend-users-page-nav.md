---
phase: C
plan: 4
type: implement
wave: 3
depends_on:
  - "PLAN-1 (backend /api/users endpoints available)"
  - "PLAN-2 (auth refresh reliably populates user.role after reload)"
files_modified:
  - packages/frontend/src/pages/UsersPage.tsx
  - packages/frontend/src/lib/usersApi.ts
  - packages/frontend/src/App.tsx
  - packages/frontend/src/components/Layout.tsx
autonomous: true
must_haves:
  observable_truths:
    - "Super admins can reach /users from the sidebar and manage users"
    - "Non-super admins do not see Users nav and cannot access /users"
  artifacts:
    - path: packages/frontend/src/pages/UsersPage.tsx
      has:
        - "super_admin-only gate at page level"
        - "User list table backed by GET /api/users"
        - "Mutations for role update + delete that refresh list"
    - path: packages/frontend/src/lib/usersApi.ts
      has:
        - "GET list/search wrapper (supports `q` query param)"
        - "PATCH role wrapper"
        - "DELETE user wrapper"
    - path: packages/frontend/src/components/Layout.tsx
      has:
        - "Users nav item shown only when user.role === super_admin"
    - path: packages/frontend/src/App.tsx
      has:
        - "Protected route: /users"
  key_links:
    - from: "packages/frontend/src/components/Layout.tsx (Users nav gating)"
      to: "packages/frontend/src/pages/UsersPage.tsx (route target)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L200-L215"
      verify: "Super admin sees Users link and it navigates to /users"
    - from: "packages/frontend/src/App.tsx (protected route users)"
      to: "packages/frontend/src/pages/UsersPage.tsx"
      research_anchor: ".planning/phases/C/RESEARCH.md:L200-L212"
      verify: "/users route renders within authenticated Layout"
    - from: "packages/frontend/src/pages/UsersPage.tsx (super_admin-only guard)"
      to: "packages/frontend/src/components/ProtectedRoute.tsx (auth-only; role must be enforced by page)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L34-L37"
      verify: "Direct navigation to /users as non-admin shows denied UI (and backend calls fail)"
    - from: "packages/frontend/src/lib/usersApi.ts"
      to: "packages/backend/src/routes/users.ts (/api/users endpoints)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L143-L175"
      verify: "Users page loads list; role update + delete succeed for super_admin"
---

# Phase C, Plan 4: Users page + `/users` route + super_admin nav (C2 + C4)

## Objective
Implement C2 by adding a super-admin-only Users page and wiring it into routing and navigation.

## Tasks

### Task 1: Create `UsersPage.tsx` with super_admin-only behavior (backed by `usersApi.ts`)
- **files:**
  - `packages/frontend/src/pages/UsersPage.tsx`
  - `packages/frontend/src/lib/usersApi.ts`
- **action:**
  - Enforce super_admin access at the page level.
  - Display a user list (from `/api/users`) and allow super_admin actions:
    - update global role
    - delete (soft-delete)
  - Create/extend `packages/frontend/src/lib/usersApi.ts` as the single wrapper for:
    - list/search users (using `q` as the query parameter)
    - update role
    - delete user
- **verify:**
  - Super admin can view list and perform actions.
  - Non-admin sees a denied state and cannot mutate.
- **done:**
  - Users page is functional and properly gated.

### Task 2: Wire routing + navigation
- **files:**
  - `packages/frontend/src/App.tsx`
  - `packages/frontend/src/components/Layout.tsx`
- **action:**
  - Add protected route `users` under the authenticated layout route.
  - Add sidebar nav item `Users` shown only to super_admin.
- **verify:**
  - Super admin sees nav and can navigate.
  - Non-admin does not see nav.
- **done:**
  - Routing/nav are correct and gated.

## Verification
- Validate the gate end-to-end:
  - Login as super_admin → can reach /users and manage.
  - Login as non-admin → no nav; direct route attempt is denied.
