---
phase: G
plan: 0
status: complete
tasks_completed: 3/3
commits: []
files_modified:
  - packages/frontend/vite.config.ts
  - packages/frontend/e2e/auth.setup.ts
  - packages/frontend/e2e/smoke.spec.ts
  - scripts/smoke/http-smoke.mjs
  - scripts/smoke/e2e-smoke.mjs
  - package.json
  - README.md
  - DEPLOYMENT.md
  - .planning/ENTRYPOINTS.md
  - .planning/phases/G/VERIFICATION.md
  - .planning/STATE.md
deviations:
  - "Adjusted Playwright smoke auth check from storage-state assumption to explicit UI login flow after observing redirect-to-login behavior in runtime verification."
decisions:
  - "Canonical smoke mode uses docker full stack with backend=http://localhost:3001 and proxy=http://localhost:8080."
---

# Phase G Summary

## What was done

Phase G Option 1 scope (operational smoke suite + environment parity) was implemented end-to-end in plan order:

1. **G-1 (Entrypoints + parity):**
   - Documented canonical entrypoints in `.planning/ENTRYPOINTS.md` and `README.md`.
   - Added smoke guidance to `DEPLOYMENT.md`.
   - Removed Vite dev proxy rewrite drift in `packages/frontend/vite.config.ts` so `/api/*` remains `/api/*` in dev mode.
   - Aligned Playwright auth setup fallback base URL to match Playwright config default in `packages/frontend/e2e/auth.setup.ts`.

2. **G-2 (HTTP smoke harness + single command):**
   - Added deterministic harness: `scripts/smoke/http-smoke.mjs`.
   - Harness checks:
     - backend `GET /health`
     - backend `GET /documentation`
     - backend `GET /documentation/json` (parseable OpenAPI JSON)
     - proxy docs parity (`/documentation`, `/documentation/json`)
     - auth sanity: `register/login/me/refresh`
   - Added root scripts in `package.json`:
     - `smoke:http`
     - `smoke:e2e`
     - `smoke` (single default command)

3. **G-3 (minimal Playwright smoke + wiring):**
   - Added minimal browser smoke spec: `packages/frontend/e2e/smoke.spec.ts`.
   - Added cross-platform Playwright smoke runner: `scripts/smoke/e2e-smoke.mjs`.
   - Wired into root default smoke path (`npm run smoke`).

## Deviations

- Initial browser smoke assertion relied on preloaded auth state; runtime verification showed redirect to `/login` and then selector strictness ambiguity.
- The test was intentionally simplified to a deterministic UI login flow (`/login` -> sign in -> `/sites`) while keeping smoke scope tiny.

## Decisions

- Canonical operational smoke mode is **docker full stack**.
- Canonical URLs for smoke defaults:
  - backend: `http://localhost:3001`
  - proxy: `http://localhost:8080`

## Verification

Executed and passed:

- `docker-compose up -d`
- `npm run smoke:http`
- `npm run smoke:e2e`
- `npm run smoke`

Observed pass evidence includes:

- `✅ Phase G HTTP smoke PASSED`
- `✅ Playwright smoke PASSED`
- Playwright smoke summary: `3 passed`

Full gate evidence is recorded in `.planning/phases/G/VERIFICATION.md`.
