# Phase F Research: Documentation Sync (DOC-001, DOC-002)

## Summary

Phase F has two deliverables (from `.planning/PORT_FEATURES_ROADMAP.md`):

- **DOC-001:** Update `.planning/STATE.md` so it reflects current reality (Phase A–E work completed, and the newer A–F improvement plan status).
- **DOC-002:** Add **Swagger/OpenAPI docs** so **Swagger UI is accessible at `/documentation`**.

Key findings that affect implementation scope/effort:

1. **`/documentation` will currently be blocked by global request hooks** (site resolution + IP/GPS access control).
2. **Current global Helmet CSP is likely incompatible with Swagger UI’s inline bootstrap script**, so `/documentation` may render but fail to run unless CSP is adjusted.
3. Swagger coverage will be **partial** until non-Zod routes (auth/users/site roles/GDPR) gain `schema` metadata.

## Phase F requirements (source of truth)

From `.planning/PORT_FEATURES_ROADMAP.md`:

- Phase F section header: **line 280**
- **DOC-001**: **line 286** (“Update STATE.md to reflect current reality”)
- **DOC-002**: **line 290** (“Add Swagger/OpenAPI docs”)
- DOC-002 outcome “Swagger UI accessible at `/documentation`”: **line 291**

(See also the “Phase Verification” bullet “Swagger UI accessible at `/documentation`” near **line 302**.)

## Current backend structure (where Swagger must be wired)

### Bootstrap / plugin registration file

- Backend entry/bootstrap: `packages/backend/src/index.ts`

Relevant anchors:

- Zod type provider attached to the server: `withTypeProvider<ZodTypeProvider>()` (**line 57**)
- Zod compilers configured:
  - `server.setValidatorCompiler(validatorCompiler)` (**line 60**)
  - `server.setSerializerCompiler(serializerCompiler)` (**line 61**)
- Helmet configured globally with CSP (**line 70** and surrounding block)
- Global `onRequest` hooks (site resolution + access control): **lines 168–234**
  - Site resolution hook registration: `server.addHook('onRequest', siteResolutionMiddleware)` (**line 169**)
  - IP access control: `server.addHook('onRequest', ipAccessControl)` (**line 202**)
  - GPS wrapper hook: starts at **line 205**, calls `gpsAccessControl(...)` (call site around **line 215**)
- Route registration block begins: `// Register routes` (**line 274**) with individual `server.register(...)` calls (**lines 275–281**)

### Best insertion points for Swagger + Swagger UI

`@fastify/swagger` must be registered **before routes** for route discovery (per upstream docs; see Sources).

In this repo, the cleanest insertion boundary is:

- **Before** the route registration block (`// Register routes`, `index.ts` line **274**), and
- **After** the server is constructed and Zod compilers are set (`index.ts` lines **57–61**).

There is a secondary concern: Swagger UI routes must not be broken by global middleware. You will almost certainly need one (or both) of:

1) **Explicit middleware bypass** for `/documentation` and its subpaths (recommended; most robust).
2) **Encapsulation tricks** (register Swagger UI in a scope not affected by those hooks). This is harder to reason about and should still be paired with bypass logic.

## Middleware compatibility: why `/documentation` will likely fail today

### 1) Site resolution blocks non-API routes

File: `packages/backend/src/middleware/siteResolution.ts`

- Skip logic only exempts `/health`, `/api/`, `/metrics` (**lines 12–14**).
- Therefore `/documentation` **does not skip** site resolution.
- Site resolution requires a hostname and a configured site; otherwise it responds with a 400/404.

Impact:

- Unless the request’s hostname maps to a configured Site, `/documentation` will return:
  - `400` (no hostname) or
  - `404` (no site configured for hostname)

Related operability note (not strictly required by Phase F, but the same mechanism applies):

- The readiness probe endpoint `/ready` is also **not** in the skip list (site resolution only skips `/health`, `/api/`, `/metrics`), so it may be unintentionally site-gated.

### 2) IP/GPS access control hooks run on every request once a site is attached

File: `packages/backend/src/index.ts`

- `ipAccessControl` is registered globally on `onRequest` (**line 202**)
- GPS access control wrapper runs globally on `onRequest` (**line 205**)

Impact:

- Even if site resolution succeeds, access control may:
  - log/block the docs request as an ordinary visitor access attempt
  - return `403` depending on allowlists/denylists/country/VPN settings
  - return `403` for missing GPS on geo-required sites (GPS middleware returns `GPS coordinates required` in `gpsAccessControl.ts`, around **lines 113–118**)

## Helmet/CSP compatibility: Swagger UI likely needs CSP adjustment

File: `packages/backend/src/index.ts`

- Helmet is registered with a strict CSP. Notably:
  - `scriptSrc: ["'self'"]` (no `unsafe-inline`) (**helmet block near line 70**)

Swagger UI’s HTML typically includes an inline bootstrap script to initialize the UI.

Upstream `@fastify/swagger` docs include a specific **Helmet integration** pattern (uses `instance.swaggerCSP.script` and `instance.swaggerCSP.style`) to make Swagger UI work with CSP (see Sources: `@fastify/swagger` README “Integration”).

Implication for Phase F:

- If you keep strict global CSP, you likely need to:
  - either (A) incorporate the swagger-provided CSP allowances into Helmet, or
  - (B) scope a relaxed CSP just for `/documentation` routes.

Also note: `@fastify/swagger-ui` exposes options `staticCSP` and `transformStaticCSP` for static resources, but this is not a full replacement for properly aligning your page-level CSP with Swagger UI.

## Schema sources and Swagger compatibility (Zod / type-provider)

### What you have

- The backend uses `fastify-type-provider-zod` and sets the validator/serializer compilers (`index.ts` lines **57–61**).
- Several route modules define Zod schemas in Fastify’s `schema` option, e.g.:
  - `packages/backend/src/routes/sites.ts` (multiple `schema: { ... }` blocks)
  - `packages/backend/src/routes/accessLogs.ts` (multiple `schema: { ... }` blocks; includes export)
  - `packages/backend/src/routes/content.ts` (multiple `schema: { ... }` blocks)

These routes are the best candidates for Swagger/OpenAPI generation immediately.

### What is missing (Swagger will be partial)

These route modules currently rely on TypeScript generics and/or ad-hoc runtime checks, but **do not** define Fastify `schema` blocks (so OpenAPI will lack request/response shapes until added):

- `packages/backend/src/routes/auth.ts`
- `packages/backend/src/routes/users.ts`
- `packages/backend/src/routes/siteRoles.ts`
- `packages/backend/src/routes/gdpr.ts`

### Compatibility approach (recommended)

Upstream `fastify-type-provider-zod` documentation shows:

- Use `@fastify/swagger` with `transform: jsonSchemaTransform`
- Optionally also use `transformObject: jsonSchemaTransformObject` for `$ref`/components support
- Optionally use `createJsonSchemaTransform({ skipList: [...] })` to exclude doc/static endpoints from the generated spec

This matches the repo’s current Zod usage and is the lowest-friction route to “Swagger UI accessible at `/documentation`”.

## `.planning/STATE.md` drift / stale sections (DOC-001)

`.planning/STATE.md` contains mutually inconsistent claims/structures:

1) **Header says Phase A–E complete**
- `**Current Phase:** Phase E - ... (Complete)` (**line 6**)
- `Project Status: ... (Phase A complete ... Phase E complete)` (**line 7**)

2) **But “Quick Stats” still shows 6% (9/145 tasks)**
- `Overall Progress | 6% (9/145 tasks)` (**line 15**)

3) **And “Phase Status Overview” is still the older Phase 0–5 plan**
- `## Phase Status Overview` (**line 26**)
- Phase 1–5 rows show “🔴 Not Started” (**lines 31–35**)

4) **KPIs, Risk Tracking, and some narrative blocks still assume “project not started”**
- `### Key Performance Indicators (KPIs)` (**line 255**) shows “Not started” for phases
- `## Risk Tracking` (**line 269**) shows all risks “Not Mitigated”

5) **Change log describes substantial completion** (contradicting the above)
- `## Change Log` (**line 301**) contains entries claiming Phase B–E completion and verifications.

What Phase F likely needs (interpretation aligned to roadmap):

- Pick one planning axis and make it consistent:
  - either fully migrate `STATE.md` to **A–F improvement plan** language, or
  - keep legacy 0–5 but update it to “Complete” and adjust progress/KPIs accordingly.
- Ensure the “Quick Stats” numbers match the selected phase axis.
- Ensure the “Last Updated By” and “Next Update Due” lines reflect reality (currently still looks like initial planning; `Last Updated By` at **line 440**).

## Verification hooks (what to check when Phase F is implemented)

### Swagger UI reachability

Minimum gates for DOC-002:

- `GET /documentation` returns `200` and a Swagger UI HTML page (not a 400/403/404 from middleware).
- `GET /documentation/json` returns `200` and a JSON OpenAPI document.

Typical failure signatures to watch for:

- `404 No site configured for hostname` → site resolution not skipping docs (`siteResolution.ts` lines **12–14**)
- `403 Forbidden` / `gps_required` payload → access-control hooks not skipping docs (`index.ts` lines **202–234**, `gpsAccessControl.ts` around **113–118**)
- Swagger UI loads HTML but browser console shows CSP violations → Helmet CSP too strict (`index.ts` helmet block near **line 70**)

### STATE.md accuracy

Minimum gates for DOC-001:

- `.planning/STATE.md` no longer has contradictory:
  - “Phase A–E complete” header vs
  - “Phase 1–5 not started” table vs
  - “Overall progress 6% (9/145)” stats.

A quick audit after editing:

- Search for “Not started” / “6% (9/145 tasks)” and confirm they’re consistent with the chosen planning model.
- Ensure the Phase F section of `.planning/PORT_FEATURES_ROADMAP.md` is reflected in state tracking (Phase F should not be “missing”).

## Open questions / decisions for the implementer

1. **Doc route policy:** Should `/documentation` be publicly accessible in all environments, or gated behind auth/basic-auth?
   - Upstream `@fastify/swagger-ui` supports protecting doc routes via `uiHooks.onRequest` (see Sources).
2. **CSP strategy:** Do you want strict CSP globally, with exceptions only for docs? (Recommended.)
3. **Spec completeness target:** Is Phase F satisfied with “partial docs” (only routes with Zod schema), or should Phase F expand schema coverage for auth/users/gdpr/siteRoles?

## Sources

- `@fastify/swagger` README (route discovery note; helmet integration): https://github.com/fastify/fastify-swagger
- `@fastify/swagger-ui` README (routePrefix `/documentation`, endpoints, CSP options): https://github.com/fastify/fastify-swagger-ui
- `fastify-type-provider-zod` README (jsonSchemaTransform + swagger integration; skipList; transformObject): https://github.com/turkerdev/fastify-type-provider-zod
