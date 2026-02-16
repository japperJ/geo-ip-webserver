---
phase: C
plan: 0
type: index
wave: 0
depends_on:
  - "Phase A complete (auth working end-to-end)"
files_modified:
  - .planning/phases/C/PLAN.md
  - .planning/phases/C/PLAN-1-backend-users-api.md
  - .planning/phases/C/PLAN-2-frontend-auth-refresh-alignment.md
  - .planning/phases/C/PLAN-3-frontend-register.md
  - .planning/phases/C/PLAN-4-frontend-users-page-nav.md
  - .planning/phases/C/PLAN-5-frontend-site-users-delegation.md
autonomous: true
must_haves:
  observable_truths:
    - "Phase C (C1–C4) is executable as single-session sub-plans with a clear dependency order"
    - "Every sub-plan must_haves.key_links includes explicit code file paths AND RESEARCH line anchors"
  artifacts:
    - path: .planning/phases/C/PLAN-1-backend-users-api.md
      has: ["Minimal /api/users endpoints to unblock C2/C3"]
    - path: .planning/phases/C/PLAN-2-frontend-auth-refresh-alignment.md
      has: ["Refresh flow results in both token + user state after reload (frontend-first fix)"]
    - path: .planning/phases/C/PLAN-3-frontend-register.md
      has: ["Register page + public routing (/register)"]
    - path: .planning/phases/C/PLAN-4-frontend-users-page-nav.md
      has: ["Users page + route + super_admin nav gating"]
    - path: .planning/phases/C/PLAN-5-frontend-site-users-delegation.md
      has: ["SiteUsers page + route + site nav + delegation UX"]
  key_links:
    - from: ".planning/phases/C/PLAN.md (this index)"
      to: ".planning/phases/C/RESEARCH.md (anchors used throughout)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L1-L330"
      verify: "Each PLAN-* file references RESEARCH.md:L* for the key decision/anchor it relies on"
---

# Phase C: Missing Frontend Pages (C1–C4) — Split Sub-Plans

## Objective
Deliver Phase C (C1–C4) as **single-session executable sub-plans**, split by backend enablers and frontend waves, while preserving **backend minimality** (only endpoint gaps required for C2/C3 usability).

This file is an **execution index**. Implementers should execute the PLAN-* files below in dependency order.

## Context
Primary reference: `.planning/phases/C/RESEARCH.md` (all sub-plans must cite it using **RESEARCH.md:Lx-Ly** anchors).

## Dependency order (single-session sub-plans)

Execute in this order:
1) **PLAN-1** — Backend: minimal `/api/users` endpoints (unblocks C2/C3 UX)
2) **PLAN-2** — Frontend: auth refresh alignment (ensures role-gated nav survives reload)
3) **PLAN-3** — Frontend (public): Register page + `/register` route
4) **PLAN-4** — Frontend (super_admin): Users page + `/users` route + Users nav gating
5) **PLAN-5** — Frontend (delegation): SiteUsers page + `/sites/:id/users` route + site nav

Waves (parallelization guidance):
- **Wave 1:** PLAN-1 and PLAN-2 can be done independently.
- **Wave 2:** PLAN-3.
- **Wave 3:** PLAN-4 (needs PLAN-1 + PLAN-2).
- **Wave 4:** PLAN-5 (needs PLAN-1; PLAN-2 recommended).

> If you encounter an authentication/authorization error during execution (JWT/refresh cookie, etc.), stop immediately and request the user to authenticate or provide required environment configuration.

## Coverage map (keep C1–C4 intact)

| Roadmap item | Covered by | Notes |
|---|---|---|
| **C1** Register page | PLAN-3 | Calls `POST /api/auth/register` (RESEARCH.md:L172-L189) |
| **C2** Users page (super_admin) | PLAN-1 + PLAN-4 | PLAN-1 supplies minimal backend endpoints (RESEARCH.md:L143-L163) |
| **C3** SiteUsers delegation page | PLAN-1 + PLAN-5 | Delegation endpoints exist; PLAN-1 provides user lookup needed for usable grant UX (RESEARCH.md:L164-L175, L216-L249) |
| **C4** Routing + nav updates | PLAN-3/4/5 | App.tsx + Layout.tsx changes split by feature (RESEARCH.md:L185-L270) |

## Key-links rigor rule (validation blocker)
For every sub-plan, `must_haves.key_links` MUST include:
- explicit **code file paths** (e.g., `packages/frontend/src/App.tsx` → `packages/frontend/src/pages/RegisterPage.tsx`), and
- a `research_anchor: ".planning/phases/C/RESEARCH.md:Lx-Ly"` field.

This is required to avoid “created but not wired” failures.

## GAP-CLOSURE: reduce/eliminate HUMAN_NEEDED (automated proofs)

Goal: convert Phase C verification from **HUMAN_NEEDED** → **PASS** by adding minimal automated checks for:
- **Register → login flow proof** (including refresh/persisted auth semantics)
- **Site delegation flow proof** (grant/revoke/read/deny)

Scope constraints:
- Phase C only (no broad refactors)
- Prefer **backend integration tests** (Vitest + `fastify.inject` + test DB)
- Add **optional** Playwright smoke only if it stays lightweight

### Task GC1: Backend integration test — Register → login → refresh → /me
- **files:**
  - `packages/backend/src/routes/__tests__/auth-flow.test.ts` (new)
- **action:** Add a single integration test that exercises the real HTTP endpoints:
  - `POST /api/auth/register` (new user)
  - `POST /api/auth/login` (returns `accessToken` + sets `refreshToken` cookie)
  - `GET /api/auth/me` (Bearer token proves access token works)
  - `POST /api/auth/refresh` (Cookie proves persisted/refresh flow; returns new access token)
  - `GET /api/auth/me` again with refreshed token
  Test should run against the existing Vitest test database bootstrap, and clean up DB tables it touches (`users`, `refresh_tokens`, `user_site_roles`) within the suite.
- **verify:** `npm test -w packages/backend -- src/routes/__tests__/auth-flow.test.ts`
- **done:** Test passes and provides automated evidence for Gate-1 (“Register → login works”) without a browser.

### Task GC2: Backend integration test — Site delegation grant/revoke/read/deny
- **files:**
  - `packages/backend/src/routes/__tests__/site-delegation-flow.test.ts` (new)
- **action:** Add a single integration test covering the required delegation observable truths via HTTP:
  - Create (or insert) a `site` record in test DB
  - Create 3 users: `super_admin` (first registered), `delegated`, and `outsider`
  - As `super_admin`: `POST /api/sites/:id/roles` grants `viewer` (and optionally `admin`) to `delegated`
  - As `delegated`: `GET /api/sites/:id/roles` returns 200 (read allowed)
  - As `delegated`: `POST /api/sites/:id/roles` returns 403 (grant denied)
  - As `outsider`: `GET /api/sites/:id/roles` returns 403 (read denied)
  - As `super_admin`: `DELETE /api/sites/:id/roles/:userId` revokes role
  - After revoke, prove access is removed using a freshly-issued token (login again or `/api/auth/refresh`), then `GET /api/sites/:id/roles` returns 403 for the delegated user
  Test should clean up DB tables it touches (`sites`, `users`, `refresh_tokens`, `user_site_roles`).
- **verify:** `npm test -w packages/backend -- src/routes/__tests__/site-delegation-flow.test.ts`
- **done:** Test passes and provides automated evidence for Gate-3 (“Site delegation works end-to-end”) at the API/authz level.

### Task GC3 (optional): Playwright smoke — UI register→login persistence
- **type:** checkpoint:human-verify
- **files:**
  - `packages/frontend/e2e/register-login.spec.ts` (new)
- **action:** Add a minimal UI-only Playwright test:
  - Navigate to `/register`, submit unique email/password
  - Navigate to `/login`, submit same credentials
  - Assert landing on a protected route or presence of authenticated UI
  - Reload page and assert auth state persists (e.g., `localStorage` has `authToken` + `user`, or authenticated UI remains)
  Keep this test resilient by avoiding brittle selectors and by reusing existing auth conventions in `e2e/auth.setup.ts` where helpful.
- **verify:** `npm run test:e2e -w packages/frontend -- e2e/register-login.spec.ts`
- **done:** Optional browser-level proof exists; when run against a live stack, it replaces the remaining manual “click-through” confidence step.

