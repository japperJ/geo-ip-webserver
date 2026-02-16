---
phase: C
plan: 3
type: implement
wave: 2
depends_on:
  - "Phase A complete (auth endpoints exist)"
files_modified:
  - packages/frontend/src/pages/RegisterPage.tsx
  - packages/frontend/src/App.tsx
  - packages/frontend/src/pages/LoginPage.tsx
autonomous: true
must_haves:
  observable_truths:
    - "A user can register via /register and then login successfully"
    - "Register routing does not affect existing /login behavior"
  artifacts:
    - path: packages/frontend/src/pages/RegisterPage.tsx
      has:
        - "Email/password form"
        - "Calls POST /api/auth/register"
        - "Clear success + error handling"
    - path: packages/frontend/src/App.tsx
      has:
        - "Public route: /register"
  key_links:
    - from: "packages/frontend/src/pages/RegisterPage.tsx"
      to: "packages/backend/src/routes/auth.ts (POST /api/auth/register)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L172-L189"
      verify: "Register succeeds for a new email and shows a success path to login"
    - from: "packages/frontend/src/App.tsx (/register route)"
      to: "packages/frontend/src/pages/RegisterPage.tsx"
      research_anchor: ".planning/phases/C/RESEARCH.md:L185-L189"
      verify: "Navigating to /register renders the Register page"
    - from: "packages/frontend/src/pages/LoginPage.tsx (optional link)"
      to: "packages/frontend/src/App.tsx (/register route)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L284-L288"
      verify: "Login page provides a navigable link to /register (if implemented)"
---

# Phase C, Plan 3: Register page + `/register` routing (C1)

## Objective
Implement C1 by adding a frontend Register page and wiring it into the public router.

## Tasks

### Task 1: Create `RegisterPage.tsx`
- **files:**
  - `packages/frontend/src/pages/RegisterPage.tsx`
- **action:**
  - Build a registration form consistent with the existing Login page styling.
  - Submit `{ email, password }` to `POST /api/auth/register`.
  - On success: either redirect to `/login` with a message or immediately chain login (either is acceptable per RESEARCH).
- **verify:**
  - A brand-new account can be created and then login works.
  - Duplicate email and invalid input show clear errors.
- **done:**
  - Register page exists and works end-to-end.

### Task 2: Wire `/register` into `App.tsx` and (optionally) link from Login
- **files:**
  - `packages/frontend/src/App.tsx`
  - `packages/frontend/src/pages/LoginPage.tsx`
- **action:**
  - Add a public `/register` route near the existing `/login` route (RESEARCH.md:L185-L189).
  - Optionally add a “Create an account” link on the Login page.
- **verify:**
  - `/login` continues to work.
  - `/register` is reachable and renders.
- **done:**
  - Routing is correct and discoverable.

## Verification
- Smoke test the full flow: `/register` → `/login` → authenticated landing.
