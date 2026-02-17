---
bug_id: BUG-20260217-ci-redis-cli-missing
status: archived
created: 2026-02-17T00:00:00Z
updated: 2026-02-17T20:25:00Z
symptoms: CI screenshot integration job fails with `redis-cli: command not found` when enforcing Redis maxmemory policy
root_cause: Workflow step in `.github/workflows/ci.yml` invoked `redis-cli` directly in the runner shell, but GitHub-hosted runner images do not guarantee Redis CLI installation.
fix: Replaced runner shell calls with `docker exec` into `${{ job.services.redis.id }}` (Redis service container), set `maxmemory-policy=noeviction`, read back policy via `CONFIG GET`, and fail the step if value differs.
---

# Debug: CI Redis CLI Not Found in Screenshot Integration Job

## Symptoms (IMMUTABLE — never edit after initial write)
- CI fails in screenshot integration job while running `redis-cli -h localhost -p 6379 CONFIG SET maxmemory-policy noeviction`.
- CI fails again while running `redis-cli -h localhost -p 6379 CONFIG GET maxmemory-policy`.
- Expected behavior: workflow enforces and verifies `maxmemory-policy=noeviction` before screenshot integration test.

## Current Focus (OVERWRITE — always shows current state)
**Hypothesis:** The workflow assumes `redis-cli` is installed on the GitHub-hosted runner, but only the Redis service container guarantees that binary.
**Testing:** Completed. Patched workflow to run Redis CLI in service container and added explicit readback assertion.
**Evidence so far:** `.github/workflows/ci.yml` uses `${{ job.services.redis.id }}` + `docker exec` for both CONFIG SET/GET in the screenshot integration job.

## Eliminated Hypotheses (APPEND-ONLY)
### Hypothesis 1: Redis service is unavailable/unhealthy, causing command lookup-like failure
- **Test:** Review service health checks and failure symptom wording.
- **Result:** Redis service has a healthy check using `redis-cli ping` inside container; reported failure is command lookup on runner shell, not connection refusal.
- **Conclusion:** Eliminated — failure is not Redis availability.

### Hypothesis 2: The best fix is installing `redis-tools` on the runner
- **Test:** Compared install-based approach to container-exec approach against reliability and setup friction criteria.
- **Result:** Install step adds external package-manager dependency and network variance; container-exec reuses existing Redis service image and avoids extra setup.
- **Conclusion:** Eliminated — container-exec is more robust/minimal for GitHub-hosted runners.

## Evidence Log (APPEND-ONLY)
| # | Observation | Source | Implication |
|---|---|---|---|
| 1 | Step `Enforce Redis noeviction policy` runs `redis-cli -h localhost -p 6379 ...` directly from runner shell. | `.github/workflows/ci.yml` | Depends on runner-installed redis-cli binary. |
| 2 | Redis is configured as a service container `redis:7-alpine` in the same job. | `.github/workflows/ci.yml` | We can execute `redis-cli` inside the service container without installing host packages. |
| 3 | Updated step resolves Redis container id via `${{ job.services.redis.id }}` and runs `docker exec ... redis-cli CONFIG SET/GET ...`. | `.github/workflows/ci.yml` | Removes host `redis-cli` dependency and keeps behavior equivalent. |
| 4 | Step now validates policy readback and exits non-zero if value is not `noeviction`. | `.github/workflows/ci.yml` | Preserves enforcement semantics as a hard gate before screenshot integration test. |

## Resolution (OVERWRITE — filled when fixed)
**Root Cause:** CI workflow depended on a runner-level `redis-cli` binary that is not guaranteed on GitHub-hosted images.
**Fix:** Executed Redis CLI operations inside the existing Redis service container using `docker exec "${{ job.services.redis.id }}" ...`, then verified `maxmemory-policy` equals `noeviction` with an explicit shell assertion.
**Verification:**
- Static workflow validation via workspace diagnostics: no YAML/syntax problems in `.github/workflows/ci.yml`.
- Step ordering unchanged: Redis policy enforcement still executes before screenshot integration tests.
- Planning evidence updated in `.planning/phases/H/VERIFICATION.md` and `.planning/STATE.md`.
**Regression Risk:** Low. Change is isolated to one CI step and reuses the existing Redis service container contract.
