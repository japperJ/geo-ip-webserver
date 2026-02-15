
# Phase C Research: Missing Frontend Pages (Register, Users, Site Delegation, Routing/Nav)

**Scope:** Phase C only from `.planning/PORT_FEATURES_ROADMAP.md` (C1–C4).  
**Goal:** Provide implementation-ready integration guidance for Planner/Coder: exact file targets, existing APIs to consume (or gaps), role guards, current frontend patterns, and line-anchored insertion points.

---

## What exists today (relevant baseline)

### Frontend auth state + role source

Auth state is centralized in `packages/frontend/src/lib/auth.tsx`:

- `AuthProvider` owns:
	- `user: User | null` (contains `role: string`)
	- `token: string | null` (access token)
	- `loading: boolean`
- Token is stored **in memory** and applied to Axios via `setApiAuthToken()`.
- User is stored in **localStorage** on login, but the provider currently **does not read localStorage on mount**; it tries `/api/auth/refresh` instead.

**Line anchors:**
- `packages/frontend/src/lib/auth.tsx`
	- **L1–L12**: imports + `User` shape (`role` field) and context type.
	- **L24–L34**: token is stored in state and mirrored to Axios via `setApiAuthToken`.
	- **L36–L67**: on-mount refresh flow (`POST /api/auth/refresh`, `withCredentials: true`) and expectation that response includes `accessToken` **and** `user`.
	- **L69–L75**: `logout()` clears state and localStorage `user`.

**Important implication for Phase C role-gating:**
- Role checks are typically driven off `useAuth().user.role` **or** by decoding `useAuth().token` (see SiteContentPage pattern below).

### Frontend route protection pattern

`packages/frontend/src/components/ProtectedRoute.tsx` blocks access unless `useAuth().user` exists.

**Line anchor:**
- `packages/frontend/src/components/ProtectedRoute.tsx` **L1–L26** (simple authenticated/not-authenticated gate; no role checks).

### Frontend API client + data-fetching patterns

**Axios base client:** `packages/frontend/src/lib/api.ts`

- Maintains an in-memory `currentAuthToken` and exposes `setAuthToken()` / `getAuthToken()`.
- `api` is an Axios instance with `baseURL: '/api'`.
- A request interceptor injects `Authorization: Bearer <token>` using `getAuthToken()`.

**Line anchors:**
- `packages/frontend/src/lib/api.ts` **L1–L30** (token store + Axios instance + interceptor)

**Per-feature API modules:** the codebase prefers small focused wrappers that use the shared `api`:

- `packages/frontend/src/lib/accessLogApi.ts` — `accessLogApi.list/getById`
- `packages/frontend/src/lib/contentApi.ts` — `list/upload/delete/downloadUrl`

**React Query usage pattern:** pages call these wrappers via `useQuery` / `useMutation`.

Examples to follow:
- `packages/frontend/src/pages/AccessLogsPage.tsx` uses `useQuery` with `queryKey: ['accessLogs', ...]`.
- `packages/frontend/src/pages/SiteContentPage.tsx` uses `enabled:` guards + `invalidateQueries()` after mutations.

### Current routing + layout/nav pattern

Routes live in `packages/frontend/src/App.tsx`:

- Public route: `/login`
- Authenticated shell: `/` renders `<ProtectedRoute><Layout/></ProtectedRoute>` and nested routes

**Line anchors:**
- `packages/frontend/src/App.tsx`
	- **L1–L9**: imports (pages + Layout + auth).
	- **L13–L24**: public `/login` route and protected layout route.
	- **L15–L23**: nested routes for `sites/*`, `logs`, and `sites/:id/content`.

Navigation is computed inside `packages/frontend/src/components/Layout.tsx`:

- Uses `useLocation()` and derives `activeSiteId` from a regex of current path.
- Builds `navigation` array (sidebar links).
- Shows logged-in email, logout button.

**Line anchors:**
- `packages/frontend/src/components/Layout.tsx`
	- **L7–L10**: `useAuth()` and `useLocation()`.
	- **L12–L14**: `sitePathMatch` regex currently matches only `edit|content`.
	- **L16–L22**: `navigation` array; currently: `Sites`, conditional `Site Content`, and `Access Logs`.

### Existing frontend “site-level role” gating example

`packages/frontend/src/pages/SiteContentPage.tsx` decodes JWT to determine `role` and `sites[siteId]` and then gates view/admin capabilities.

**Line anchors:**
- `packages/frontend/src/pages/SiteContentPage.tsx`
	- **L38–L45**: JWT payload typing (`role`, `sites` map).
	- **L46–L75**: `parseJwtPayload(token)` implementation.
	- **L122–L142**: reads `token` from `useAuth()`, computes `isSuperAdmin`, `siteRole`, and `canManageContent/canViewContent`.
	- **L143–L154**: `useQuery` calls are `enabled: canViewContent`.

This is the closest existing pattern for SiteUsersPage (C3): treat the JWT sites map as the source of truth for site-level permissions.

---

## Backend endpoints Phase C can consume (and what’s missing)

### Auth endpoints (exist)

Routes are defined in `packages/backend/src/routes/auth.ts` and registered with prefix `/api/auth` in `packages/backend/src/index.ts`.

**Registration anchor:**
- `packages/backend/src/index.ts` **L273–L279** registers:
	- `authRoutes` at `/api/auth`
	- `siteRoleRoutes` at `/api/sites`
	- others

**Auth route anchors:**
- `packages/backend/src/routes/auth.ts`
	- **L6–L43**: `POST /register`
	- **L46–L74**: `POST /login` (sets `refreshToken` HttpOnly cookie)
	- **L78–L106**: `POST /refresh` (returns `{ success, accessToken }`)
	- **L109–L132**: `POST /logout`
	- **L135–L171**: `GET /me` (auth required)

**Important mismatch to flag (Phase C dependency):**
- Frontend `AuthProvider` currently expects `/api/auth/refresh` to return both `accessToken` and `user` (see `auth.tsx` L43–L52), but backend `/refresh` currently returns only `{ success, accessToken }` (auth.ts L98–L101). If Phase A doesn’t address this, Phase C pages that depend on `user.role` and `user.email` may “forget” auth state after reload.

### Site delegation endpoints (exist)

Routes are defined in `packages/backend/src/routes/siteRoles.ts` and registered with prefix `/api/sites`.

Effective endpoints:
- `POST /api/sites/:id/roles` — grant/update role (`super_admin` only)
- `GET /api/sites/:id/roles` — list roles (requires site access: super admin or assigned)
- `DELETE /api/sites/:id/roles/:userId` — revoke role (`super_admin` only)

**Role requirements (from middleware wiring):**
- POST/DELETE use `requireRole('super_admin')`.
- GET uses `requireSiteAccess` (super_admin OR user has any `sites[siteId]`).

**Line anchors:**
- `packages/backend/src/routes/siteRoles.ts`
	- **L8–L61**: POST grant role (`onRequest: authenticate + requireRole(super_admin)`).
	- **L64–L101**: GET list roles (`onRequest: authenticate + requireSiteAccess`).
	- **L104–L142**: DELETE revoke (`onRequest: authenticate + requireRole(super_admin)`).

Note: the GET response enriches role rows with `user: { id, email, global_role }`.

### Global user management endpoints (missing)

Phase C2 (`UsersPage.tsx`) needs an API surface for:
- List users
- Create/register user (can reuse `/api/auth/register` but may need `super_admin` restriction)
- Delete user (soft-delete)
- Change global role (`super_admin` vs `user`)

**Current backend state (confirmed by route inventory):**
- Only these route files exist under `packages/backend/src/routes/`: `auth.ts`, `sites.ts`, `siteRoles.ts`, `accessLogs.ts`, `gdpr.ts`, `content.ts`.
- No `users.ts` route exists, and `AuthService` currently exposes `createUser/login/refreshAccessToken/getUserById` but no `listUsers/updateRole/deleteUser`.

**Planner/Coder decision point:**
- Either (a) implement new backend endpoints as part of the Phase C workstream (even though Phase C is “frontend pages”), or (b) defer UsersPage until backend is added (blocker).

### Site delegation UX dependency: need a way to find users

Even though delegation endpoints exist, the grant endpoint requires a `userId`. Without a `GET /api/users` (or search-by-email) endpoint, SiteUsersPage cannot offer a user picker unless the admin manually pastes UUIDs.

**So SiteUsersPage is functionally blocked** until backend provides a global user list/search.

---

## Phase C deliverables: exact file targets + recommended behavior

### C1 — `RegisterPage.tsx`

**File to create:** `packages/frontend/src/pages/RegisterPage.tsx`

**Backend endpoint to call:** `POST /api/auth/register`
- Body: `{ email: string, password: string }`
- Response: `{ success: true, user, message }`

**Frontend patterns to follow:**
- Match form and styling patterns from `LoginPage.tsx` (Card, Input, Label, Button).
- On success, either:
	- (Option A) redirect to `/login` with a “registered successfully” message, OR
	- (Option B) auto-login by chaining `POST /api/auth/login`.

**Routing insertion point:**
- Add `Route path="/register"` alongside `/login` in `packages/frontend/src/App.tsx` (near **L14**).

**Navigation:**
- Not required in sidebar; typically only linked from Login page.

### C2 — `UsersPage.tsx` (super_admin)

**File to create:** `packages/frontend/src/pages/UsersPage.tsx`

**Role guard:** super_admin only.

**Blocker:** backend endpoints for user list/update/delete do not exist today.

**Recommended minimum API surface (backend gap, for Planner/Coder to schedule):**
- `GET /api/users` (super_admin only): list users
- `PATCH /api/users/:id` (super_admin only): update `global_role`
- `DELETE /api/users/:id` (super_admin only): soft delete
- Optionally `POST /api/users` (super_admin only): create user (alternative to `/api/auth/register`)

**Frontend implementation guidance once API exists:**
- Use React Query list pattern from `SitesPage.tsx` / `AccessLogsPage.tsx`.
- Use `useMutation` for role update and delete; invalidate `['users']` query key.
- Use the same UI primitives (Table, Select, Button) already used in `AccessLogsPage.tsx`.

**Routing insertion point:**
- Add `Route path="users" element={<UsersPage/>}` under protected layout in `packages/frontend/src/App.tsx` (around **L16–L23**).

**Nav insertion point:**
- Add a `Users` item to `navigation` in `packages/frontend/src/components/Layout.tsx` only when `useAuth().user?.role === 'super_admin'`.
	- Insert near `navigation` definition (**L16–L22**).

### C3 — `SiteUsersPage.tsx` (delegation)

**File to create:** `packages/frontend/src/pages/SiteUsersPage.tsx`

**Primary backend endpoints (exist):**
- `GET /api/sites/:id/roles` — list delegated roles + user info
- `POST /api/sites/:id/roles` — grant/update (`super_admin` only)
- `DELETE /api/sites/:id/roles/:userId` — revoke (`super_admin` only)

**Authorization behavior to mirror backend rules:**
- Any user with site access should be able to **view** the role list.
- Only `super_admin` should be able to grant/revoke.

**Frontend role detection patterns:**
- Prefer the existing JWT-decode pattern from `SiteContentPage.tsx`:
	- Determine `isSuperAdmin = jwtPayload.role === 'super_admin'`
	- Determine site access via `jwtPayload.sites?.[siteId]`

**Critical blocker (same as UsersPage):**
- To *grant* a role you need `userId`. Today the system lacks a global user listing/search endpoint, so SiteUsersPage cannot provide a proper “add user by email” UI.

**Suggested UX options (Planner decision):**
- (Preferred) Implement `GET /api/users` (super_admin only) and use it as the picker.
- (Alternative) Implement `GET /api/users?email=...` search endpoint.
- (Last resort) Provide a manual `userId` input (UUID) + role dropdown.

**Routing insertion point:**
- Add `Route path="sites/:id/users" element={<SiteUsersPage/>}` under the protected layout in `packages/frontend/src/App.tsx` (near existing `sites/:id/content` route at **L20–L22**).

**Nav insertion point:**
- Extend `Layout.tsx` `sitePathMatch` regex to include `users` so `activeSiteId` is available on that page.
	- Current: `/(edit|content)/` (**L12–L14**)
	- Target: include `users` (and any other site subpages).
- Add a conditional nav item (when `activeSiteId` exists):
	- `Site Users` → `/sites/${activeSiteId}/users`

### C4 — Layout/App routing updates

**Files to modify:**
- `packages/frontend/src/App.tsx`
- `packages/frontend/src/components/Layout.tsx`

**What to add:**
- Public route: `/register`
- Protected route: `/users` (super_admin only)
- Protected route: `/sites/:id/users`
- Sidebar:
	- Global: `Users` (only if super_admin)
	- Site-scoped: `Site Users` (only when activeSiteId derived)

---

## Exact integration anchors (for Planner/Coder)

### Frontend

1) `packages/frontend/src/App.tsx`
- **Anchor: L14** — insert `Route path="/register" element={<RegisterPage />}` near `/login`.
- **Anchor: L15–L23** — under protected layout route, insert:
	- `Route path="users" ...` (UsersPage)
	- `Route path="sites/:id/users" ...` (SiteUsersPage)

2) `packages/frontend/src/components/Layout.tsx`
- **Anchor: L12–L14** — update `sitePathMatch` regex to include `users`.
- **Anchor: L16–L22** — add:
	- `Users` nav item conditional on `user?.role === 'super_admin'`
	- `Site Users` item inside the `activeSiteId ? [...] : []` section

3) `packages/frontend/src/lib/auth.tsx`
- **Anchor: L36–L67** — be aware of refresh flow expectations (may impact Phase C routing/guards after reload).

4) `packages/frontend/src/pages/LoginPage.tsx`
- Optional UX link point: add “Create an account” link to `/register`.

5) Pattern reference: `packages/frontend/src/pages/SiteContentPage.tsx`
- **Anchor: L46–L75** and **L137–L142** — reuse JWT parsing logic/pattern for `SiteUsersPage` permissions.

### Backend (reference only for Phase C)

1) `packages/backend/src/index.ts`
- **Anchor: L273–L279** — confirms route prefixes:
	- auth: `/api/auth/*`
	- site roles: `/api/sites/*` (so `/api/sites/:id/roles`)

2) `packages/backend/src/routes/siteRoles.ts`
- **Anchor: L8–L61 / L64–L101 / L104–L142** — exact delegation endpoints and auth rules.

3) `packages/backend/src/routes/auth.ts`
- **Anchor: L6–L43** — `POST /api/auth/register` used by RegisterPage.

---

## Blockers / decisions to resolve before coding Phase C pages

1) **Blocker: no backend user-management endpoints**
- UsersPage (C2) cannot be implemented meaningfully without at least `GET /api/users`.

2) **Blocker: SiteUsersPage needs a user lookup mechanism**
- Delegation requires `userId`; without list/search endpoint, UX is severely limited.

3) **Dependency risk: refresh flow response mismatch**
- Frontend expects `/api/auth/refresh` to return `user` as well as `accessToken`.
- Backend currently returns only `accessToken`.

4) **Role model clarity (decision):**
- Global role values: `super_admin | user`.
- Site role values: `admin | viewer`.
- Phase C UI should clearly distinguish these.

