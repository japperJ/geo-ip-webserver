---
bug_id: BUG-20260217-test-hang-timeouts
status: archived
created: 2026-02-17T00:00:00Z
updated: 2026-02-17T18:35:00Z
symptoms: Test runs can hang and require manual terminal interruption
root_cause: Frontend workspace default test script used interactive Vitest watch mode and included Playwright E2E specs, leaving the process alive after failures; smoke scripts also lacked explicit request/process timeout guards.
fix: Switched frontend default to non-watch Vitest run with explicit include/exclude and finite timeouts, added explicit Vitest timeout settings, added smoke HTTP request-level abort timeouts and smoke E2E parent timeout/process-tree termination, and documented new timeout behavior.
---

# Debug: Test Runs Hanging Instead of Failing Fast

## Symptoms (IMMUTABLE — never edit after initial write)
- Test runs are hanging and currently require manually breaking terminal execution.
- Expected behavior: tests should fail fast with clear timeout errors instead of running indefinitely.
- Scope includes root, backend, frontend, Vitest, and Playwright test execution configuration.

## Current Focus (OVERWRITE — always shows current state)
**Hypothesis:** Root cause and mitigations validated; finalizing planning artifacts.
**Testing:** Verified workspace tests terminate, smoke HTTP fails fast on timeout, and smoke E2E timeout guard aborts and exits non-zero.
**Evidence so far:** Commands and configs confirm non-hanging defaults with explicit finite timeouts.

## Eliminated Hypotheses (APPEND-ONLY)
### Hypothesis 1: Missing `test` script in `packages/workers` is the primary cause of hangs
- **Test:** Ran workspace test flow and inspected root script behavior.
- **Result:** Missing worker test script caused a fast failure in old setup, not a hang.
- **Conclusion:** Eliminated — reliability issue but not the manual-break hang symptom.

### Hypothesis 2: Playwright lacked timeouts and could run forever by default
- **Test:** Inspected `packages/frontend/playwright.config.ts`.
- **Result:** Config already had finite `timeout`, `globalTimeout`, and web server timeout values.
- **Conclusion:** Eliminated as primary root cause; still tuned to explicit practical value for longer suites.

## Evidence Log (APPEND-ONLY)
| # | Observation | Source | Implication |
|---|---|---|---|
| 1 | `packages/frontend` test script was `vitest` (watch mode), and command remained in `DEV` with `Watching for file changes` after failures. | `packages/frontend/package.json` and terminal run `npm run test -w packages/frontend` | Frontend default test command can hang and require manual interruption. |
| 2 | Frontend Vitest was collecting `e2e/*.spec.ts` Playwright tests and failing with `Playwright Test did not expect test.describe()...` before entering watch state. | Terminal run output for `npm run test -w packages/frontend` | Unit test command was mis-scoped and interactive, amplifying hang-like behavior. |
| 3 | `scripts/smoke/http-smoke.mjs` used `fetch` without abort signals/timeouts. | File inspection | Network stalls could block smoke script indefinitely. |
| 4 | With `SMOKE_HTTP_TIMEOUT_MS=2000` and unreachable backend, smoke HTTP failed in ~2s with explicit timeout error. | Terminal run `$env:BACKEND_BASE_URL='http://10.255.255.1:81'; $env:SMOKE_HTTP_TIMEOUT_MS='2000'; npm run smoke:http` | Request timeout guard works and prevents hangs. |
| 5 | With `SMOKE_E2E_TIMEOUT_MS=1`, smoke E2E aborted immediately and exited code 1. | Terminal run `$env:SMOKE_E2E_TIMEOUT_MS='1'; npm run smoke:e2e` | Parent process timeout guard works for stuck/long browser runs. |
| 6 | `npm run test` now exits cleanly across workspaces (`--if-present`) and frontend test exits immediately with code 0 when no unit tests exist. | Terminal run `npm run test` | Workspace test no longer hangs and has stable default ergonomics. |

## Resolution (OVERWRITE — filled when fixed)
**Root Cause:** Interactive watch-mode frontend test default (`vitest`) combined with Playwright E2E files being picked up by Vitest caused non-terminating local test runs after failures; additional missing timeout guards in smoke scripts could also block indefinitely on network/process issues.
**Fix:**
- Frontend: `test` -> `vitest run --config vitest.config.ts`; added `test:watch` for explicit watch ergonomics.
- Added `packages/frontend/vitest.config.ts` with scoped include (`src/**/*.{test,spec}.{ts,tsx}`), E2E exclusions, and finite timeout settings.
- Backend Vitest config now includes explicit `testTimeout/hookTimeout/teardownTimeout`.
- Playwright `globalTimeout` set to `600000` (explicit finite long-run cap).
- Smoke scripts: added `SMOKE_HTTP_TIMEOUT_MS` request aborts and `SMOKE_E2E_TIMEOUT_MS` parent timeout/process-tree termination.
- Root `npm run test` now uses `--if-present` for workspaces.
**Verification:**
- `npm run test -w packages/frontend` exits non-watch (code 0, no tests found).
- `npm test -w packages/backend` passes (`70 passed, 1 skipped`) with finite timeout config.
- `npm run test` exits and completes both backend/frontend without hanging.
- `SMOKE_HTTP_TIMEOUT_MS=2000` unreachable backend fails fast with timeout.
- `SMOKE_E2E_TIMEOUT_MS=1` fails fast, proving e2e guard path.
- `npm run smoke:e2e` normal path still passes (`3 passed`).
**Regression Risk:** Low to medium. Main behavior change is frontend unit-test scope now excludes `e2e/**`; teams expecting E2E to run via Vitest must use Playwright commands explicitly.
