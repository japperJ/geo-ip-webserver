---
phase: G
plan: GAP-001
type: gaps
wave: 1
depends_on:
  - .planning/INTEGRATION.md
  - .planning/phases/G/VERIFICATION.md
files_modified:
  - packages/backend/src/tests/integration/screenshotPipeline.test.ts
  - packages/backend/TESTING.md
  - .github/workflows/ci.yml
  - docker-compose.yml
  - docker-compose.dev.yml
  - docker-compose.monitoring.yml
  - infrastructure/docker/docker-compose.yml
  - STAGING.md
  - PRODUCTION.md
autonomous: true
must_haves:
  observable_truths:
    - "CI does not fail due to missing S3 env for screenshot pipeline tests."
    - "CI explicitly runs the screenshot pipeline integration gate in an environment that provides S3-compatible storage (MinIO) + required env vars."
    - "Redis eviction policy guidance and config in integration/staging is 'noeviction' to avoid BullMQ data loss; verification is explicit."
  artifacts:
    - path: packages/backend/src/tests/integration/screenshotPipeline.test.ts
      has:
        - "Explicit env contract behavior (skip-by-default OR fail-fast with clear message), documented"
        - "Redis maxmemory-policy check used as an enforceable gate for integration/staging"
    - path: packages/backend/TESTING.md
      has:
        - "How to run screenshot pipeline integration test locally"
        - "Required env vars list + sample values (MinIO via docker-compose.yml)"
    - path: .github/workflows/ci.yml
      has:
        - "A deterministic job/step that runs screenshotPipeline.test.ts with MinIO + AWS_S3_* env set"
    - path: docker-compose*.yml
      has:
        - "Redis configured with maxmemory-policy noeviction where queue reliability is required"
  key_links:
    - from: "CI backend test job"
      to: "screenshotPipeline.test.ts env expectations"
      verify: "CI either (a) skips the test when env not present OR (b) provides env+services and runs it explicitly; no accidental red builds"
    - from: "Redis container config"
      to: "BullMQ screenshot queue reliability"
      verify: "redis-cli CONFIG GET maxmemory-policy returns 'noeviction' in integration/staging configs"
---

# Phase G, GAP-001: Close post-Phase-G integration drift (Screenshot env contract + Redis eviction policy)

## Objective
Close the two remaining **post-Phase-G integration issues** identified in `.planning/INTEGRATION.md`, without any feature expansion:

1) Make the **screenshot pipeline integration test** deterministic across local runs and CI by documenting the env contract and enforcing it predictably.

2) Provide **Redis eviction-policy guidance** and align integration/staging configs to **`maxmemory-policy noeviction`** for BullMQ queue reliability.

**Scope constraint:** docs/config/tests only (no new product features).

## Context
- `.planning/INTEGRATION.md` flags:
  - screenshot pipeline test fails fast without `AWS_S3_*` env
  - Redis eviction policy warning recommends `noeviction`
- Existing test entrypoint: `npm run test:integration:screenshot -w packages/backend`.

## Tasks

### Task 1: Screenshot pipeline test env contract — document + make CI deterministic
- **files:**
  - `packages/backend/src/tests/integration/screenshotPipeline.test.ts`
  - `packages/backend/TESTING.md`
  - `.github/workflows/ci.yml`

- **action (WHAT to change):**
  1. **Document the contract** for running `screenshotPipeline.test.ts`:
     - Required env vars: `AWS_S3_ENDPOINT`, `AWS_S3_ACCESS_KEY_ID`, `AWS_S3_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`.
     - Recommended env vars for MinIO: `AWS_S3_REGION`, `AWS_S3_FORCE_PATH_STYLE=true`.
     - Clarify that the test expects a running **S3-compatible endpoint** (MinIO is fine).
     - Provide a minimal “local dev” recipe that matches repo defaults (ports from `docker-compose.yml`).

  2. **Change the test so missing S3 env does not create accidental red builds** when running the general unit test suite:
     - Preferred behavior: conditionally skip the suite (or the single test) when required env vars are missing, with a clear skip reason pointing to `packages/backend/TESTING.md`.
     - The skip must be explicit and discoverable (e.g., emitted once at runtime), not silent.

  3. **Add an explicit CI enforcement path** so the screenshot pipeline gate still runs in CI:
     - Add a dedicated job or step that starts a MinIO service (S3-compatible) and sets the required `AWS_S3_*` env vars.
     - Run `npm run test:integration:screenshot -w packages/backend` (only this file) in that job/step.
     - Keep the existing general backend test job fast and stable.

- **verify:**
  - Local:
    - Running `npm test -w packages/backend` without any `AWS_S3_*` env **does not fail** due to `screenshotPipeline.test.ts`.
    - Running `npm run test:integration:screenshot -w packages/backend` with env set (per docs) **passes**.
  - CI:
    - Existing `test-backend` job remains green without MinIO.
    - New CI job/step for screenshot integration is green and visibly runs `screenshotPipeline.test.ts`.

- **done:**
  - `packages/backend/TESTING.md` exists and includes exact env var names + example values.
  - CI has a deterministic screenshot integration gate.
  - No environment-sensitive “surprise failures” remain.

---

### Task 2: Redis eviction policy for queue reliability — align configs + document the why
- **files:**
  - `docker-compose.yml`
  - `docker-compose.dev.yml`
  - `docker-compose.monitoring.yml`
  - `infrastructure/docker/docker-compose.yml`
  - `STAGING.md`
  - `PRODUCTION.md`
  - (optional) `packages/backend/src/tests/integration/screenshotPipeline.test.ts`

- **action (WHAT to change):**
  1. Update integration/staging-facing Redis container configs to use:
     - `redis-server ... --maxmemory-policy noeviction`
     - Keep or adjust `--maxmemory` values as currently defined; ensure docs call out that `noeviction` trades silent data loss for explicit backpressure/errors.

  2. Add documentation guidance:
     - Explain why BullMQ queues should avoid eviction (eviction can drop jobs/metadata, causing “phantom failures”).
     - Provide a verification snippet: `redis-cli CONFIG GET maxmemory-policy` should return `noeviction`.
     - Clarify which compose file(s) are the recommended baseline for staging/integration.

  3. (Optional but recommended for enforcement) Make `screenshotPipeline.test.ts` assert `maxmemory-policy` is `noeviction` **when the screenshot integration gate is running**.
     - This is specifically for the dedicated integration gate (Task 1 CI job), not for the general unit test suite.

- **verify:**
  - With the relevant docker compose stack running, `redis-cli CONFIG GET maxmemory-policy` returns `noeviction`.
  - The screenshot integration CI job logs (or test assertion) confirm the policy is `noeviction`.

- **done:**
  - Compose defaults used for integration/staging align with `noeviction`.
  - Docs clearly communicate the operational requirement and how to verify it.

## Verification (combined)
1. CI run shows:
   - `test-backend` green (no MinIO dependency)
   - `test-backend-screenshot-integration` (or similarly named job) green, running the screenshot pipeline test with MinIO
2. Local:
   - `npm test -w packages/backend` passes without any AWS S3 env vars.
   - `npm run test:integration:screenshot -w packages/backend` passes when env is set as documented.
3. Redis configs:
   - `maxmemory-policy` is `noeviction` in integration/staging compose files.

## Success Criteria
- The two follow-up items in `.planning/INTEGRATION.md` (“S3 env contract” and “Redis eviction policy”) are closed with deterministic, repeatable verification.
- Scope remains limited to docs/config/tests.
