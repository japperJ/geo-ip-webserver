---
phase: H
plan: 0
type: release-readiness
wave: 1
depends_on:
  - "Phase G PASS (npm run smoke is the default gate); see .planning/phases/G/VERIFICATION.md"
files_modified:
  - .planning/phases/H/PLAN.md
  - .planning/phases/H/VERIFICATION.md
  - .planning/STATE.md
autonomous: true
must_haves:
  observable_truths:
    - "A human can merge phase-1 -> main with a deterministic checklist and no guesswork."
    - "CI expectations are explicit (which checks must pass, and why)."
    - "A release tag + release notes template are prepared and consistent with current repo versioning."
    - "Rollback procedure is documented (code + DB considerations) with minimal operational risk."
    - "Production smoke commands are documented using the existing Phase G smoke harness (BACKEND_BASE_URL/PROXY_BASE_URL) and basic curl gates."
  artifacts:
    - path: .planning/phases/H/PLAN.md
      has:
        - "Single-session actionable tasks"
        - "Merge checklist (phase-1 -> main)"
        - "CI gate expectations derived from .github/workflows/ci.yml"
    - path: .planning/phases/H/VERIFICATION.md
      has:
        - "Release-readiness verification gates with fill-in evidence"
        - "Post-merge and post-deploy smoke commands"
  key_links:
    - from: ".planning/INTEGRATION.md"
      to: ".planning/phases/H/VERIFICATION.md"
      verify: "Phase H gates explicitly reuse the proven A–G smoke + integration posture (especially npm run smoke and the screenshot integration CI job)."
    - from: ".github/workflows/ci.yml"
      to: ".planning/phases/H/PLAN.md"
      verify: "Phase H documents the CI jobs that must be green before merge/tag."
    - from: "scripts/smoke/http-smoke.mjs"
      to: ".planning/phases/H/PLAN.md + VERIFICATION.md"
      verify: "Phase H uses BACKEND_BASE_URL/PROXY_BASE_URL (and SMOKE_AUTH_* overrides) for production smoke guidance."
---

# Phase H: Release Readiness (docs + checklists + verification gates only)

## Objective
Turn the already-verified A–G baseline into a **repeatable release process**.

Phase H is intentionally *non-feature* work:
- No new product capabilities.
- No migrations or behavior changes.
- Only: documentation, checklists, and deterministic verification gates for merging and releasing.

## Scope boundaries

### In scope
- Branch diff sanity checklist (what to review before merge).
- CI gate expectations (what must be green; which jobs exist).
- Merge checklist for **phase-1 → main**.
- Tag + release notes prep (template, what evidence to attach).
- Rollback notes (what to do if deploy/merge goes sideways).
- Production smoke commands (post-deploy health/docs/auth sanity) using existing Phase G harness and simple curl checks.

### Out of scope
- Any new API endpoints, UI screens, or access-control logic.
- Refactors.
- New infrastructure.

## Tasks (single-session, actionable)

### Task H1: Branch diff sanity + CI gate expectations
- **files:** `.planning/phases/H/PLAN.md` (this doc), `.planning/phases/H/VERIFICATION.md`
- **action (WHAT):**
  1. Define a short, deterministic “diff sanity” routine for `phase-1` vs `main`.
  2. Document CI expectations based on `.github/workflows/ci.yml`.
- **verify:**
  - Diff sanity can be executed in <15 minutes and produces either “proceed” or “blockers list”.
  - CI expectations list matches the jobs in `.github/workflows/ci.yml`.
- **done:**
  - Release manager has an explicit checklist for what to review and which CI checks must pass.

**Diff sanity steps (human-run):**
1. Repo clean state:
   - `git status` shows no local changes.
2. Update refs:
   - `git fetch --all --prune`
3. Ensure branches exist and compare:
   - `git branch -a | findstr /i "phase-1 main"` (Windows)
   - `git diff --stat main...phase-1`
   - `git diff main...phase-1` (spot-check high-risk files: auth, middleware, migrations, infra)
4. Confirm commit intent is consistent:
   - `git log --oneline --decorate --graph --max-count=50 main..phase-1`
5. Confirm Phase G gate still holds locally (pre-merge):
   - `npm run smoke`

**CI gate expectations (derived from `.github/workflows/ci.yml`):**
- Triggers on PRs and pushes to `main` and `develop`.
- Jobs present:
  - `lint` (backend + frontend)
  - `test-backend` (Postgres + Redis service containers)
  - `test-backend-screenshot-integration` (Postgres + Redis + MinIO + Redis noeviction enforcement)
  - `test-frontend`
  - `build` (depends on lint + tests)
  - `type-check` (runs backend/frontend `tsc --noEmit`)

**Expectation:** before merge, all checks should be green; if repo settings mark only some as “required”, treat the rest as *soft required* unless explicitly waived.

---

### Task H2: Merge checklist (phase-1 → main)
- **files:** `.planning/phases/H/VERIFICATION.md`
- **action (WHAT):** Define the merge checklist and “no-go” conditions.
- **verify:** Checklist is executable by a single person without repo tribal knowledge.
- **done:** A PR can be merged with predictable outcomes.

**Merge checklist (human-run):**
1. Create PR: `phase-1` → `main`.
2. Confirm CI is green for the PR head SHA:
   - `lint`, `test-backend`, `test-backend-screenshot-integration`, `test-frontend`, `build`, `type-check`.
3. Local gates (run on the PR head SHA):
   - `npm run lint`
   - `npm run test`
   - `npm run build`
   - `npm run smoke`
4. Confirm no migration surprises:
   - No new migrations added OR migrations are forward-only and deployable.
   - (If any migration exists) confirm backup/rollback plan notes are filled in VERIFICATION.
5. Confirm docs don’t contradict Phase G entrypoints:
   - `.planning/ENTRYPOINTS.md`, `README.md`, `DEPLOYMENT.md`, `PRODUCTION.md` align.
6. Merge strategy:
   - Prefer a merge method consistent with repo norms (merge commit vs squash). Document what was used in VERIFICATION.

**No-go conditions (block merge):**
- CI red on any test/build job.
- `npm run smoke` fails in the canonical docker mode.
- Release notes/rollback placeholders remain unfilled.

---

### Task H3: Tag + release notes + rollback + production smoke commands
- **files:** `.planning/phases/H/VERIFICATION.md`
- **action (WHAT):**
  1. Prepare a release tag naming decision and release-notes template.
  2. Document rollback notes (code + data).
  3. Document production smoke commands (post-deploy) using Phase G harness and curl.
- **verify:** A person can follow the doc to validate a deployment and to roll back.
- **done:** Release artifacts are ready to be applied the moment Phase H verification is complete.

**Tag + release notes prep (template):**
- Tag name (choose one; record decision in VERIFICATION):
  - Option A: `v1.0.0` (aligns with root `package.json` version)
  - Option B: `v1.0.0-alpha` (aligns with `.planning/STATE.md` narrative)
- Release notes should include:
  - What’s included: Phase A–G completion summary + “default smoke gate: npm run smoke”.
  - Ops note: screenshot integration has a dedicated CI job with MinIO + strict env.
  - Known limitations: any explicitly out-of-scope items from the roadmap.
  - Verification evidence links: `.planning/INTEGRATION.md`, `.planning/phases/G/VERIFICATION.md`, Phase H verification checklist.

**Rollback notes (high level; fill evidence in VERIFICATION):**
- Code rollback: redeploy previous tag/commit and restart services.
- Data rollback:
  - If there were **no migrations** since last release, rollback is code-only.
  - If there **were migrations**, rollback must consider DB restore from backup; document the chosen approach.

**Production smoke commands (post-deploy):**
- Minimal curl gates (from any operator machine):
  - `curl -f https://<yourdomain>/health`
  - `curl -f https://<yourdomain>/ready` (if enabled)
  - `curl -f https://<yourdomain>/documentation`
  - `curl -f https://<yourdomain>/documentation/json`
- Phase G HTTP smoke harness can be reused against production/staging by overriding env:
  - `BACKEND_BASE_URL=https://<yourdomain> npm run smoke:http`
  - Optional proxy parity check:
    - `PROXY_BASE_URL=https://<yourdomain> BACKEND_BASE_URL=https://<yourdomain> npm run smoke:http`
  - If production blocks public self-registration, provide dedicated smoke credentials:
    - `SMOKE_AUTH_EMAIL=... SMOKE_AUTH_PASSWORD=... BACKEND_BASE_URL=... npm run smoke:http`

> Note: `scripts/smoke/http-smoke.mjs` attempts `POST /api/auth/register`. If production policy disallows register, run smoke against a controlled admin endpoint (staging) or provide a pre-provisioned test user and adjust expectations in the Phase H verification record.
