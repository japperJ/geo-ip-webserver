---
phase: D
plan: 0
type: index
wave: 0
depends_on:
  - "Phase A complete (recommended): baseline auth + API/type alignment reduces noise"
files_modified:
  - .planning/phases/D/PLAN.md
autonomous: true
must_haves:
  observable_truths:
    - "Phase D (D1–D3) is executable as single-session sub-plans with a clear dependency order (D-1a, D-1b, D-2)"
    - "Producer injection gap is explicitly closed: blocked requests enqueue BullMQ screenshot jobs (no request blocking)"
    - "Phase D gate can be proven end-to-end: blocked request → job → worker capture → PNG in MinIO → visible in log detail"
    - "Every sub-plan task references exact repo file paths AND a Phase D research anchor (RESEARCH.md:Lx-Ly)"
  artifacts:
    - path: .planning/phases/D/PLAN.md
      has:
        - "Three sub-plans (D-1a, D-1b, D-2) with tasks covering D1 worker, D2 producer wiring, D3 frontend viewer"
        - "Concrete naming decision for screenshot worker entrypoint"
        - "Compact dependency_graph showing execution ordering"
        - "Verification checklist mapped to Phase D gate"
  key_links:
    - from: ".planning/PORT_FEATURES_ROADMAP.md (Phase D definition: WORKER-001/002, UI-LOGS-001)"
      to: ".planning/phases/D/PLAN.md (D-1a/D-1b/D-2 sub-plans + coverage map)"
      roadmap_anchor: ".planning/PORT_FEATURES_ROADMAP.md:L211-L247"
      research_anchor: ".planning/phases/D/RESEARCH.md:L1-L14"
      verify: "All D1–D3 items listed in roadmap Phase D are mapped in the Coverage Map below"
    - from: "packages/backend/src/middleware/ipAccessControl.ts (blocked request logging path)"
      to: "packages/backend/src/services/AccessLogService.ts + packages/backend/src/services/ScreenshotService.ts (enqueue reachable from real blocked requests)"
      research_anchor: ".planning/phases/D/RESEARCH.md:L22-L24, L64-L72"
      verify: "A blocked request creates a BullMQ job in queue 'screenshots' without adding latency to the request"
    - from: "packages/backend/src/services/ScreenshotService.ts (Queue name + job name: screenshots/capture)"
      to: "packages/workers/src/screenshot-worker.ts (Worker consumes same queue + handles capture jobs)"
      research_anchor: ".planning/phases/D/RESEARCH.md:L15-L16, L33-L35, L230-L231"
      verify: "Queue producer enqueues capture jobs; worker consumes them"
    - from: "packages/workers/src/screenshot-worker.ts (upload result: s3://bucket/key)"
      to: "packages/backend/migrations/1771065929887_access-logs-table.sql + packages/backend/src/models/AccessLog.ts (screenshot_url storage + model)"
      research_anchor: ".planning/phases/D/RESEARCH.md:L155-L160, L269-L270"
      verify: "After worker completes, the access_logs row has non-null screenshot_url referencing the uploaded PNG"
    - from: "packages/frontend/src/pages/AccessLogsPage.tsx (log detail modal viewer)"
      to: "packages/backend/src/routes/gdpr.ts (GET /api/artifacts/:key(.*) pre-signed URL + RBAC)"
      research_anchor: ".planning/phases/D/RESEARCH.md:L171-L200, L93-L107"
      verify: "AccessLogs detail modal shows screenshot (via pre-signed URL) when screenshot_url exists"
---

# Phase D: Screenshot Worker (BullMQ async) — Split Sub-Plans

## Objective
Complete geo v1’s chosen **async screenshot architecture** (BullMQ + Playwright) end-to-end:

- **D1**: worker consumes jobs, captures screenshots, uploads PNG to MinIO/S3, and links them to the correct access log row.
- **D2**: blocked requests actually **enqueue** jobs (producer wiring), and job payload is navigable by Playwright.
- **D3**: admin UI displays the screenshot in the access log detail modal via the existing artifacts endpoint.

This file is an **execution index** containing three **single-session** sub-plans.

## GAP-CLOSURE (Phase D only): convert HUMAN_NEEDED → PASSED

Phase D is **code-wired** end-to-end, but verification remains **HUMAN_NEEDED** because the *Phase D gate chain* was not proven live in this session:

> Blocked request → job → worker capture → PNG in MinIO → visible in log detail.

This gap-closure section focuses on **maximizing automated proof** (backend-first, deterministic) and **isolating any truly manual checks** into a short human checklist.

### Automated proof tasks (preferred)

#### Task D-GAP.1: Add a deterministic integration test for the full screenshot pipeline (no UI)
- **files:**
	- `packages/backend/src/tests/integration/screenshotPipeline.test.ts` (new)
	- `packages/backend/vitest.config.ts` (only if needed to tag/partition integration tests)
	- `packages/backend/package.json` (only if adding a dedicated test script, e.g. `test:integration`)
- **action:** Create an integration test that proves the chain **end-to-end** using real Redis + MinIO + DB, and a running worker consumer:
	- Arrange a site/policy that reliably produces a **blocked request**.
	- Trigger a request that is denied by `ipAccessControl` and confirm an `access_logs` row is written.
	- Confirm a BullMQ job is enqueued (queue: `screenshots`, job: `capture`).
	- Run a real consumer (preferred: import worker module and start a Worker instance in-test; acceptable: spawn worker process) and wait for completion.
	- Assert `access_logs.screenshot_url` becomes non-null.
	- Assert the object exists in MinIO (HEAD by key) and is a PNG (`\x89PNG` signature or `Content-Type: image/png`).
	- Assert backend artifacts pre-sign endpoint returns a URL that fetches bytes successfully (HTTP 200) for the same key.

	Keep it deterministic:
	- Use strict timeouts with polling (e.g., retry for up to 30–60s, fail with clear diagnostics).
	- Avoid relying on the frontend.
	- Avoid external network calls; only talk to local test infra.
	- If Playwright capture makes the test flaky, use a known-stable target page served by the backend itself (e.g., a tiny HTML endpoint under a test-only route) so navigation is predictable.
- **verify:** `npm test -w packages/backend -- <new test path>` passes locally with the required infra running (or started by the test harness).
- **done:** A single command produces automated proof for: denied request → enqueue → worker consumes → PNG in MinIO → `screenshot_url` stored → artifacts endpoint serves it.

#### Task D-GAP.2: Make the integration test runnable in CI/dev with minimal friction
- **files:**
	- `docker-compose.dev.yml` or `docker-compose.monitoring.yml` (only if needed for a minimal “test infra” profile)
	- `packages/backend/README.md` (optional) OR `.planning/phases/D/SUMMARY.md` (optional) to document “how to run the Phase D gate test”
- **action:** Ensure the new integration test has a clear, repeatable execution path:
	- Either (preferred) the test spins up infra itself (testcontainers-style), or
	- Provide a single documented compose profile that starts only what the test needs (Postgres + Redis + MinIO), and the test starts backend + worker in-process.

	Add one explicit “if auth/creds missing” stop condition:
	- If MinIO/S3 credentials are not configured for tests, the test should fail fast with a clear message explaining required env vars.
- **verify:** A clean run from repo root (documented in one place) yields the test passing without manual clicking.
- **done:** Phase D gate is reproducible and mostly automated for future regressions.

### Deployment/profile alignment (only if it blocks the gate run)

#### Task D-GAP.3: Resolve the “prod compose lacks worker/minio/redis” ambiguity (document or align)
- **files:**
	- `docker-compose.prod.yml`
	- `PRODUCTION.md` and/or `DEPLOYMENT.md` (whichever is authoritative)
- **action:** Make it explicit how Phase D components run in the intended production mode:
	- If production expects *external* Redis/S3 and a separately managed worker (systemd/K8s), document that clearly and remove any misleading assumptions.
	- If production compose is intended to be “full stack”, add/enable `worker` and required dependencies so the gate can be executed in that profile.
- **verify:** The chosen production/staging recipe can execute the Phase D gate without “missing service” confusion.
- **done:** Operators have one clear path to run the worker in production and to reproduce the gate in staging.

### HUMAN verification checklist (only what automation can’t prove)

If the automated test passes, only these manual checks remain for Phase D sign-off:

1. **UI visibility:** In the admin UI, open an access log entry that has `screenshot_url` set and confirm the screenshot thumbnail renders and can be opened full-size.
2. **Audit sanity:** Confirm the screenshot shown corresponds to the blocked attempt (time/site alignment looks correct).

## Context anchors
- Roadmap definition: `.planning/PORT_FEATURES_ROADMAP.md:L211-L247`
- Research: `.planning/phases/D/RESEARCH.md` (all tasks cite specific anchors)

## Roadmap task ID mapping (explicit)
- **WORKER-001** — screenshot worker process: `.planning/PORT_FEATURES_ROADMAP.md:L217-L220`
- **WORKER-002** — link access logs to artifacts: `.planning/PORT_FEATURES_ROADMAP.md:L222-L224`
- **UI-LOGS-001** — log detail screenshot viewer: `.planning/PORT_FEATURES_ROADMAP.md:L226-L229`

## Concrete decisions (to eliminate naming mismatch risk)

### Decision D-NAME-1: Worker entrypoint naming
**Decision:** Create `packages/workers/src/screenshotWorker.ts` as the **canonical entrypoint** (matches roadmap), and treat the existing `packages/workers/src/screenshot-worker.ts` as the implementation module until a later cleanup.

- Rationale: avoids risky rename edge-cases on Windows + keeps history intact; scripts/Docker can be pointed at a stable entrypoint.
- Research anchor: `.planning/phases/D/RESEARCH.md:L135-L141`.

## Dependency order (single-session sub-plans)

Execute in this order:
1) **Sub-plan D-1a** — Producer wiring (close injection gap + job payload correctness) (covers **D2**, prerequisite for end-to-end proof)
2) **Sub-plan D-1b** — Worker/DB/env alignment (entrypoint shim + DB update + env standardization) (covers **D1** and unlocks worker completion)
3) **Sub-plan D-2** — Frontend screenshot viewer (covers **D3**, and proves UI gate)

> If you encounter an authentication/authorization error during execution (JWT, RBAC, MinIO creds, etc.), stop immediately and request the user to authenticate or provide required environment configuration.

## dependency_graph (compact)

```yaml
dependency_graph:
	D-1a:
		needs: []
		creates: []
	D-1b:
		needs: [D-1a]
		creates: [packages/workers/src/screenshotWorker.ts]
	D-2:
		needs: [D-1a, D-1b]
		creates: []
```

## Coverage map (keep D1–D3 intact)

| Roadmap item | Covered by | Notes |
|---|---|---|
| **D1** screenshot worker implementation (Playwright + BullMQ) | Sub-plan D-1b | Worker exists but is incomplete (DB update, entrypoint naming, env alignment) (RESEARCH.md:L19-L24, L155-L160, L269-L270) |
| **D2** producer wiring from blocked requests to enqueue | Sub-plan D-1a | Must close producer injection gap so blocked requests enqueue (RESEARCH.md:L22-L24, L64-L72) |
| **D3** frontend AccessLogs screenshot viewer integration | Sub-plan D-2 | Use `/api/artifacts/:key` pre-signed URL endpoint + render in detail modal (RESEARCH.md:L171-L200) |

---

## Sub-plan D-1a (single session): D2 — Producer wiring (blocked request → job enqueue)

### Task D-1a.1: Close the producer injection gap (blocked requests must enqueue)
- **files:**
	- `packages/backend/src/middleware/ipAccessControl.ts`
	- `packages/backend/src/index.ts`
	- `packages/backend/src/services/AccessLogService.ts`
- **action:** Ensure the **AccessLogService instance used by ipAccessControl** has `ScreenshotService` injected, so `allowed=false` logs enqueue screenshot jobs.
	- Preserve non-blocking behavior (no screenshot capture in-request; enqueue remains async).
- **research anchors:**
	- Gap description: `.planning/phases/D/RESEARCH.md:L22-L24`
	- Exact root cause anchor (non-injected service in middleware): `.planning/phases/D/RESEARCH.md:L64-L66`
	- Async/non-blocking constraint: `.planning/phases/D/RESEARCH.md:L59-L60, L208-L210`
- **verify:**
	- Make a request that is blocked by IP access control.
	- Confirm (1) access log row exists and (2) a BullMQ job is enqueued in `screenshots` queue.
- **done:** Blocked requests reliably enqueue screenshot jobs in production request path.

### Task D-1a.2: Ensure job URL is Playwright-navigable (absolute URL) + basic SSRF guardrails
- **files:**
	- `packages/backend/src/middleware/ipAccessControl.ts`
	- `packages/backend/src/services/AccessLogService.ts`
- **action:** Ensure screenshot job payload contains an **absolute URL** suitable for Playwright navigation, rather than `request.url` path-only strings; limit navigation targets to intended site origins.
- **research anchors:**
	- Relative URL risk: `.planning/phases/D/RESEARCH.md:L24-L24, L295-L312`
	- Source of relative URL: `.planning/phases/D/RESEARCH.md:L65-L66, L243-L244`
	- SSRF risk callout: `.planning/phases/D/RESEARCH.md:L213-L217`
- **verify:** Worker can consistently `goto()` the URL for a blocked request and produce a screenshot.
- **done:** Playwright navigation failures due to relative URLs are eliminated; navigation scope is constrained.

---

## Sub-plan D-1b (single session): D1 — Worker completion + DB/env alignment (job → capture → upload → DB update)

### Task D-1b.1: Resolve worker entrypoint naming mismatch (non-functional shim)
- **files:**
	- `packages/workers/src/screenshotWorker.ts` (new)
	- `packages/workers/package.json`
	- `packages/workers/Dockerfile`
- **action:** Add a stable camelCase entrypoint and wire worker runtime scripts/Docker to use it.
- **research anchors:**
	- Naming mismatch + options: `.planning/phases/D/RESEARCH.md:L135-L141`
	- Existing scripts referencing kebab file: `.planning/phases/D/RESEARCH.md:L128-L133`
- **verify:** Worker process starts successfully in both `dev` and containerized execution paths (no behavior change expected yet).
- **done:** Roadmap naming is satisfied without breaking current worker behavior.

### Task D-1b.2: Complete worker → DB linkage update (set access_logs.screenshot_url)
- **files:**
	- `packages/workers/src/screenshot-worker.ts`
	- `packages/workers/package.json` (deps if needed)
	- `packages/workers/src/db.ts` (new minimal DB helper if needed)
- **action:** After successful capture + upload, update the corresponding `access_logs` row using the composite identity `(id, timestamp)` so `screenshot_url` becomes non-null.
- **research anchors:**
	- screenshot_url column + PK implications: `.planning/phases/D/RESEARCH.md:L155-L160`
	- Worker currently missing DB update: `.planning/phases/D/RESEARCH.md:L269-L270`
- **verify:**
	- Trigger a known blocked request that logs an access_log row.
	- Confirm worker run results in the DB row having `screenshot_url` set (and that it points to the uploaded PNG).
- **done:** Worker is not just uploading—access logs are linked to screenshot artifacts.

### Task D-1b.3: Align runtime configuration for Redis + MinIO/S3 across producer and worker (gate blocker)
- **files:**
	- `packages/backend/src/services/ScreenshotService.ts`
	- `packages/workers/src/screenshot-worker.ts`
	- `docker-compose.yml`
	- `docker-compose.dev.yml`
	- `docker-compose.prod.yml`
	- `docker-compose.monitoring.yml`
	- `packages/backend/.env.example`
	- `infrastructure/docker/.env.example`
	- `packages/workers/.env.example` (new)
- **action:** Standardize Redis and S3/MinIO environment variables so:
	- backend producer can enqueue (`screenshots` queue),
	- worker can consume, and
	- worker can upload to MinIO/S3 in the same environment.
- **research anchors:**
	- S3 env mismatch: `.planning/phases/D/RESEARCH.md:L298-L304`
	- Redis env mismatch: `.planning/phases/D/RESEARCH.md:L300-L303`
- **verify:** In the target run mode (docker compose or local), jobs are visible and processed; uploads succeed.
- **done:** Phase D verification can run without “can’t connect to Redis/MinIO” false failures.

---

## Sub-plan D-2 (single session): D3 — Frontend screenshot viewer (log detail modal)

### Task D3.1: Extend AccessLog typing/shape to carry screenshot_url through UI state
- **files:**
	- `packages/frontend/src/lib/accessLogApi.ts`
	- `packages/frontend/src/pages/AccessLogsPage.tsx`
- **action:** Ensure the selected log object used by the detail modal includes the backend `screenshot_url` field (nullable).
- **research anchors:**
	- Frontend typing mismatch context: `.planning/phases/D/RESEARCH.md:L179-L187`
	- Viewer missing note: `.planning/phases/D/RESEARCH.md:L25-L26`
- **verify:** Access logs list/detail still works, and selecting a log with screenshot_url exposes it in the modal’s state.
- **done:** UI has a reliable, typed path to `screenshot_url`.

### Task D3.2: Add screenshot section to log detail modal (pre-signed URL + thumbnail)
- **files:**
	- `packages/frontend/src/pages/AccessLogsPage.tsx`
	- `packages/frontend/src/lib/artifactsApi.ts` (new)
- **action:** In the log detail modal, render a “Screenshot” section when `screenshot_url` exists:
	1) Extract object key from `s3://bucket/key`.
	2) Call backend `GET /api/artifacts/:key` to obtain a short-lived URL.
	3) Render thumbnail (`<img>`) with a link to open full PNG.
- **research anchors:**
	- Modal insertion anchor: `.planning/phases/D/RESEARCH.md:L171-L176`
	- Viewer flow + artifacts endpoint: `.planning/phases/D/RESEARCH.md:L199-L200, L93-L107`
- **verify:** Open a blocked log entry that has `screenshot_url` set; screenshot loads in the modal and can be opened full-size.
- **done:** Screenshots are visible to authorized users directly from access log details.

---

## Phase D Gate: End-to-end verification checklist
Gate statement: **“Blocked request → BullMQ job → worker captures screenshot → PNG in MinIO → visible in log detail”** (roadmap anchor: `.planning/PORT_FEATURES_ROADMAP.md:L236`).

Checklist (must all pass):
1) **Trigger a blocked request** (e.g., denylist your IP / disallow country).
	 - Expected: request is rejected (403) and an access log row is created.
2) **Confirm enqueue** happened without blocking the request.
	 - Expected: a BullMQ job exists in queue `screenshots` with the expected job name (see research anchors `.planning/phases/D/RESEARCH.md:L33-L35, L230-L231`).
3) **Worker consumes job and captures** via Playwright.
	 - Expected: worker logs show successful navigation + screenshot capture.
4) **PNG exists in MinIO/S3** under a key that matches RBAC convention (`screenshots/blocked/{siteId}/...`).
	 - Expected: object present and accessible to backend presigner.
5) **DB row updated**.
	 - Expected: `access_logs.screenshot_url` is non-null for that log row (research anchors `.planning/phases/D/RESEARCH.md:L155-L160`).
6) **Frontend viewer works**.
	 - Expected: AccessLogs detail modal shows a screenshot thumbnail via `/api/artifacts/:key`, and authorized users can open it.

## Notes / known risks to keep visible during execution
- Producer injection gap is the #1 likely reason for “no jobs are enqueued” (RESEARCH.md:L22-L24, L64-L66).
- Relative URL payload is the #1 likely reason for “job exists but worker fails to navigate” (RESEARCH.md:L24-L24, L295-L312).
- Env var mismatches are the #1 likely reason for “worker can’t connect / uploads fail” (RESEARCH.md:L298-L303).