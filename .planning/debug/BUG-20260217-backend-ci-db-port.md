---
bug_id: BUG-20260217-backend-ci-db-port
status: archived
created: 2026-02-17T00:00:00Z
updated: 2026-02-17T19:55:00Z
symptoms: Backend tests fail in CI with ECONNREFUSED to localhost:5434 during global setup despite DATABASE_URL targeting localhost:5432
root_cause: Test bootstrap code in `src/tests/ensureTestDatabase.ts` and `src/tests/setup.ts` reads only `TEST_DATABASE_*` env vars and falls back to hardcoded local defaults (including port 5434), never parsing `DATABASE_URL`; CI backend-test job sets `DATABASE_URL` but not `TEST_DATABASE_PORT`, so bootstrap attempts localhost:5434 and fails.
fix: Added shared test DB config resolver with precedence `DATABASE_URL` > `TEST_DATABASE_*` > defaults, wired both `ensureTestDatabase.ts` and `setup.ts` to use it, and added focused unit tests to lock precedence behavior.
---

# Debug: Backend CI Test Bootstrap Uses Wrong DB Port

## Symptoms (IMMUTABLE — never edit after initial write)
- CI run of `npm run test -w packages/backend` fails during backend test global setup with `ECONNREFUSED` to `localhost:5434`.
- CI environment includes `DATABASE_URL=...localhost:5432/geo_ip_webserver_test`.
- Expected behavior: test DB bootstrap should honor CI DB config (port 5432) instead of forcing local dev port 5434.

## Current Focus (OVERWRITE — always shows current state)
**Hypothesis:** Confirmed and fixed; validating no regressions.
**Testing:** Ran focused parser tests and full backend suite after wiring new resolver in bootstrap and test pool setup.
**Evidence so far:** New test suite passes and full backend tests pass (`74 passed, 1 skipped`).

## Eliminated Hypotheses (APPEND-ONLY)
### Hypothesis 1: CI backend test job does not pass database connection env to test process
- **Test:** Inspected `.github/workflows/ci.yml` for `test-backend` step env.
- **Result:** `DATABASE_URL` is explicitly provided as `postgresql://test_user:test_password@localhost:5432/geo_ip_webserver_test`.
- **Conclusion:** Eliminated — env is provided by CI.

### Hypothesis 2: Global setup path bypasses CI env and constructs DB config from local defaults
- **Test:** Inspected `packages/backend/vitest.config.ts`, `src/tests/globalSetup.ts`, `src/tests/ensureTestDatabase.ts`, and `src/tests/setup.ts`.
- **Result:** Global setup calls `ensureTestDatabase()`, which uses only `TEST_DATABASE_*` and defaults to `5434`; `setup.ts` pool uses same pattern.
- **Conclusion:** Supported as root cause.

## Evidence Log (APPEND-ONLY)
| # | Observation | Source | Implication |
|---|---|---|---|
| 1 | CI backend test job sets `DATABASE_URL=postgresql://test_user:test_password@localhost:5432/geo_ip_webserver_test` and runs `npm run test -w packages/backend`. | `.github/workflows/ci.yml` | Test process receives DB URL with CI port 5432. |
| 2 | Backend Vitest runs `globalSetup: ['./src/tests/globalSetup.ts']`. | `packages/backend/vitest.config.ts` | DB bootstrap executes before tests and controls initial connection. |
| 3 | `globalSetup.ts` calls `ensureTestDatabase()` with no args/env transform. | `packages/backend/src/tests/globalSetup.ts` | Bootstrap behavior fully depends on `ensureTestDatabase.ts` env parsing. |
| 4 | `ensureTestDatabase.ts` config reads `TEST_DATABASE_*` only and defaults port to `5434`. | `packages/backend/src/tests/ensureTestDatabase.ts` | When `TEST_DATABASE_PORT` is absent (CI backend test job), bootstrap targets wrong local-dev port. |
| 5 | `setup.ts` test pool reads `TEST_DATABASE_*` only and defaults port `5434`. | `packages/backend/src/tests/setup.ts` | Even after bootstrap, tests can still use wrong port without explicit TEST vars. |
| 6 | New resolver applies precedence `DATABASE_URL` > `TEST_DATABASE_*` > defaults and is used by both bootstrap and test pool. | `packages/backend/src/tests/testDatabaseConfig.ts`, `src/tests/ensureTestDatabase.ts`, `src/tests/setup.ts` | CI `DATABASE_URL` now drives port (5432) while local fallback remains 5434. |
| 7 | Focused test file validates precedence and fallback behavior in 4 cases. | `npm run test -w packages/backend -- src/tests/testDatabaseConfig.test.ts` | Parsing behavior is covered and reproducible. |
| 8 | Full backend test suite passes after changes. | `npm run test -w packages/backend` | No functional regressions introduced by config-resolution refactor. |

## Resolution (OVERWRITE — filled when fixed)
**Root Cause:** Test bootstrap code ignored `DATABASE_URL` entirely and defaulted to `TEST_DATABASE_PORT || 5434`, so CI (which sets `DATABASE_URL` with port 5432) still attempted localhost:5434 and failed.
**Fix:** Introduced `resolveTestDatabaseConfig()` (`src/tests/testDatabaseConfig.ts`) and switched both `ensureTestDatabase.ts` and `setup.ts` to consume it. Resolver precedence is: `DATABASE_URL` first, then explicit `TEST_DATABASE_*`, then local defaults (`localhost:5434`, `geo_ip_webserver_test`, `dev_user`, `dev_password`). Added `src/tests/testDatabaseConfig.test.ts` with 4 assertions for precedence/fallback/invalid URL behavior.
**Verification:**
- `npm run test -w packages/backend -- src/tests/testDatabaseConfig.test.ts` ✅ (4/4 passed)
- `npm run test -w packages/backend` ✅ (`74 passed, 1 skipped`)
**Regression Risk:** Low. Change is scoped to test-only DB configuration resolution and maintains existing local defaults while honoring CI URL input.
