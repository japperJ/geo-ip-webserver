---
bug_id: BUG-20260217-ci-typecheck-watch-hang
status: archived
created: 2026-02-17T21:00:00Z
updated: 2026-02-17T21:12:00Z
symptoms: CI type-check job hangs at `npx tsc --noEmit -w packages/backend` with "Starting compilation in watch mode..." and never exits
root_cause: `.github/workflows/ci.yml` used `npx tsc --noEmit -w packages/backend` and frontend analog, but `-w` is TypeScript watch mode (long-running) rather than npm workspace targeting, so CI never exits after compilation starts.
fix: Replaced both type-check commands with one-shot project invocations: `npx tsc --noEmit -p packages/backend/tsconfig.json` and `npx tsc --noEmit -p packages/frontend/tsconfig.json`.
---

# Debug: CI TypeScript Typecheck Hangs in Watch Mode

## Symptoms (IMMUTABLE — never edit after initial write)
- CI hangs on `npx tsc --noEmit -w packages/backend`.
- Log shows `Starting compilation in watch mode...` and then waits forever.
- Expected behavior: one-shot backend typecheck that exits in CI.

## Current Focus (OVERWRITE — always shows current state)
**Hypothesis:** Confirmed and fixed; the hang was caused by `tsc` watch mode misuse.
**Testing:** Replaced workflow commands with one-shot `-p` project checks and validated both backend/frontend commands exit with code 0.
**Evidence so far:** Updated workflow plus successful one-shot local runs for both package tsconfig targets.

## Eliminated Hypotheses (APPEND-ONLY)
### Hypothesis 1: CI hangs because backend/frontend have unresolved type errors that keep `tsc` running
- **Test:** Execute one-shot project checks directly:
	- `npx tsc --noEmit -p packages/backend/tsconfig.json`
	- `npx tsc --noEmit -p packages/frontend/tsconfig.json`
- **Result:** Both commands returned exit code 0.
- **Conclusion:** Eliminated — type errors are not causing a non-terminating process.

### Hypothesis 2: Workflow should use `npm run typecheck -w packages/backend` (script-based path)
- **Test:** Inspect `packages/backend/package.json` and `packages/frontend/package.json` scripts.
- **Result:** No `typecheck` script exists in either package.
- **Conclusion:** Eliminated — script-based workspace command is not currently available; project-file invocation is the robust option.

## Evidence Log (APPEND-ONLY)
| # | Observation | Source | Implication |
|---|---|---|---|
| 1 | Type-check job uses `npx tsc --noEmit -w packages/backend` and `npx tsc --noEmit -w packages/frontend`. | `.github/workflows/ci.yml` | `-w` likely causes watch mode and non-exit behavior in CI. |
| 2 | Backend package has no `typecheck` script. | `packages/backend/package.json` | Recommended script-based workspace form is unavailable for backend. |
| 3 | Frontend package has no `typecheck` script. | `packages/frontend/package.json` | Recommended script-based workspace form is unavailable for frontend. |
| 4 | `npx tsc --noEmit -p packages/backend/tsconfig.json` exits with `BACKEND_TSC_EXIT_CODE:0`. | Terminal verification in this session | One-shot backend project check is valid and terminates. |
| 5 | `npx tsc --noEmit -p packages/frontend/tsconfig.json` exits with `FRONTEND_TSC_EXIT_CODE:0`. | Terminal verification in this session | One-shot frontend project check is valid and terminates. |
| 6 | Workflow now uses `-p packages/.../tsconfig.json` for both type-check steps. | `.github/workflows/ci.yml` | CI no longer enters `tsc` watch mode in type-check job. |

## Resolution (OVERWRITE — filled when fixed)
**Root Cause:** Workflow used `tsc -w` with package paths as if `-w` were workspace selection; in TypeScript CLI `-w` means watch mode, resulting in non-terminating CI type-check steps.
**Fix:** Changed type-check step commands to one-shot project checks:
- backend: `npx tsc --noEmit -p packages/backend/tsconfig.json`
- frontend: `npx tsc --noEmit -p packages/frontend/tsconfig.json`
Also updated `.planning/phases/H/VERIFICATION.md` and `.planning/STATE.md` with blocker/fix/verification evidence.
**Verification:**
- `npx tsc --noEmit -p packages/backend/tsconfig.json` → `BACKEND_TSC_EXIT_CODE:0`
- `npx tsc --noEmit -p packages/frontend/tsconfig.json` → `FRONTEND_TSC_EXIT_CODE:0`
- Workflow inspection confirms no remaining `tsc --noEmit -w packages/...` entries in active `.github/workflows/ci.yml`.
**Regression Risk:** Low. Change is isolated to CI type-check invocation flags and preserves project-specific tsconfig usage for both packages.
