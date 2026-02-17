---
phase: C
plan: 2
type: implement
wave: 1
depends_on:
  - "Phase A complete (auth routes exist: /api/auth/refresh + /api/auth/me)"
files_modified:
  - packages/frontend/src/lib/auth.tsx
autonomous: true
must_haves:
  observable_truths:
    - "After a hard reload, a logged-in user still has both token and user state populated"
    - "Role-gated navigation (super_admin Users link) remains correct after reload"
  artifacts:
    - path: packages/frontend/src/lib/auth.tsx
      has:
        - "Refresh flow that results in both accessToken and user state"
        - "Uses /api/auth/me if refresh does not return user"
  key_links:
    - from: "packages/frontend/src/lib/auth.tsx (AuthProvider on-mount refresh)"
      to: "packages/backend/src/routes/auth.ts (POST /api/auth/refresh returns accessToken) + (GET /api/auth/me returns user)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L108-L123"
      verify: "Reload app while logged in: Layout shows email and user.role is available"
    - from: "packages/frontend/src/components/Layout.tsx (Users nav shown when user.role === super_admin)"
      to: "packages/frontend/src/lib/auth.tsx (user state reliably present)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L74-L87"
      verify: "Super admin keeps seeing Users nav after reload; non-admin does not"
---

# Phase C, Plan 2: Frontend auth refresh alignment (token + user after reload)

## Objective
Eliminate the Phase C reliability risk where the frontend refresh flow yields an `accessToken` but leaves `user` unset, breaking role-gated navigation and pages after reload.

## Context
- The mismatch is explicitly called out in RESEARCH.md:L108-L123.
- Frontend currently expects refresh to return both `accessToken` and `user`, but backend refresh returns only `accessToken` (per RESEARCH).

## Decision rule (backend-minimal)
Prefer a **frontend-only** fix:
- Keep using `POST /api/auth/refresh` to obtain `accessToken`.
- If refresh does not return `user`, call `GET /api/auth/me` to populate `user`.

Only change the backend refresh response if Phase A explicitly decides to do so (this plan stays backend-minimal).

## Tasks

### Task 1: Make AuthProvider populate both token + user on mount
- **files:**
  - `packages/frontend/src/lib/auth.tsx`
- **action:**
  - Ensure the on-mount refresh logic ends with both:
    1) `accessToken` stored and applied to Axios, and
    2) `user` set for UI and role checks.
  - Use `/api/auth/me` as the source of truth for the user object when needed.
- **verify:**
  - Login, then hard refresh the page:
    - user email is still shown in the layout,
    - `user.role` is available for nav gating.
- **done:**
  - Reload no longer “forgets” the user state.

## Verification
- Confirm the Phase C pages can rely on `useAuth().user.role` for nav gating immediately after reload.
