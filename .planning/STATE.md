# Project State Tracker: Geo-IP Webserver

**Project Name:** Geo-Fenced Multi-Site Webserver  
**Version:** 1.0.0-alpha  
**Last Updated:** 2026-02-17  
**Current Phase:** Phase H - Release Readiness (Re-Verified; Gaps Found)  
**Project Status:** 🟡 all local gates (`lint`, `test`, `build`, `smoke`) pass on fresh re-run; release remains blocked by human PR/CI/merge evidence prerequisites

---

## Quick Stats

| Metric | Value |
|---|---|
| **Active Roadmap** | `.planning/PORT_FEATURES_ROADMAP.md` (A-F) |
| **Completed Improvement Phases** | 6/6 (A-F complete) |
| **Current Focus** | Close remaining Phase H blockers: CI/PR merge evidence capture |
| **Blocked Tasks** | 2 (branch/merge evidence gate, CI evidence gate) |
| **Immediate Exit Criterion** | Phase H final PASS in `.planning/phases/H/VERIFICATION.md` (all merge/release gates green) |

---

## A-F Improvement Plan Status

| Phase | Name | Status | Evidence |
|---|---|---|---|
| **A** | Critical Bug Fixes | 🟢 Complete | `.planning/phases/A/SUMMARY.md` |
| **B** | Content Management | 🟢 Complete | `.planning/phases/B/SUMMARY.md` |
| **C** | Missing Frontend Pages | 🟢 Complete | `.planning/phases/C/SUMMARY.md` |
| **D** | Screenshot Worker (BullMQ async) | 🟢 Complete | `.planning/phases/D/SUMMARY.md` |
| **E** | Audit Log CSV Export | 🟢 Complete | `.planning/phases/E/SUMMARY.md` |
| **F** | Documentation Sync | 🟢 Complete | DOC-001 + DOC-002 delivered and verified |

**Phase F gate:** Swagger/OpenAPI documentation must be reachable at `/documentation` with working spec endpoints (`/documentation/json`, `/documentation/yaml`).

---

## Post-F Increment Status

| Phase | Name | Status | Evidence |
|---|---|---|---|
| **G** | Operational Smoke Suite + Environment Parity | 🟢 Complete | `.planning/phases/G/SUMMARY.md`, `.planning/phases/G/VERIFICATION.md` |
| **H** | Release Readiness (docs + gates only) | 🟡 Executed / Blocked | `.planning/phases/H/PLAN.md`, `.planning/phases/H/VERIFICATION.md`, `.planning/phases/H/SUMMARY.md` |

### 2026-02-17 re-verification snapshot (Phase H)

- **Gate A (branch diff sanity):** ❌ FAIL
	- `phase-1` vs `main` diff is small, but `git status --short` shows dirty workspace; merge sanity precondition not met.
- **Gate B (local gates):** ✅ PASS
	- Fresh reruns in this session:
		- `npm run lint` ✅ (`EXIT_CODE:0`; backend warnings only)
		- `npm run test` ✅ (`70 passed, 1 skipped` backend; frontend exits 0)
		- `npm run build` ✅
		- `npm run smoke` ✅ (HTTP smoke + Playwright smoke `3 passed`)
- **Gate C (CI checks evidence):** ❌ FAIL
	- Expected jobs confirmed from `.github/workflows/ci.yml`, but no PR/CI run URL evidence attached for `phase-1` head SHA.
- **Gate D (merge prerequisites):** ❌ FAIL
	- No approval/merge method/merge SHA/post-merge smoke evidence captured.
- **Gates E/F/G (tag+notes, rollback, production smoke procedure):** ✅ PASS (documentation readiness)

---

## Canonical smoke verification (Phase G)

- **Single command:** `npm run smoke`
- **Canonical entrypoints:** `.planning/ENTRYPOINTS.md`
	- Docker proxy: `http://localhost:8080`
	- Docker direct backend: `http://localhost:3001`
	- Dev frontend/backend: `http://localhost:5173` / `http://localhost:3000`
- **Verification evidence:** `.planning/phases/G/VERIFICATION.md`

---

## Phase F Completion Notes

### F-1 (DOC-001): STATE accuracy and consistency ✅
- Removed contradictory legacy 0-5/145-task progress claims from this tracker.
- Kept one authoritative phase model (A-F improvement roadmap).
- Aligned status, quick stats, and next-step guidance.

### F-2 (DOC-002): Swagger/OpenAPI availability ✅
- Added `@fastify/swagger` and `@fastify/swagger-ui` in backend dependencies.
- Registered Swagger + Swagger UI in backend startup with Zod transform integration.
- Bypassed docs routes from site resolution and IP/GPS access-control hooks.
- Applied Helmet CSP compatibility for Swagger UI.

---

## Recent Completion Log

- **2026-02-16:** Phase E complete — site-scoped RBAC CSV export for access logs implemented and verified.
- **2026-02-16:** Phase D complete — screenshot queue worker pipeline and access-log screenshot viewer implemented and verified.
- **2026-02-15:** Phase C complete — register/users/site-users frontend and backend flows implemented.
- **2026-02-15:** Phase B complete — content management backend + frontend delivered.
- **2026-02-15:** Phase A complete — critical correctness/security fixes delivered.

---

## Precise release blockers (current)

1. **Branch/merge workflow evidence incomplete (`phase-1 -> main`)**
	- Dirty working tree (`git status --short`) prevents strict merge sanity validation.
	- Missing merge evidence: approval state, merge method, merge commit SHA, post-merge smoke on `main`.
2. **CI evidence missing for PR head SHA**
	- No captured PR URL / CI run URL proving required checks green (`lint`, tests, build, type-check).

## Next Step

Improvement roadmap A-G is complete; Phase H remains blocked. Immediate actions:
1. Complete PR `phase-1 -> main`, capture CI run URL(s), approval + merge method, merge SHA, and post-merge smoke evidence.
2. Attach PR/CI evidence to `.planning/phases/H/VERIFICATION.md` and move final gate verdict to PASS when all merge gates are green.

### Handoff checklist (user-facing)

Runbook with copy-paste Windows commands: `.planning/phases/H/HANDOFF.md`

- [ ] Ensure clean working tree before merge decision (`git status --short` empty).
- [ ] Open/confirm PR `phase-1 -> main` and record PR URL.
- [ ] Capture CI run URL(s) showing required checks green for PR head SHA.
- [ ] Merge PR and record approval evidence, merge method, and merge SHA.
- [ ] Run post-merge `npm run smoke` on `main` and paste summary into `.planning/phases/H/VERIFICATION.md`.

### 2026-02-17 update — lint-gap closure

- Executed `.planning/phases/H/PLAN-LINT-GAPS.md` end-to-end.
- Root `npm run lint` now passes locally on Windows after:
  - frontend flat-config CLI fix,
  - root workspace lint `--if-present` adjustment,
  - backend lint policy + structural error cleanup to reach 0 lint errors.

### 2026-02-17 update — test hang reliability

- Resolved test-run hang behavior by switching frontend default test command to non-watch mode and scoping Vitest away from Playwright E2E files.
- Added explicit finite timeouts for backend/frontend Vitest, Playwright global suite runtime, and smoke harness HTTP/E2E guardrails.
- Verified `npm run test` now exits cleanly in this workspace without manual interruption.

### 2026-02-17 update — backend CI DB bootstrap port blocker fixed

- Closed CI blocker where backend test global setup attempted `localhost:5434` despite CI `DATABASE_URL` using `localhost:5432`.
- Root cause was test-only config resolution in `packages/backend/src/tests/ensureTestDatabase.ts` and `packages/backend/src/tests/setup.ts` ignoring `DATABASE_URL` and defaulting to `TEST_DATABASE_PORT || 5434`.
- Implemented shared resolver `packages/backend/src/tests/testDatabaseConfig.ts` with precedence:
	1. `DATABASE_URL`
	2. `TEST_DATABASE_*`
	3. local defaults (5434/dev credentials/test DB name)
- Added focused tests in `packages/backend/src/tests/testDatabaseConfig.test.ts` to lock precedence behavior.
- Validation:
	- `npm run test -w packages/backend -- src/tests/testDatabaseConfig.test.ts` ✅ (4 passed)
	- `npm run test -w packages/backend` ✅ (74 passed, 1 skipped)

### 2026-02-17 update — screenshot integration CI `redis-cli` blocker fixed

- Closed CI blocker where screenshot integration job failed with `redis-cli: command not found` while enforcing Redis `maxmemory-policy`.
- Root cause was runner-level dependency on `redis-cli` in `.github/workflows/ci.yml`; GitHub-hosted runners do not guarantee Redis CLI availability.
- Updated workflow step to execute Redis config commands inside the existing Redis service container via `${{ job.services.redis.id }}` and `docker exec`.
- Behavior parity preserved:
	- set `maxmemory-policy` to `noeviction`,
	- read back `CONFIG GET maxmemory-policy`,
	- hard-fail the step if value is not `noeviction`.
- Outcome: screenshot integration precondition is now enforced without adding package-install steps on runners.

### 2026-02-17 update — CI type-check hang fixed (`tsc -w` -> one-shot project checks)

- Closed CI blocker where `TypeScript Type Check` could hang after logging `Starting compilation in watch mode...`.
- Root cause: `.github/workflows/ci.yml` used `npx tsc --noEmit -w packages/backend` and frontend analog; in `tsc`, `-w` enables watch mode and does not target npm workspaces.
- Updated workflow commands to robust monorepo-safe one-shot checks:
	- backend: `npx tsc --noEmit -p packages/backend/tsconfig.json`
	- frontend: `npx tsc --noEmit -p packages/frontend/tsconfig.json`
- Verification in this session:
	- `npx tsc --noEmit -p packages/backend/tsconfig.json` ✅ (`BACKEND_TSC_EXIT_CODE:0`)
	- `npx tsc --noEmit -p packages/frontend/tsconfig.json` ✅ (`FRONTEND_TSC_EXIT_CODE:0`)
- Outcome: type-check steps now terminate deterministically in CI and no longer enter long-running watch mode.

---

## References

- Improvement roadmap: `.planning/PORT_FEATURES_ROADMAP.md`
- Phase plans and summaries: `.planning/phases/`
- Current execution plan: `.planning/phases/H/PLAN.md`
- Post-F next-step definition: `.planning/NEXT_STEPS.md`

**Last Updated By:** Copilot (Phase H re-verification completed; blockers refreshed with exact gate evidence)
