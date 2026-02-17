---
phase: G
type: research
last_updated: 2026-02-17
---

# Phase G Research Notes (Operational Smoke + Environment Parity)

This file captures **concrete repo facts** Phase G execution should rely on (so the implementing agent does not need to rediscover ports/routes).

## Canonical entrypoints evidence (current repo state)

### Docker full stack
- `docker-compose.yml` publishes:
  - backend container listens on `PORT=3000` and is mapped to host **`localhost:3001`** (`ports: "3001:3000"`).
  - frontend (nginx) is mapped to host **`localhost:8080`**.

### Proxy routing
- `packages/frontend/nginx.conf` proxies the following paths to `backend:3000`:
  - `/api/` (API)
  - `/health`
  - `/ready`
  - `/documentation` and `/documentation/` (Swagger UI + assets)

**Implication:** In docker mode, these should be reachable on `http://localhost:8080/*`.

### Direct backend routes
- `packages/backend/src/index.ts` defines:
  - `GET /health`
  - `GET /ready`
  - Swagger UI at `GET /documentation`
  - OpenAPI JSON at `GET /documentation/json`

**Implication:** In docker mode, these should be reachable on `http://localhost:3001/*`.

## Auth routes (for smoke harness)
- Backend registers auth routes with prefix `/api/auth` in `packages/backend/src/index.ts`.
- Actual auth endpoints are implemented in `packages/backend/src/routes/auth.ts`:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `GET /api/auth/me` (protected; `onRequest: [fastify.authenticate]`)

**Recommended deterministic local creds (already used by Playwright auth setup):**
- email: `admin@test.local`
- password: `Test123!@#`

## Existing Playwright auth wiring
- `packages/frontend/playwright.config.ts`:
  - supports env-managed base URL via `PLAYWRIGHT_BASE_URL`
  - uses `globalSetup` to HEAD-check reachability when env-managed
  - uses a `setup` project (`*.setup.ts`) and then `chromium` project can depend on it
- `packages/frontend/e2e/auth.setup.ts`:
  - registers the first user (or logs in if already exists)
  - writes storage state to `playwright/.auth/user.json`

**Parity note:** `auth.setup.ts` currently defaults `baseURL` to `http://localhost:8080` when env var is not set. Ensure Phase G keeps this consistent with `playwright.config.ts` defaults and with the chosen canonical smoke baseURL.

## Identified environment parity drift (fix target for Phase G)

### Vite dev proxy rewrite likely conflicts with backend route prefixes
- Frontend Axios baseURL is `'/api'` (`packages/frontend/src/lib/api.ts`).
- Backend expects routes under `/api/*` (e.g., `/api/auth/login`).
- `packages/frontend/vite.config.ts` currently proxies `/api` to `http://localhost:3000` but **rewrites** the path by stripping `/api`:
  - `rewrite: (path) => path.replace(/^\/api/, '')`

**Implication:** In dev hot-reload mode, `fetch('/api/auth/login')` becomes a backend call to `/auth/login` and will 404.

Phase G should resolve this so:
- dev hot-reload calls to `/api/*` actually reach backend `/api/*`, OR
- frontend uses a different baseURL in dev and the docs reflect it.

## Smoke suite success criteria anchors
Source of truth: `.planning/NEXT_STEPS.md` Option 1 / Phase G.

Minimum gates to encode:
1. One smoke command exists.
2. It checks `/health`, `/documentation`, `/documentation/json` on canonical entrypoint(s).
3. It proves one authenticated flow can reach a protected API (`/api/auth/me`).
4. Proxy parity: docs endpoints reachable on proxy entrypoint (`:8080` in docker mode).
