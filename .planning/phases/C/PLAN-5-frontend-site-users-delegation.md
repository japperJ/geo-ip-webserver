---
phase: C
plan: 5
type: implement
wave: 4
depends_on:
  - "PLAN-1 (backend /api/users endpoints available for user picking)"
  - "Phase A complete (site role routes exist)"
files_modified:
  - packages/frontend/src/pages/SiteUsersPage.tsx
  - packages/frontend/src/lib/siteRolesApi.ts
  - packages/frontend/src/lib/usersApi.ts
  - packages/frontend/src/App.tsx
  - packages/frontend/src/components/Layout.tsx
autonomous: true
must_haves:
  observable_truths:
    - "Any user with site access can view the site role list"
    - "Only super_admin can grant/revoke site roles"
    - "Sidebar can derive activeSiteId on /sites/:id/users and shows a Site Users link"
  artifacts:
    - path: packages/frontend/src/pages/SiteUsersPage.tsx
      has:
        - "Role list via GET /api/sites/:id/roles"
        - "Grant/update UI (super_admin only)"
        - "Revoke UI (super_admin only)"
        - "Uses JWT decode pattern (or equivalent) for isSuperAdmin + site access detection"
    - path: packages/frontend/src/App.tsx
      has:
        - "Protected route: /sites/:id/users"
    - path: packages/frontend/src/components/Layout.tsx
      has:
        - "sitePathMatch recognizes users routes"
        - "Site Users nav link appears when activeSiteId is present"
  key_links:
    - from: "packages/frontend/src/pages/SiteUsersPage.tsx"
      to: "packages/backend/src/routes/siteRoles.ts (GET/POST/DELETE /api/sites/:id/roles)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L216-L242"
      verify: "Role list loads; super_admin can mutate; non-admin cannot"
    - from: "packages/frontend/src/pages/SiteUsersPage.tsx (add user flow)"
      to: "packages/frontend/src/lib/usersApi.ts (GET /api/users?q=... for userId lookup)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L164-L175"
      verify: "Grant UI can select a user without manual UUID entry"
    - from: "packages/frontend/src/components/Layout.tsx (activeSiteId regex + Site Users nav)"
      to: "packages/frontend/src/App.tsx (route /sites/:id/users)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L243-L270"
      verify: "On /sites/:id/users, sidebar highlights site context and shows Site Users link"
    - from: "packages/frontend/src/pages/SiteUsersPage.tsx (permission model)"
      to: "packages/frontend/src/pages/SiteContentPage.tsx (JWT decode pattern reference)"
      research_anchor: ".planning/phases/C/RESEARCH.md:L88-L102"
      verify: "isSuperAdmin and site access are derived consistently across site pages"
---

# Phase C, Plan 5: SiteUsers delegation page + `/sites/:id/users` routing/nav (C3 + C4)

## Objective
Implement C3 by adding a SiteUsers delegation page that matches backend authorization rules, and implement the required routing/navigation updates (C4) specific to site-user delegation.

## Tasks

### Task 1: Implement `SiteUsersPage.tsx` (view for site members; manage for super_admin)
- **files:**
  - `packages/frontend/src/pages/SiteUsersPage.tsx`
  - `packages/frontend/src/lib/siteRolesApi.ts`
  - `packages/frontend/src/lib/usersApi.ts`
- **action:**
  - Fetch and render the site role list using `GET /api/sites/:id/roles`.
  - Allow mutations (grant/update/revoke) only when the user is super_admin.
  - Use a consistent permission model (prefer the existing JWT decode pattern referenced in RESEARCH).
  - Provide a usable user selection mechanism for grants using `/api/users` from PLAN-1.
  - Create/extend `packages/frontend/src/lib/usersApi.ts` as the single wrapper for user lookup used by grants:
    - list/search users using `q` as the query parameter (i.e., `/api/users?q=...`)
- **verify:**
  - Super admin can grant/revoke and sees updates reflected.
  - Delegated site members can view but not mutate.
  - User lacking site access receives a denied UX (403 from roles endpoints; page should not appear editable).
- **done:**
  - Delegation is usable and matches backend rules.

### Task 2: Wire routing + navigation for `/sites/:id/users`
- **files:**
  - `packages/frontend/src/App.tsx`
  - `packages/frontend/src/components/Layout.tsx`
- **action:**
  - Add the protected route `sites/:id/users` near the existing `sites/:id/content` route.
  - Update Layout's `activeSiteId` detection (regex) to recognize `users` routes.
  - Add a `Site Users` nav item when `activeSiteId` exists.
- **verify:**
  - Navigating to a site’s Users page maintains correct sidebar context.
- **done:**
  - Site-level navigation works cleanly for the new page.

## Verification
- End-to-end delegation check:
  - As super_admin: grant a role to a user for a site.
  - As that user: verify view access is allowed, and manage actions are denied.
  - Revoke and confirm access is removed after token refresh/re-login.
