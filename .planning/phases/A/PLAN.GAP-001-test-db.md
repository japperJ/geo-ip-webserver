---
phase: A
plan: gap-001
type: fix
wave: 1
autonomous: true
depends_on: []
files_modified:
  - packages/backend/src/tests/setup.ts
  - packages/backend/src/tests/ensureTestDatabase.ts
notes:
  - "Goal: close GAP-001 only (test database setup). Avoid unrelated refactors."
  - "Backend is ESM; keep import specifiers consistent with repo convention (.js extensions in TS imports where applicable)."
  - "If you encounter DB permission issues (CREATE DATABASE / CREATE EXTENSION), stop and request a human action checkpoint."
must_haves:
  observable_truths:
    - "Running `npm test -w packages/backend` passes, including service tests that touch `sites` and `access_logs`."
    - "Service tests do not fail with `relation \"sites\" does not exist`."
    - "Test DB schema is created automatically (no manual psql steps required)."
  artifacts:
    - path: packages/backend/src/tests/ensureTestDatabase.ts
      has:
        - "bootstrap function that ensures test DB exists and has tables"
        - "safe/idempotent behavior when schema already exists"
    - path: packages/backend/src/tests/setup.ts
      has:
        - "beforeAll calls schema bootstrap BEFORE any cleanup queries"
  key_links:
    - from: "Vitest run (service tests import testPool from src/tests/setup)"
      to: "ensureTestDatabase() runs before any DELETE/TRUNCATE or service queries"
      verify: "Tests pass from clean checkout with only docker postgres running"
---

# Phase A, Gap Fix Plan (GAP-001): Test Database Setup

## Objective
Unblock backend **service tests** by making the test database self-initializing: the test DB must **exist** and must have the required tables (`sites`, `access_logs`, auth tables, etc.) before tests run. The end state is that `npm test -w packages/backend` passes locally and in CI without manual DB prep.

## Context (what we know)
- Service tests use `testPool` from `packages/backend/src/tests/setup.ts` and currently fail with: `relation "sites" does not exist`.
- The test DB connection defaults in `setup.ts`:
  - host `localhost`, port `5434`, database `geo_ip_webserver_test`, user `dev_user`, password `dev_password`.
- Docker dev postgres creates only `geo_ip_webserver` by default (`docker-compose.dev.yml`), so the test DB may be missing and/or un-migrated.
- SQL migrations exist under `packages/backend/migrations/*.sql` and should be applied in timestamp order.

## Tasks

### Task 1: Add a test DB bootstrap helper
- **files:**
  - `packages/backend/src/tests/ensureTestDatabase.ts` (new)
- **action (WHAT):**
  - Implement a helper that, when called, guarantees:
    1. The **test database exists** (create it if missing).
    2. Required **extensions** exist (at minimum: `postgis`, `uuid-ossp`, and `pgcrypto` for `gen_random_uuid()` used in migrations).
    3. Required **tables/functions/views** exist by applying the SQL migrations in `packages/backend/migrations/` in filename sort order.
  - The helper must be safe to run on every test invocation:
    - If the schema is already present, it should do **no work** (or only lightweight checks).
    - It must not fail due to “already exists” errors.

- **verify:**
  - Run `npm test -w packages/backend` and confirm the previous error (`relation "sites" does not exist`) is gone.
  - Run the same command **twice** to confirm idempotency (second run should not fail with “already exists” migration errors).

- **done:**
  - A single call `await ensureTestDatabase()` is sufficient to make schema present before any service test DB usage.

### Task 2: Wire bootstrap into Vitest test lifecycle
- **files:**
  - `packages/backend/src/tests/setup.ts`
- **action (WHAT):**
  - Update the existing `beforeAll` so it:
    1. Calls the new bootstrap helper **first**.
    2. Only then performs any cleanup query (`DELETE FROM access_logs`, etc.).
  - Ensure the cleanup step doesn’t crash on first run (i.e., it should only run after schema is present).

- **verify:**
  - `npm test -w packages/backend` passes.

- **done:**
  - Service tests that do `DELETE FROM sites` / `DELETE FROM access_logs` succeed because the tables exist.

### Task 3 (checkpoint:human-action if needed): Handle DB permissions or environment mismatch
- **files:** none
- **action (WHAT):**
  - If the bootstrap fails due to permissions (e.g., cannot `CREATE DATABASE` or `CREATE EXTENSION`), stop and request human action:
    - Confirm docker dev postgres is running.
    - Confirm the test user has privileges (in the dev container it typically does, but do not assume).
    - If needed, adjust env vars so tests target the correct postgres instance.

- **verify:**
  - After permissions are resolved, rerun `npm test -w packages/backend`.

- **done:**
  - Bootstrap completes successfully and tests pass.

## Implementation notes (constraints / guardrails)
- Keep scope strictly to test DB setup. Do not refactor services/middleware.
- Prefer a minimal “schema existence check” (e.g., `to_regclass('public.sites')`) to decide whether migrations must run.
- Migrations are `.sql` files in-repo; apply them directly in the bootstrap rather than relying on `node-pg-migrate` configuration (which may not be set up to run `.sql`).
- Make bootstrap resilient:
  - Apply migrations in a deterministic order (sort by filename).
  - If you track applied migrations, use a dedicated table (e.g., `schema_migrations`) **inside the test DB**.

## Verification (end-to-end)
1. Ensure postgres is reachable at the test connection settings (defaults match docker dev: port 5434, user dev_user/dev_password).
2. Run `npm test -w packages/backend`.
3. Confirm:
   - All utility tests pass (already passing).
   - All service tests pass (previously blocked).

## Success criteria
- GAP-001 is closed: backend service tests run against a prepared test database and `npm test -w packages/backend` is green.
