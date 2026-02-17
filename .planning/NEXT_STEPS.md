# Next Steps Proposal (Post Phase F)

**Last Updated:** 2026-02-17  
**Context sources:**
- `.planning/STATE.md` (A–F complete; next roadmap selection)  
- `.planning/PORT_FEATURES_ROADMAP.md` (A–F scope + explicit exclusions)  
- `.planning/INTEGRATION.md` (cross-phase wiring PASS; docs reachable on direct backend + proxy)  
- `.planning/phases/F/SUMMARY.md`, `.planning/phases/F/VERIFICATION.md` (Phase F PASS; swagger/STATE consistency gates met)

## Current baseline (what’s true right now)

- Improvement roadmap **A–F is complete** and verified (`STATE.md`, `phases/F/VERIFICATION.md`).
- Cross-phase wiring across A–F is **PASSED** and considered **GO** (`INTEGRATION.md`).
- Swagger UI and spec endpoints are confirmed reachable on:
  - direct backend entrypoint (`:3001`), and
  - proxy entrypoint (`:8080`) (`phases/F/VERIFICATION.md`).

This means the product is **functionally integrated**; the most valuable next increment is now about **operational reliability + repeatable verification**, unless you want to intentionally expand product scope.

---

## Candidate next increments (pick 1)

### Option 1 (recommended): Phase G — Operational “release-quality” smoke suite + environment parity

**Objective**
Make “it works” *repeatable* by codifying a single, minimal acceptance/smoke suite that validates the critical user-visible flows and critical ops endpoints across the expected entrypoints.

**Why now**
- A–F is complete and integration passed; the main remaining risk is **runtime drift** / environment mismatch (Phase F explicitly encountered this class of issue, even though it is now resolved on `:3001` and `:8080`).
- Codifying smoke checks prevents regressions and reduces future planning churn.

**Scope boundaries**
- In-scope:
  - Add/standardize a small set of **automated smoke checks** (backend HTTP checks + a minimal Playwright sanity pass).
  - Clarify and enforce **canonical dev/proxy entrypoints** (documented and tested).
  - Tighten documentation around “what port serves what” in dev/prod, and what is considered the supported entrypoint.
- Out-of-scope:
  - No new product features.
  - No new RBAC roles or policy model changes.
  - No refactors unrelated to making verification repeatable.

**Success criteria (observable truths)**
1. A single “smoke” command (or script) exists and can be run after startup.
2. Smoke checks verify (at minimum):
   - `/health` returns 200 on the canonical backend entrypoint.
   - `/documentation` and `/documentation/json` return 200 on the canonical entrypoint(s).
   - One authenticated admin flow works (login/refresh/me) sufficiently to reach a protected API.
3. Smoke checks are documented and used as the **default verification** for future phases.

**Risks**
- Port/entrypoint variability across Windows + Docker/WSL may cause false failures unless the definition of “canonical entrypoint(s)” is explicit.
- E2E checks can be flaky if they attempt to cover too much (keep this intentionally small).

**Rough effort**
- **1–3 days** (single dev), assuming we keep it to true smoke-level checks.

---

### Option 2: Phase G — GeoIP/VPN detection lifecycle hardening (MaxMind DB freshness + reload)

**Objective**
Prevent accuracy drift and operational surprises by ensuring MaxMind databases are kept fresh and the backend can safely reload them without restarts.

**Why now**
- The system’s core promise depends on GeoIP data quality; stale MMDBs degrade correctness over time.
- This is a high-leverage ops improvement that reduces long-term support burden.

**Scope boundaries**
- In-scope:
  - Define “DB freshness” requirements (e.g., warn at 14 days).
  - Add metrics/log warnings for DB age.
  - (Optional) implement hot-reload on file change.
  - Document update procedure for dev/staging/prod.
- Out-of-scope:
  - No new commercial data sources or paid proxy detection services.
  - No changes to the access-control policy model.

**Success criteria**
1. Service reports GeoIP DB age (metric + log) and clearly warns when stale.
2. Updating the MMDB file(s) results in the backend using the new data (either via restart procedure or hot reload, whichever is chosen).

**Risks**
- Hot reload is easy to get subtly wrong (in-flight requests, reader lifetime).
- Requires clarity around where MMDBs are mounted in each deployment mode.

**Rough effort**
- **2–5 days**.

---

### Option 3: Phase G — Security hardening beyond A–F (CSRF/rate-limit/auth endpoints)

**Objective**
Add extra defense-in-depth controls around admin/session endpoints (especially if cookies are used), focusing on CSRF and rate limiting.

**Why now**
- This becomes more valuable once there is real admin usage and exposure to the public internet.
- It reduces the blast radius of credential stuffing and browser-based cross-site attacks.

**Scope boundaries**
- In-scope:
  - Add explicit rate limiting for auth endpoints and admin APIs.
  - Add CSRF protection *if* cookie-based auth endpoints are used cross-site.
  - Add/extend tests verifying protections.
- Out-of-scope:
  - Cookie banner, email verification, and other previously excluded items remain excluded unless explicitly re-approved (see exclusions in `PORT_FEATURES_ROADMAP.md`).

**Success criteria**
1. Auth endpoints enforce rate limits (documented thresholds).
2. CSRF protections exist and are validated by tests (if enabled).

**Risks**
- Easy to break login/refresh flows if CSRF is implemented without aligning frontend headers/cookies.
- Previously excluded items may expand scope unintentionally.

**Rough effort**
- **3–7 days**.

---

## Recommendation (default)

Proceed with **Option 1** as **Phase G**.

Reasoning: A–F is complete and integrated. The highest ROI now is to (1) lock in environment parity and (2) create a tiny, reliable acceptance suite that Coder/Verifier can run on every change. This prevents “works on :3001 but not on proxy” regressions and keeps future increments low-risk.

---

## Suggested Phase G definition (for immediate Coder/Verifier execution)

### Phase G: Operational smoke suite + environment parity

**Goal**
Provide a **repeatable, minimal acceptance harness** that validates the critical operational and user-facing gates across canonical entrypoints.

**Deliverables**
1. **Canonical entrypoints defined** (dev + proxy):
   - documented “what to hit” for:
     - health
     - swagger docs
     - core protected API access
2. **Smoke verification harness** (script and/or test) that checks:
   - health endpoint 200
   - swagger UI + spec endpoints 200
   - authenticated call to a protected endpoint succeeds (or a minimal auth sanity proof)
3. **Planning wiring**: Phase G verification criteria are written so Verifier can run them without interpreting intent.

### Phase G verification criteria (must pass)

**Backend-level checks (HTTP)**
- `GET /health` returns **200** on the canonical backend entrypoint.
- `GET /documentation` returns **200** on canonical entrypoint(s).
- `GET /documentation/json` returns **200** and returns a JSON OpenAPI document.

**Auth sanity (minimum viable)**
- A scripted/authenticated request to one protected endpoint succeeds (200) using a known dev user OR a deterministic seed path.
  - If the repo’s dev seed user is the canonical approach, Phase G should declare it explicitly.

**Proxy parity**
- The same docs endpoints (`/documentation`, `/documentation/json`) are reachable (200) on the canonical proxy entrypoint (currently evidenced at `:8080` in `INTEGRATION.md`).

### Phase G task breakdown (2–3 tasks, single-session friendly)

> Each task is intentionally “WHAT not HOW”. The executing agent chooses implementation details.

- task: "Define canonical entrypoints + update ops docs"
  files: ["README.md", "PRODUCTION.md", "DEPLOYMENT.md", ".planning/STATE.md", ".planning/INTEGRATION.md"]
  action: "Document the canonical dev/proxy entrypoints and the minimal ops gates to validate (health + docs + protected call). Ensure the docs are consistent and point to a single recommended entrypoint per environment."
  verify: "Human: follow the documented steps and confirm endpoints return expected status codes."
  done: "A developer can start the stack and run the documented checks without guessing ports or routes."

- task: "Add a minimal smoke harness"
  files: ["scripts/", "packages/backend/src/tests/", "packages/frontend/e2e/"]
  action: "Add the smallest automated smoke harness that can be run locally/CI to validate health + swagger + minimal auth-protected request."
  verify: "Automated: smoke harness exits 0 when services are up; exits non-zero with clear failure messages when a gate fails."
  done: "Verifier can run one thing and get a deterministic PASS/FAIL for the Phase G gates."

- task: "Wire smoke harness into the repo’s standard verification path"
  files: ["package.json", "packages/backend/package.json", "packages/frontend/package.json", "docs/"]
  action: "Expose a single documented command for Phase G verification (and future phases), and ensure it’s consistent with existing workspace scripts."
  verify: "Human: command is discoverable; Automated: it runs in CI or locally without manual edits."
  done: "Smoke verification is a default habit, not a tribal ritual."

---

## Notes / constraints to preserve

- Keep to the project’s chosen stack and conventions (Fastify + TypeScript, npm workspaces).
- Preserve the A–F model as the completed improvement roadmap; Phase G is a new increment.
- Keep the smoke suite intentionally small to avoid flakiness; expand later only if it proves stable.
