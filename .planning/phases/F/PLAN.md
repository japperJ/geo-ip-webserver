---
phase: F
plan: 0
type: index
wave: 1
depends_on:
  - "Phase A complete (recommended): avoids repeated docs churn while core access-control/auth changes settle"
files_modified:
  - .planning/phases/F/PLAN.md
autonomous: true
must_haves:
  observable_truths:
    - "F1 (DOC-001): .planning/STATE.md is internally consistent and reflects the A–F improvement plan reality (not the legacy 0–5-only plan)."
    - "F2 (DOC-002): Swagger UI is reachable at /documentation and its spec endpoints (at least /documentation/json) return 200."
    - "Docs route blockers are explicitly fixed: /documentation is not site-gated by siteResolution and is not blocked by IP/GPS access-control hooks."
    - "Helmet/CSP is compatible with Swagger UI (no inline-script CSP breakage); approach uses swagger-provided CSP allowances."
    - "Every task references exact repo file paths AND Phase F research anchors (RESEARCH.md:Lx-Ly)."
  artifacts:
    - path: .planning/STATE.md
      has:
        - "A single, consistent phase model (A–F improvement plan) with no contradictory legacy 0–5 'Not started' claims"
        - "Quick Stats that do not reference the stale 145-task/6% baseline"
        - "Next step reflects Phase F or the next planned phase in .planning/PORT_FEATURES_ROADMAP.md"
    - path: packages/backend/src/index.ts
      has:
        - "@fastify/swagger registered before routes (route discovery)"
        - "@fastify/swagger-ui registered with routePrefix '/documentation'"
        - "Zod->OpenAPI transform wiring via fastify-type-provider-zod jsonSchemaTransform"
        - "Helmet/CSP integration that includes instance.swaggerCSP.script/style for Swagger UI compatibility"
    - path: packages/backend/src/middleware/siteResolution.ts
      has:
        - "Skip logic includes /documentation (and subpaths) so docs are not site-gated"
    - path: packages/backend/src/middleware/ipAccessControl.ts
      has:
        - "Skip logic includes /documentation (and subpaths) so docs are not blocked/logged as access attempts"
    - path: packages/backend/src/middleware/gpsAccessControl.ts
      has:
        - "Skip logic includes /documentation (and subpaths) so geo-required sites do not block docs"
    - path: packages/backend/package.json
      has:
        - "Dependencies added for @fastify/swagger and @fastify/swagger-ui (Fastify v5 compatible versions)"
  key_links:
    - from: ".planning/PORT_FEATURES_ROADMAP.md (Phase F: DOC-001, DOC-002)"
      to: ".planning/phases/F/PLAN.md (Sub-plans F-1 and F-2 + verification)"
      roadmap_anchor: ".planning/PORT_FEATURES_ROADMAP.md:L280-L312"
      research_anchor: ".planning/phases/F/RESEARCH.md:L16-L24"
      verify: "DOC-001 and DOC-002 are each mapped to one single-session sub-plan with explicit verification steps."
    - from: "packages/backend/src/middleware/siteResolution.ts (skip list currently excludes /documentation)"
      to: "packages/backend/src/middleware/siteResolution.ts (skip /documentation and subpaths)"
      research_anchor: ".planning/phases/F/RESEARCH.md:L60-L79"
      verify: "GET /documentation returns 200 without requiring a configured Site for the request hostname."
    - from: "packages/backend/src/index.ts (global onRequest hooks: ipAccessControl + gps wrapper)"
      to: "packages/backend/src/middleware/ipAccessControl.ts + packages/backend/src/middleware/gpsAccessControl.ts (docs bypass)"
      research_anchor: ".planning/phases/F/RESEARCH.md:L80-L92"
      verify: "GET /documentation and /documentation/json are never blocked with 403 (including gps_required) and are not logged as visitor access attempts."
    - from: "packages/backend/src/index.ts (Helmet CSP: script-src self only)"
      to: "packages/backend/src/index.ts (Helmet integration includes instance.swaggerCSP.script/style)"
      research_anchor: ".planning/phases/F/RESEARCH.md:L94-L112"
      verify: "Swagger UI loads and runs in the browser without CSP console violations related to inline bootstrap scripts/styles."
    - from: "packages/backend/src/index.ts (Zod compilers already configured)"
      to: "packages/backend/src/index.ts (@fastify/swagger uses jsonSchemaTransform + optional skipList)"
      research_anchor: ".planning/phases/F/RESEARCH.md:L113-L142"
      verify: "GET /documentation/json returns an OpenAPI document containing at least the routes that already define Zod Fastify schemas (e.g., sites/accessLogs/content)."
    - from: ".planning/STATE.md (contradictory legacy metrics and phase tables)"
      to: ".planning/STATE.md (consistent A–F improvement-plan state)"
      research_anchor: ".planning/phases/F/RESEARCH.md:L144-L173"
      verify: "A quick scan/search finds no simultaneous claims like 'Phase A–E complete' AND 'Phase 1–5 not started' AND '6% (9/145)'."
---

# Phase F: Documentation Sync (DOC-001, DOC-002) — Split Sub-Plans

## Objective
Deliver Phase F’s two roadmap outcomes with minimal scope:

- **F1 / DOC-001:** Make `.planning/STATE.md` reflect current reality and be internally consistent.
- **F2 / DOC-002:** Add Swagger/OpenAPI docs and ensure **Swagger UI is accessible at `/documentation`**.

This plan is an **execution index** containing two **single-session** sub-plans.

## Context anchors
- Roadmap definition: `.planning/PORT_FEATURES_ROADMAP.md:L280-L312`
- Research: `.planning/phases/F/RESEARCH.md` (all tasks cite specific anchors)

## Roadmap task ID mapping (explicit)
- **DOC-001** (STATE.md accuracy): `.planning/PORT_FEATURES_ROADMAP.md:L286-L288`
- **DOC-002** (Swagger UI at /documentation): `.planning/PORT_FEATURES_ROADMAP.md:L290-L303`

## Dependency order (single-session sub-plans)
Execute in this order:
1) **Sub-plan F-1** — DOC-001: STATE.md accuracy update (pure docs)
2) **Sub-plan F-2** — DOC-002: Swagger/OpenAPI + docs route unblock + CSP compatibility

> If you encounter an authentication/authorization error during execution (JWT, RBAC, dev env constraints), stop immediately and request the user to authenticate or provide required environment configuration.

## dependency_graph (compact)

```yaml
dependency_graph:
  F-1:
    needs: []
    creates: []
  F-2:
    needs: [F-1]
    creates: []
```

---

## Sub-plan F-1 (single session): F1 — DOC-001 STATE.md accuracy update

### Task F1.1: Choose the authoritative phase model and make STATE.md consistent
- **type:** auto
- **files:**
  - `.planning/STATE.md`
  - `.planning/PORT_FEATURES_ROADMAP.md` (reference; no change expected)
- **action:**
  - Update `.planning/STATE.md` to use **one** consistent phase axis.
    - **Default for Phase F:** treat A–F improvement plan as the active roadmap (because it matches current “Phase A–E complete” claims).
  - Remove/replace stale legacy signals that contradict the A–F reality, including (non-exhaustive):
    - the legacy **0–5** “Phase Status Overview” table showing phases 1–5 as 🔴 Not Started
    - the legacy **145 tasks / 6%** “Quick Stats” baseline
    - KPI / risk tracking sections that still say “Project not started”
  - Ensure the document clearly answers:
    1) what is complete,
    2) what is next,
    3) when it was last updated.
- **research anchors:**
  - Drift inventory + what’s inconsistent: `.planning/phases/F/RESEARCH.md:L144-L173`
- **verify:**
  - Manual audit (fast): search within `.planning/STATE.md` for:
    - `"6% (9/145"`
    - `"🔴 Not Started"`
    - `"Project not started"`
    and confirm any remaining mentions are either removed or reframed as explicitly historical.
- **done:**
  - `.planning/STATE.md` contains no mutually contradictory phase/progress claims.

### Task F1.2: Add a minimal A–F improvement-plan status summary block
- **type:** auto
- **files:**
  - `.planning/STATE.md`
- **action:**
  - Add a compact “A–F Improvement Plan Status” section (table is fine) that:
    - lists phases A–F,
    - marks A–E as complete (per current repository reality), and
    - marks F as planned/in-progress until DOC-002 is merged.
  - Ensure Phase F references the Phase F gate explicitly: `/documentation` reachable.
- **research anchors:**
  - Phase F requirements and deliverables: `.planning/phases/F/RESEARCH.md:L16-L24`
  - Phase F verification expectations: `.planning/phases/F/RESEARCH.md:L174-L202`
- **verify:**
  - Visual scan: A–F table exists, is consistent with the header, and does not conflict with any other phase tables.
- **done:**
  - STATE clearly reflects the A–F improvement plan and includes Phase F (not missing).

---

## Sub-plan F-2 (single session): F2 — DOC-002 Swagger/OpenAPI + `/documentation` unblocking

### Task F2.1: Add Swagger dependencies (Fastify v5 compatible)
- **type:** auto
- **files:**
  - `packages/backend/package.json`
- **action:**
  - Add backend dependencies for:
    - `@fastify/swagger`
    - `@fastify/swagger-ui`
  - Select versions compatible with Fastify v5 (per upstream compatibility tables).
- **research anchors:**
  - Requirement that Swagger UI is served at `/documentation`: `.planning/phases/F/RESEARCH.md:L16-L24`
- **verify:**
  - Backend dependency install/build succeeds in the target environment.
- **done:**
  - Backend can import/register Swagger plugins.

### Task F2.2: Register `@fastify/swagger` + `@fastify/swagger-ui` with Zod transform before routes
- **type:** auto
- **files:**
  - `packages/backend/src/index.ts`
- **action:**
  - Register `@fastify/swagger` **before route registration** so routes are discovered.
  - Configure OpenAPI v3 `info` minimally (title/version) and wire Zod transforms:
    - `transform: jsonSchemaTransform`
    - (optional but recommended) `transformObject: jsonSchemaTransformObject` to support `$ref`/components as schema coverage improves.
    - (optional) `transform: createJsonSchemaTransform({ skipList: ["/documentation/static/*"] })` to avoid documenting Swagger UI static endpoints.
  - Register `@fastify/swagger-ui` with:
    - `routePrefix: '/documentation'`
    - default endpoints expected by upstream (`/documentation/`, `/documentation/json`, `/documentation/yaml`).
- **research anchors:**
  - “Must register swagger before routes” + insertion point in this repo: `.planning/phases/F/RESEARCH.md:L25-L59`
  - Zod transform wiring recommendation: `.planning/phases/F/RESEARCH.md:L113-L142`
- **verify:**
  - `GET /documentation/json` returns 200 and returns a JSON OpenAPI document.
- **done:**
  - Swagger spec is generated and Swagger UI routes exist at `/documentation`.

### Task F2.3: Fix docs-route blockers (siteResolution + access-control bypass)
- **type:** auto
- **files:**
  - `packages/backend/src/middleware/siteResolution.ts`
  - `packages/backend/src/middleware/ipAccessControl.ts`
  - `packages/backend/src/middleware/gpsAccessControl.ts`
- **action:**
  - Ensure requests to **`/documentation` and all Swagger UI subpaths** are not treated as site traffic.
    - Update `siteResolution.ts` skip logic to include `/documentation` and subpaths so docs are not gated on hostname/site lookup.
  - Ensure requests to docs endpoints are not blocked/denied by access control:
    - Update `ipAccessControl.ts` to bypass docs paths.
    - Update GPS enforcement path to bypass docs paths (either in `gpsAccessControl.ts` or via the wrapper hook in `index.ts`, depending on current structure).
  - Bypass must include at least:
    - `/documentation`
    - `/documentation/`
    - `/documentation/json`
    - `/documentation/yaml`
    - `/documentation/*` (static assets)
- **research anchors:**
  - Site resolution blocker details: `.planning/phases/F/RESEARCH.md:L60-L79`
  - IP/GPS onRequest blocker details: `.planning/phases/F/RESEARCH.md:L80-L92`
- **verify:**
  - `GET /documentation` returns 200 (not 400/404 from site resolution).
  - `GET /documentation/json` returns 200 (not 403, including `gps_required`).
- **done:**
  - Swagger UI endpoints are reachable regardless of site configuration and site access-control rules.

### Task F2.4: Fix Helmet CSP compatibility for Swagger UI using swagger-provided allowances
- **type:** auto
- **files:**
  - `packages/backend/src/index.ts`
- **action:**
  - Update Helmet CSP configuration so Swagger UI’s inline bootstrap can execute.
  - Use upstream integration approach that merges swagger-generated CSP allowances:
    - extend `script-src` with `instance.swaggerCSP.script`
    - extend `style-src` with `instance.swaggerCSP.style`
  - Keep the rest of the CSP as strict as it is today (do not broadly disable CSP).
- **research anchors:**
  - CSP incompatibility analysis + expected fix shape: `.planning/phases/F/RESEARCH.md:L94-L112`
- **verify:**
  - In a real browser, open `/documentation` and confirm the UI renders and functions.
  - Browser console shows no CSP violations preventing Swagger UI scripts/styles from running.
- **done:**
  - Swagger UI is functional under Helmet CSP.

---

## Verification (Phase F gates)

### Gate 1: `/documentation` reachability and functionality
Checklist (must all pass):
1. `GET /documentation` returns 200 and serves Swagger UI HTML.
2. `GET /documentation/json` returns 200 and returns JSON OpenAPI content.
3. `GET /documentation/yaml` returns 200 (optional but expected with default Swagger UI plugin behavior).
4. No site/access-control blockers:
   - no `404 No site configured for hostname`
   - no `403 Forbidden` / `gps_required`
5. No CSP blockers:
   - Swagger UI loads and runs without CSP console errors.

### Gate 2: STATE consistency
Checklist (must all pass):
1. `.planning/STATE.md` does not simultaneously claim:
   - “Phase A–E complete” AND
   - “Phase 1–5 not started” AND
   - “Overall progress 6% (9/145 tasks)”
2. Phase F appears in the state tracking in some form (table or narrative), and indicates Swagger docs are the Phase F exit criterion.
3. “Last Updated” metadata looks current and is not still attributed to “Initial Planning” unless intentionally preserved as historical.

---

## GAP-CLOSURE (single remaining gap): `/documentation` blocked on active `:3000` entrypoint

### Gap statement
`/documentation` (and `/health`, `/ready`) return **403** on the **active workspace entrypoint at `localhost:3000`**, while the **direct backend runtime on `:3101`** serves documentation correctly.

This strongly suggests **runtime/environment drift** (wrong service bound to `:3000` or an upstream gateway/WAF in front of the backend), not a missing backend wiring change (because backend skip/bypass logic already includes docs + health paths).

### Task GC.1: Determine whether this is code wiring vs runtime drift
- **type:** checkpoint:human-verify
- **files:** (read-only)
  - `docker-compose.yml`
  - `docker-compose.prod.yml`
  - `packages/backend/src/middleware/siteResolution.ts`
  - `packages/backend/src/middleware/ipAccessControl.ts`
  - `packages/backend/src/middleware/gpsAccessControl.ts`
  - `packages/backend/src/index.ts`
- **action:**
  - Identify what is actually serving `http://localhost:3000` in the current workspace.
    - Confirm whether `:3000` is a local Node process, a Docker container port-forward, a reverse proxy, or a platform “security gateway”.
  - Capture the differentiators between `:3000` and `:3101`:
    - response status + body for `/health` and `/documentation/json`
    - response headers that indicate server identity (e.g., `server`, `via`, `x-powered-by`, any gateway-specific headers)
- **verify:**
  - If `:3000` is not the same backend instance as `:3101`, classify as **RUNTIME_DRIFT**.
  - If `:3000` is the same backend instance, extract the exact 403 response JSON (fields `reason` / `message`) and map it to the middleware that generated it.
- **done:**
  - You can state one of the following with evidence:
    1) **RUNTIME_DRIFT:** `:3000` is not the backend from this repo (or is behind an upstream blocker), OR
    2) **CODE_WIRING:** backend middleware is generating the 403 and must be adjusted.

### Task GC.2A (if RUNTIME_DRIFT): Minimal operational fix + re-verify
- **type:** checkpoint:human-action
- **files:** none required (unless you choose to align compose port mappings as a follow-up)
- **action:**
  - Fix the workspace entrypoint so the backend docs are reachable on the port the workspace exposes as `:3000`.
  - Minimal acceptable operational outcomes (choose the smallest that applies):
    - Stop/replace the conflicting service currently bound to `:3000`.
    - Ensure the correct backend container/process is published/forwarded to `:3000`.
    - If using Docker Compose, confirm which compose file is running and whether backend is intentionally exposed on `3001` (common) vs `3000` (workspace default).
- **verify:**
  - After the operational change, re-run Gate 1 checks against `http://localhost:3000/documentation` and `http://localhost:3000/documentation/json`.
- **done:**
  - Gate 1 passes on `:3000` with no code changes required.

### Task GC.2B (if CODE_WIRING): Smallest in-scope code fix plan
- **type:** auto
- **files:** (choose only the one(s) proven to emit the 403)
  - `packages/backend/src/middleware/siteResolution.ts`
  - `packages/backend/src/middleware/ipAccessControl.ts`
  - `packages/backend/src/middleware/gpsAccessControl.ts`
  - `packages/backend/src/index.ts`
- **action:**
  - Apply the smallest change that makes `GET /documentation` and `GET /documentation/json` return 200 on the `:3000` runtime.
  - Preserve security posture for real site traffic; only widen bypass/skip rules for documentation and health endpoints if needed.
- **verify:**
  - Gate 1 passes on `:3000` and there is no regression in IP/GPS enforcement for non-docs endpoints.
- **done:**
  - Docs endpoints are reachable on the active `:3000` entrypoint, and direct backend behavior remains correct.
