---
phase: G
plan: 0
type: index
wave: 1
depends_on:
  - "Phase F PASSED (docs reachable on direct backend + proxy); see .planning/phases/F/VERIFICATION.md"
files_modified:
  - .planning/phases/G/PLAN.md
  - .planning/phases/G/RESEARCH.md
  - .planning/phases/G/VERIFICATION.md
autonomous: true
must_haves:
  observable_truths:
    - "A single, minimal smoke verification command exists and can be run after startup."
    - "Smoke checks prove health + Swagger docs reachability on canonical entrypoint(s)."
    - "Smoke checks prove at least one authenticated admin flow can reach a protected API (login -> me; refresh optional but preferred)."
    - "Canonical dev/proxy entrypoints are explicitly defined (ports + base URLs) and are consistent across docs and tooling."
    - "Phase G stays within scope: no new product features; only operational repeatability + environment parity."
  artifacts:
    - path: scripts/
      has:
        - "A smoke harness entrypoint (Node script(s) or equivalent) that returns exit code 0/1 deterministically"
        - "Clear failure messages indicating which gate failed"
    - path: package.json
      has:
        - "A single top-level script (e.g., npm run smoke) that runs the Phase G smoke suite"
    - path: packages/frontend/e2e/
      has:
        - "A minimal Playwright smoke spec (sanity-level; intentionally tiny to avoid flakiness)"
    - path: README.md
      has:
        - "Canonical entrypoints documented for: dev (hot reload) and docker (proxy + direct backend)"
    - path: .planning/phases/G/VERIFICATION.md
      has:
        - "A PASS/FAIL checklist with recorded evidence (URLs tested + outputs)"
  key_links:
    - from: ".planning/NEXT_STEPS.md (Option 1 / Phase G: success criteria)"
      to: ".planning/phases/G/PLAN.md (Sub-plans G-1..G-3 + Verification gates)"
      verify: "Phase G plan tasks map 1:1 to the Option 1 observable truths (smoke command, endpoint checks, auth proof, proxy parity)."
    - from: ".planning/STATE.md (Immediate Exit Criterion for Phase G)"
      to: ".planning/phases/G/VERIFICATION.md (Gates A–D) + README.md (smoke command + entrypoints)"
      verify: "STATE exit criterion is satisfied when Gates A–D are PASS and README documents the single smoke command + canonical entrypoints."
    - from: "docker-compose.yml + packages/frontend/nginx.conf (docker entrypoints + proxy routing)"
      to: "Canonical entrypoints doc + smoke harness defaults"
      verify: "Default smoke base URLs match compose port mappings and nginx routing (backend :3001, proxy :8080)."
    - from: "packages/backend/src/routes/auth.ts (login/refresh/me)"
      to: "Smoke harness auth sanity step"
      verify: "Smoke harness calls the real auth endpoints (no guessed paths) and reaches /api/auth/me with a valid token."
---

# Phase G: Operational Smoke Suite + Environment Parity (Option 1)

## Objective
Codify a **release-quality smoke suite** so “it works” becomes **repeatable**.

Phase G is explicitly **post-feature** work:
- It does **not** add new product features.
- It **does** create a minimal acceptance harness and remove the most common environment/entrypoint drift.

## Scope boundaries

### In scope
- A small automated smoke suite that checks:
  - backend health
  - Swagger UI + spec reachability
  - one authenticated call reaching a protected endpoint
- A minimal Playwright sanity pass (intentionally tiny).
- Document and enforce canonical entrypoints for:
  - **dev hot-reload** workflow
  - **docker full-stack** workflow (proxy + direct backend)
- Resolve obvious environment parity drift that would make smoke checks unreliable (e.g., dev proxy rules disagreeing with backend route prefixes).

### Out of scope
- No new RBAC roles, no access-policy model changes.
- No refactors unrelated to verification repeatability.
- No expansion of E2E coverage beyond true smoke level.

## Canonical entrypoints (must be explicit)
Phase G defines a small matrix of supported entrypoints and uses it consistently.

**Minimum required matrix:**
- **Docker (full stack):**
  - Direct backend: `http://localhost:3001`
  - Proxy (frontend + API + docs via nginx): `http://localhost:8080`
- **Dev (hot reload):**
  - Frontend: `http://localhost:5173`
  - Backend: `http://localhost:3000`

> The smoke harness must either (a) support both modes with explicit base URL inputs, or (b) declare one mode canonical for smoke (recommended: docker full stack) and keep the other mode as “best effort”.

## Tasks (split into single-session sub-plans)

## Dependency graph & execution order

Phase G is intentionally split into single-session sub-plans. The intended execution order is:

- **Wave 1:** G-1 (entrypoints + parity)
- **Wave 2:** G-2 (HTTP smoke harness + repo-level smoke command)
- **Wave 3:** G-3 (minimal Playwright smoke + wire into the same smoke command)

dependency_graph:
  G-1:
    needs: ["Phase F PASS"]
    creates: ["Canonical entrypoints doc", "No known dev/proxy API prefix drift"]
  G-2:
    needs: ["Canonical entrypoints doc"]
    creates: ["Deterministic HTTP smoke harness", "Single repo-level smoke command"]
  G-3:
    needs: ["Single repo-level smoke command", "Deterministic HTTP smoke harness"]
    creates: ["Minimal Playwright smoke spec", "smoke command runs HTTP + browser smoke"]

> Notes:
> - G-1 tasks may be completed in any internal order, but parity drift fixes must land before treating smoke failures as meaningful.
> - G-2 should be runnable without Playwright, so it can be used as the fastest operational gate.

## Traceability (success criteria → tasks → verification gates)

This table is the Verifier’s map from `.planning/NEXT_STEPS.md` and `.planning/STATE.md` to concrete Phase G work.

| Source criterion | Covered by tasks | Proved by verification gates |
|---|---|---|
| NEXT_STEPS #1: One smoke command exists | G2.3 (repo-level command), G3.2 (wire Playwright into same command) | Gate A |
| NEXT_STEPS #2: Health + docs + auth sanity on canonical entrypoint(s) | G2.1 (health+docs), G2.2 (auth proof), G1.1 (entrypoints) | Gate B + Gate C |
| NEXT_STEPS #2: Proxy parity for docs endpoints | G2.1 (proxy URL support), G1.1 (entrypoints) | Gate D |
| NEXT_STEPS #3: Smoke checks documented + default verification | G1.1 (docs), G2.3 (documented smoke command) | Gate A + Gate E |
| STATE “Immediate Exit Criterion” for Phase G | G2.3 + G2.2 + G1.1 | Gates A–D PASS (recorded in `VERIFICATION.md`) |

> Instruction for execution agents:
> If you encounter an authentication/authorization error during execution (JWT, cookies, Playwright auth state, etc.), stop immediately and request the user to authenticate or provide the required environment configuration.

### Sub-plan G-1 (single session): Environment parity + canonical entrypoints documentation

#### Task G1.1: Define canonical entrypoints and document them in one authoritative place
- **type:** auto
- **files:**
  - `README.md`
  - `PRODUCTION.md` and/or `DEPLOYMENT.md` (whichever is the operational source of truth)
  - (new, recommended) `.planning/ENTRYPOINTS.md`
- **action (WHAT):**
  - Document the supported entrypoint matrix (dev hot-reload vs docker full stack).
  - Explicitly name which entrypoint is considered canonical for operational smoke verification.
  - Ensure the docs answer, without ambiguity:
    1) which URLs to hit for `/health`, `/ready`, `/documentation`, `/documentation/json`
    2) which port is “direct backend” vs “proxy entrypoint”
- **verify:**
  - Human: follow the docs on a clean run and confirm you can identify the correct URLs in < 60 seconds.
- **done:**
  - Canonical entrypoints are stated once, consistently, and referenced by the smoke suite.

#### Task G1.2: Eliminate parity drift that breaks smoke verification between dev and docker
- **type:** auto
- **files (likely):**
  - `packages/frontend/vite.config.ts`
  - `packages/frontend/src/lib/api.ts`
  - `packages/frontend/playwright.config.ts`
  - `packages/frontend/e2e/auth.setup.ts`
- **action (WHAT):**
  - Ensure dev mode and docker mode agree on API route prefix behavior.
    - Example drift to fix (see `.planning/phases/G/RESEARCH.md`): Vite dev proxy currently rewrites `/api` away, which conflicts with backend routes being registered under `/api/*`.
  - Ensure Playwright “base URL” handling is consistent:
    - smoke/e2e should run against a clearly defined baseURL (typically proxy `:8080`)
    - auth setup must use the same baseURL as tests (no hidden defaults that differ)
- **verify:**
  - Dev mode: UI can successfully call a known API route (e.g., login) without 404 caused by proxy rewriting.
  - Docker mode: UI can successfully call the same API route via proxy.
- **done:**
  - A single set of documented base URLs works with frontend API calls, and smoke checks don’t require guessing.

#### Task G1.3: Align state tracker expectations with Phase G deliverables (completion bookkeeping)
- **type:** auto
- **files:**
  - `.planning/STATE.md`
  - `.planning/phases/G/VERIFICATION.md`
  - `README.md`
- **action (WHAT):**
  - Ensure Phase G completion is easy to confirm by updating the state tracker to include:
    - the canonical smoke command
    - the canonical entrypoints
    - a link to Phase G verification evidence
  - Keep `.planning/phases/G/VERIFICATION.md` as the authoritative evidence record.
- **verify:**
  - Human: a reader can open `STATE.md` and immediately find the smoke command + entrypoints without searching.
- **done:**
  - State tracker expectations match the plan and are satisfied by Phase G evidence.

---

### Sub-plan G-2 (single session): Backend HTTP smoke harness (health + docs + auth sanity)

#### Task G2.1: Create a deterministic HTTP smoke harness
- **type:** auto
- **files (recommended):**
  - (new) `scripts/smoke/http-smoke.mjs` (or `.ts` with an existing runner; keep dependencies minimal)
- **action (WHAT):**
  - Implement a CLI-friendly smoke script that:
    - accepts `BACKEND_BASE_URL` and optional `PROXY_BASE_URL`
    - checks required endpoints:
      - `GET {BACKEND_BASE_URL}/health` -> 200
      - `GET {BACKEND_BASE_URL}/documentation` -> 200
      - `GET {BACKEND_BASE_URL}/documentation/json` -> 200 (and parseable JSON)
      - if `PROXY_BASE_URL` is set, repeat docs checks against it
    - produces clear PASS/FAIL output and exits non-zero on failure.
- **verify:**
  - Run it against docker full stack and confirm it fails when backend is down and passes when backend is up.
- **done:**
  - There is a deterministic “health+docs” operational gate runnable without a browser.

#### Task G2.2: Extend smoke harness with minimal auth sanity proof
- **type:** auto
- **files:**
  - `scripts/smoke/http-smoke.mjs`
- **action (WHAT):**
  - Add an auth sanity step using the real endpoints:
    - `POST /api/auth/register` (handle 201 success or 409 already-exists)
    - `POST /api/auth/login` to obtain an access token
    - `GET /api/auth/me` with `Authorization: Bearer <token>` -> 200
    - (preferred) `POST /api/auth/refresh` using the refresh cookie returned by login -> 200 and returns a new access token
  - Credentials should be deterministic and local-only (recommended alignment with existing Playwright setup):
    - `admin@test.local` / `Test123!@#`
- **verify:**
  - Script demonstrates “protected endpoint reachable” by passing the `/api/auth/me` step.
- **done:**
  - Smoke suite proves a minimal authenticated admin flow works end-to-end.

#### Task G2.3: Provide a single repo-level smoke command
- **type:** auto
- **files:**
  - `package.json` (root)
  - (optional) `packages/backend/package.json` / `packages/frontend/package.json`
  - `README.md`
- **action (WHAT):**
  - Add a single top-level command (recommended: `npm run smoke`) that runs the Phase G smoke suite.
  - The command must be documented and must fail fast with useful output.
  - If environment variables are needed (base URLs), the command must either:
    - provide sensible defaults for docker full stack, OR
    - document exactly what to set.
- **verify:**
  - Human: can copy/paste the documented command and get a PASS on a running stack.
- **done:**
  - Phase G Success Criterion #1 is met: “one smoke command exists”.

---

### Sub-plan G-3 (single session): Minimal Playwright sanity smoke

#### Task G3.1: Add a Playwright smoke spec that is intentionally tiny
- **type:** auto
- **files (recommended):**
  - (new) `packages/frontend/e2e/smoke.spec.ts`
- **action (WHAT):**
  - Create a minimal Playwright spec that:
    - validates the proxy entrypoint is usable (recommended baseURL: `http://localhost:8080` in docker mode)
    - checks docs reachability via browser-context request:
      - `GET /documentation` -> 200
      - `GET /documentation/json` -> 200
    - proves authenticated UI access is viable using existing auth setup / storage state.
  - Keep this spec “smoke-small”: avoid complex flows, geofencing, screenshots, exports.
- **verify:**
  - `npm run test:e2e -w packages/frontend -- e2e/smoke.spec.ts` passes reliably (no retries needed locally).
- **done:**
  - There is a minimal browser-level smoke that complements the HTTP harness.

#### Task G3.2: Wire Playwright smoke into the single smoke command
- **type:** auto
- **files:**
  - `package.json` (root)
  - `README.md`
- **action (WHAT):**
  - Ensure the repo-level smoke command runs Playwright smoke after HTTP smoke, or provide `smoke:http` and `smoke:e2e` as subcommands while still keeping a single `smoke` command as the default.
- **verify:**
  - Running the single smoke command runs both layers (HTTP + minimal browser) and fails if either fails.
- **done:**
  - Phase G Success Criterion #3 is met: smoke checks become the default verification path.

---

## Verification (Phase G gates)

### Gate 1 — Backend-level HTTP smoke
Must pass:
- `GET /health` returns 200 on canonical backend entrypoint.
- `GET /documentation` returns 200 on canonical entrypoint(s).
- `GET /documentation/json` returns 200 and returns parseable OpenAPI JSON.

### Gate 2 — Minimal auth proof
Must pass:
- Smoke harness obtains a JWT access token via `POST /api/auth/login`.
- Smoke harness can call `GET /api/auth/me` and receive 200.
- Preferred (not strictly required if cookie management becomes complex): `POST /api/auth/refresh` succeeds using refresh cookie.

### Gate 3 — Proxy parity
Must pass (docker full stack):
- `/documentation` and `/documentation/json` are reachable with 200 via proxy entrypoint (expected `:8080`).

### Gate 4 — Documentation and repeatability
Must pass:
- README (or one authoritative ops doc) contains:
  - canonical entrypoint matrix
  - the single smoke command
  - expected PASS output example and what to do on failure

> Record the final PASS evidence in `.planning/phases/G/VERIFICATION.md`.
