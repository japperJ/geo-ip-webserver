# Requirements Specification: Geo-Fenced Multi-Site Webserver

**Version:** 1.0  
**Last Updated:** 2026-02-14  
**Status:** Draft  
**Traceability:** All requirements mapped to ROADMAP.md phases and tasks

---

## Document Overview

This document defines the complete set of functional and non-functional requirements for the geo-fenced multi-site webserver project. Each requirement includes:
- **REQ-ID:** Unique identifier for traceability
- **Title & Description:** What the requirement is
- **Acceptance Criteria:** Measurable, testable conditions for completion
- **Priority:** Must-have (M), Should-have (S), Nice-to-have (N) using MoSCoW method
- **Phase Mapping:** Which roadmap phase implements this requirement
- **Related Tasks:** Task IDs from ROADMAP.md
- **Related Risks:** Risk IDs from ROADMAP.md Risk Register

---

## Table of Contents

1. [Functional Requirements](#functional-requirements)
   - [Multi-Site Management](#multi-site-management)
   - [Access Control Modes](#access-control-modes)
   - [IP-Based Access Control](#ip-based-access-control)
   - [GPS-Based Access Control](#gps-based-access-control)
   - [Admin User Interface](#admin-user-interface)
   - [User Management & RBAC](#user-management--rbac)
   - [Audit Logging](#audit-logging)
   - [Artifact Capture](#artifact-capture)
2. [Non-Functional Requirements](#non-functional-requirements)
   - [Performance](#performance)
   - [Security](#security)
   - [Privacy & GDPR Compliance](#privacy--gdpr-compliance)
   - [Scalability](#scalability)
   - [Observability](#observability)
   - [Quality & Testing](#quality--testing)
   - [Reliability](#reliability)
3. [Traceability Matrix](#traceability-matrix)

---

## Functional Requirements

### Multi-Site Management

#### REQ-F-001: Site Creation
**Description:** Administrators must be able to create new sites with unique hostnames and slugs.

**Acceptance Criteria:**
1. Admin can create a site via API (`POST /api/admin/sites`)
2. Each site has a unique slug (alphanumeric, hyphens, 3-100 characters)
3. Each site has an optional unique hostname (DNS validation)
4. Site creation validates slug and hostname uniqueness (returns 409 Conflict if duplicate)
5. Site creation returns complete site object with UUID in response

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP - IP Access Control)  
**Related Tasks:** MVP-001, MVP-002, MVP-003  
**Related Risks:** None  
**Reference:** [ROADMAP.md:269-283], [FEATURES.md:31-95]

---

#### REQ-F-002: Site Update
**Description:** Administrators must be able to update existing site configuration including hostname, access mode, IP rules, and geofence data.

**Acceptance Criteria:**
1. Admin can update a site via API (`PATCH /api/admin/sites/:id`)
2. Partial updates supported (only changed fields sent)
3. Hostname uniqueness validated on update
4. Slug cannot be changed after creation (immutable)
5. Access mode can be changed without data loss (IP rules, geofence preserved)
6. Update returns updated site object

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-001, MVP-002  
**Related Risks:** None  
**Reference:** [ROADMAP.md:269-283]

---

#### REQ-F-003: Site Deletion
**Description:** Administrators must be able to delete sites (soft delete with cascade).

**Acceptance Criteria:**
1. Admin can delete a site via API (`DELETE /api/admin/sites/:id`)
2. Deletion is soft delete (sets `deleted_at` timestamp, does not remove from DB)
3. Deleted sites excluded from queries unless explicitly requested
4. Associated access logs are NOT deleted (audit trail preservation)
5. Deletion returns 204 No Content on success

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-001, MVP-002  
**Related Risks:** None  
**Reference:** [ROADMAP.md:269-283]

---

#### REQ-F-004: Site Listing
**Description:** Administrators must be able to list all sites with pagination and filtering.

**Acceptance Criteria:**
1. Admin can list sites via API (`GET /api/admin/sites`)
2. Pagination supported (query params: `page`, `limit`, default 20 per page)
3. Filtering supported by access mode (query param: `access_mode`)
4. Response includes total count for pagination UI
5. Sites sorted by creation date (newest first) by default

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-001, MVP-002, MVP-015  
**Related Risks:** None  
**Reference:** [ROADMAP.md:269-283], [ROADMAP.md:379-388]

---

#### REQ-F-005: Site Retrieval by Hostname
**Description:** System must resolve incoming requests to the correct site based on the `Host` header (hostname).

**Acceptance Criteria:**
1. Middleware extracts `Host` header from incoming request
2. Site lookup uses multi-layer cache (LRU → Redis → DB)
3. Cache hit returns site in <1ms (LRU) or <10ms (Redis)
4. Cache miss performs DB lookup with result cached
5. If hostname not found, return 404 Not Found
6. Cache invalidated when site hostname is updated

**Priority:** Must-have (M)  
**Phase:** Phase 3 (Multi-Site & RBAC)  
**Related Tasks:** MULTI-001, MULTI-002, MULTI-003, MULTI-004  
**Related Risks:** RISK-010 (Cache invalidation bugs)  
**Reference:** [ROADMAP.md:639-668], [ARCHITECTURE.md:17-145]

---

### Access Control Modes

#### REQ-F-006: Access Mode Configuration
**Description:** Each site must support configurable access control modes.

**Acceptance Criteria:**
1. Site has `access_mode` field with enum values: `disabled`, `ip_only`, `geo_only`, `ip_and_geo`
2. `disabled` mode allows all requests (no access control)
3. `ip_only` mode enforces only IP-based rules
4. `geo_only` mode enforces only GPS-based geofence
5. `ip_and_geo` mode enforces both IP and GPS rules (both must pass)
6. Mode can be changed via Site Update API

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP) for `disabled` and `ip_only`, Phase 2 (GPS) for `geo_only` and `ip_and_geo`  
**Related Tasks:** MVP-002, GEO-004, GEO-018  
**Related Risks:** None  
**Reference:** [ROADMAP.md:269-283], [ROADMAP.md:504-513]

---

### IP-Based Access Control

#### REQ-F-007: IP Allowlist
**Description:** Sites must support IP address allowlists (CIDR notation).

**Acceptance Criteria:**
1. Site has `ip_allowlist` field (array of strings)
2. Each entry can be single IP (`192.168.1.1`) or CIDR range (`10.0.0.0/8`)
3. Request IP checked against allowlist (if non-empty)
4. If IP matches any allowlist entry, request is allowed
5. If allowlist is non-empty and IP does not match, request is denied
6. If allowlist is empty, IP allowlist check is skipped

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-007, MVP-008, MVP-009  
**Related Risks:** RISK-007 (SQL injection via IP input)  
**Reference:** [ROADMAP.md:295-327], [FEATURES.md:168-248]

---

#### REQ-F-008: IP Denylist
**Description:** Sites must support IP address denylists (CIDR notation).

**Acceptance Criteria:**
1. Site has `ip_denylist` field (array of strings)
2. Each entry can be single IP or CIDR range
3. Request IP checked against denylist before allowlist
4. If IP matches any denylist entry, request is denied immediately
5. If IP does not match denylist, proceed to allowlist check
6. Denylist takes precedence over allowlist

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-007, MVP-008, MVP-009  
**Related Risks:** RISK-007 (SQL injection)  
**Reference:** [ROADMAP.md:295-327]

---

#### REQ-F-009: Country-Level IP Blocking
**Description:** Sites must support blocking by country code using MaxMind GeoIP database.

**Acceptance Criteria:**
1. Site has `ip_country_allowlist` field (array of ISO country codes)
2. Site has `ip_country_denylist` field (array of ISO country codes)
3. Request IP geo-located to country using MaxMind GeoIP2
4. If country in denylist, request is denied
5. If country allowlist is non-empty and country not in allowlist, request is denied
6. GeoIP lookup completes in <1ms (local MMDB database)

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-005, MVP-007, MVP-009, DEV-009  
**Related Risks:** None  
**Reference:** [ROADMAP.md:295-327], [STACK.md:191-285]

---

#### REQ-F-010: VPN/Proxy Detection
**Description:** Sites must support optional blocking of VPNs and proxies using MaxMind Anonymous IP database.

**Acceptance Criteria:**
1. Site has `block_vpn_proxy` boolean field (default: true)
2. If enabled, request IP checked against MaxMind Anonymous IP database
3. If IP is classified as VPN, proxy, hosting provider, or Tor exit node, request is denied
4. Detection completes in <1ms (local MMDB database)
5. Access log indicates VPN/proxy detection as denial reason
6. Detection rate: 80-90% for commercial VPNs, 60% for residential proxies (known limitation)

**Priority:** Should-have (S)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-005, MVP-007, MVP-009, DEV-009  
**Related Risks:** RISK-001 (VPN bypass)  
**Reference:** [ROADMAP.md:295-327], [PITFALLS.md:265-362]

**Approved Deviation:** Default for `block_vpn_proxy` is set to `true` (instead of `false`) to align with Phase 1 plan notes and security posture. Documented and approved in planning.

---

#### REQ-F-011: IP Extraction from Proxied Requests
**Description:** System must correctly extract client IP from proxied requests (X-Forwarded-For, X-Real-IP headers).

**Acceptance Criteria:**
1. IP extraction utility checks headers in order: `X-Forwarded-For` (leftmost IP), `X-Real-IP`, `req.socket.remoteAddress`
2. If `X-Forwarded-For` contains multiple IPs, leftmost (client) IP is used
3. IP validation ensures extracted IP is valid IPv4 or IPv6 address
4. If no valid IP found, request is denied (cannot verify access control)
5. Trusted proxy configuration prevents IP spoofing (Fastify `trustProxy` option)

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-006, MVP-007  
**Related Risks:** RISK-001 (IP spoofing via X-Forwarded-For)  
**Reference:** [ROADMAP.md:292-294], [PITFALLS.md:85-149]

---

### GPS-Based Access Control

#### REQ-F-012: Polygon Geofencing
**Description:** Sites must support geofence boundaries defined as polygons (GeoJSON format).

**Acceptance Criteria:**
1. Site has `geofence_polygon` field (PostGIS GEOGRAPHY type)
2. Admin can draw polygon on map (Leaflet Draw) in admin UI
3. Polygon stored as GeoJSON in database
4. Request GPS coordinates checked with PostGIS `ST_Within(point, polygon)`
5. GIST spatial index ensures query completes in <1ms
6. Polygon can have multiple rings (outer boundary + inner exclusions)

**Priority:** Must-have (M)  
**Phase:** Phase 2 (GPS Geofencing)  
**Related Tasks:** GEO-001, GEO-006, GEO-007, GEO-014, GEO-015, GEO-016  
**Related Risks:** RISK-009 (Missing GIST index)  
**Reference:** [ROADMAP.md:476-504], [STACK.md:89-189]

---

#### REQ-F-013: Radius Geofencing
**Description:** Sites must support geofence boundaries defined as radius (center point + distance).

**Acceptance Criteria:**
1. Site has `geofence_center` (POINT) and `geofence_radius_meters` (INTEGER) fields
2. Admin can select center point on map and specify radius in meters
3. Request GPS coordinates checked with PostGIS `ST_DWithin(point, center, radius)`
4. GIST spatial index on `geofence_center` ensures query completes in <1ms
5. Radius can be 1m to 50,000m (50km max)

**Priority:** Should-have (S)  
**Phase:** Phase 2 (GPS Geofencing)  
**Related Tasks:** GEO-001, GEO-006, GEO-007, GEO-014  
**Related Risks:** RISK-009 (Missing GIST index)  
**Reference:** [ROADMAP.md:476-504], [STACK.md:89-189]

---

#### REQ-F-014: GPS Accuracy Validation
**Description:** System must validate GPS accuracy and reject low-accuracy positions.

**Acceptance Criteria:**
1. Client sends GPS coordinates with accuracy (meters) in request body
2. If accuracy > 100m, request is rejected with error message
3. Accuracy threshold configurable per site (future enhancement)
4. Access log records GPS accuracy for audit purposes
5. User shown error message prompting to retry GPS acquisition

**Priority:** Must-have (M)  
**Phase:** Phase 2 (GPS Geofencing)  
**Related Tasks:** GEO-002, GEO-009, GEO-019  
**Related Risks:** RISK-014 (GPS accuracy varies 3m-1000m+)  
**Reference:** [ROADMAP.md:493-495], [PITFALLS.md:411-539]

---

#### REQ-F-015: GPS-IP Cross-Validation
**Description:** System must cross-validate GPS coordinates with IP geolocation to detect spoofing.

**Acceptance Criteria:**
1. Request IP geo-located to city/region using MaxMind GeoIP2
2. Distance calculated between GPS coordinates and IP geolocation
3. If distance > 500km, request is flagged as potential spoofing
4. Flagged requests are denied with specific error message
5. Distance threshold configurable (default 500km)
6. Access log records GPS coordinates, IP location, and distance for audit

**Priority:** Must-have (M)  
**Phase:** Phase 2 (GPS Geofencing)  
**Related Tasks:** GEO-003, GEO-005, GEO-020  
**Related Risks:** RISK-001 (GPS spoofing via browser extensions)  
**Reference:** [ROADMAP.md:485-492], [PITFALLS.md:411-539]

---

#### REQ-F-016: GPS Consent Flow
**Description:** System must obtain explicit user consent before requesting GPS coordinates (GDPR compliance).

**Acceptance Criteria:**
1. Modal displayed to user explaining GPS data collection, purpose, and retention
2. User must click "Accept" button to grant consent
3. Consent timestamp stored in local storage (client-side)
4. If user denies consent, GPS access control is bypassed (access denied)
5. User can revoke consent at any time (clear local storage)
6. Consent modal includes link to privacy policy

**Priority:** Must-have (M) - GDPR Requirement  
**Phase:** Phase 4 (GDPR Compliance)  
**Related Tasks:** GDPR-002, GDPR-003, GEO-011  
**Related Risks:** RISK-006 (GDPR non-compliance)  
**Reference:** [ROADMAP.md:514-527], [SUMMARY.md:1163-1179]

---

### Admin User Interface

#### REQ-F-017: Site List View
**Description:** Admin UI must display a list of all sites with filtering and search.

**Acceptance Criteria:**
1. Site list page displays all sites in table format
2. Columns: Name, Hostname, Access Mode, Status (Active/Deleted), Actions
3. Filtering by access mode (dropdown)
4. Search by name or hostname (text input, debounced)
5. Pagination controls (prev/next, page size selector)
6. Click row to navigate to Site Editor

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-015, MVP-018  
**Related Risks:** None  
**Reference:** [ROADMAP.md:379-388]

---

#### REQ-F-018: Site Editor Form
**Description:** Admin UI must provide a form to create and edit site configuration.

**Acceptance Criteria:**
1. Form fields: Name, Slug, Hostname, Access Mode
2. Access mode selector (radio buttons): Disabled, IP Only, Geo Only, IP+Geo
3. IP Rules section (if IP-based mode selected):
   - IP Allowlist (textarea, one IP/CIDR per line)
   - IP Denylist (textarea, one IP/CIDR per line)
   - Country Allowlist (multi-select dropdown with ISO codes)
   - Country Denylist (multi-select dropdown)
   - Block VPN/Proxy (checkbox)
4. Geofence section (if Geo-based mode selected):
   - Embedded map (Leaflet) with draw controls
   - Polygon/radius mode selector
5. Form validation (slug format, hostname DNS, IP/CIDR format)
6. Save button triggers API call, shows success/error feedback

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP) for IP rules, Phase 2 (GPS) for geofence
**Related Tasks:** MVP-016, MVP-017, GEO-014, GEO-015, GEO-017, GEO-018  
**Related Risks:** None  
**Reference:** [ROADMAP.md:389-408], [ROADMAP.md:528-558]

---

#### REQ-F-019: Geofence Map Drawing
**Description:** Admin UI must provide an interactive map for drawing and editing geofence boundaries.

**Acceptance Criteria:**
1. Map component uses Leaflet with Leaflet Draw plugin
2. Admin can draw polygon by clicking points on map
3. Admin can draw radius by clicking center and dragging to edge
4. Existing geofence displayed on map load (if site has geofence)
5. Admin can edit existing geofence (move vertices, resize)
6. Admin can delete geofence and draw new one
7. Map centered on geofence (if exists) or default location (if new)
8. Validation: polygon must have at least 3 points, radius must be >0

**Priority:** Must-have (M)  
**Phase:** Phase 2 (GPS Geofencing)  
**Related Tasks:** GEO-013, GEO-014, GEO-015, GEO-016, GEO-017  
**Related Risks:** None  
**Reference:** [ROADMAP.md:528-558]

---

#### REQ-F-020: Access Logs Viewer
**Description:** Admin UI must display access logs with filtering, search, and detail view.

**Acceptance Criteria:**
1. Access logs page displays logs in table format
2. Columns: Timestamp, Site, IP (anonymized), Country, GPS (if available), Decision, Reason
3. Filtering by:
   - Site (dropdown)
   - Decision (allowed/denied)
   - Date range (date picker)
4. Search by IP address (partial match)
5. Pagination (infinite scroll or traditional pagination)
6. Click row to open detail modal with full log data (screenshot link if available)
7. Logs sorted by timestamp (newest first)

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-019, MVP-020  
**Related Risks:** None  
**Reference:** [ROADMAP.md:409-421]

---

#### REQ-F-021: Log Detail View
**Description:** Admin UI must display detailed information for a single access log entry.

**Acceptance Criteria:**
1. Modal or drawer displays full log details
2. Fields displayed:
   - Timestamp (formatted)
   - Site name and hostname
   - Client IP (anonymized), full IP visible to super admins only
   - Country, region, city (from MaxMind)
   - GPS coordinates (if available), accuracy, distance from IP location
   - Decision (allowed/denied)
   - Reason (specific rule that triggered denial)
   - User agent
   - Screenshot (embedded image if available, link to S3)
3. Close button to dismiss modal

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP) for basic fields, Phase 4 (Artifacts) for screenshot
**Related Tasks:** MVP-020, ART-011  
**Related Risks:** None  
**Reference:** [ROADMAP.md:417-421], [ROADMAP.md:775-785]

---

### User Management & RBAC

#### REQ-F-022: User Registration
**Description:** Users must be able to register accounts with email and password.

**Acceptance Criteria:**
1. Registration API endpoint (`POST /api/auth/register`)
2. Required fields: email, password (min 8 characters)
3. Email validation (format and uniqueness)
4. Password hashing with bcrypt (cost factor 12)
5. Email verification required before account activation (future enhancement)
6. Registration returns JWT access token and refresh token

**Priority:** Must-have (M)  
**Phase:** Phase 3 (Multi-Site & RBAC)  
**Related Tasks:** AUTH-001, AUTH-002  
**Related Risks:** RISK-004 (JWT in localStorage)  
**Reference:** [ROADMAP.md:577-596]

---

#### REQ-F-023: User Login
**Description:** Users must be able to log in with email and password to obtain JWT tokens.

**Acceptance Criteria:**
1. Login API endpoint (`POST /api/auth/login`)
2. Required fields: email, password
3. Password verified with bcrypt
4. On success, returns JWT access token (15min expiry) and refresh token (7 days)
5. Access token stored in memory (React state), refresh token in HttpOnly cookie
6. On failure, returns 401 Unauthorized with generic error message (no email enumeration)

**Priority:** Must-have (M)  
**Phase:** Phase 3 (Multi-Site & RBAC)  
**Related Tasks:** AUTH-001, AUTH-002, AUTH-003  
**Related Risks:** RISK-004 (JWT in localStorage)  
**Reference:** [ROADMAP.md:577-596], [PITFALLS.md:151-214]

---

#### REQ-F-024: Token Refresh
**Description:** System must support refreshing expired access tokens using refresh tokens.

**Acceptance Criteria:**
1. Refresh endpoint (`POST /api/auth/refresh`)
2. Refresh token read from HttpOnly cookie
3. If refresh token valid, returns new access token (15min expiry)
4. If refresh token expired, returns 401 Unauthorized (user must re-login)
5. Frontend automatically refreshes token when 401 received from API

**Priority:** Must-have (M)  
**Phase:** Phase 3 (Multi-Site & RBAC)  
**Related Tasks:** AUTH-003, AUTH-004  
**Related Risks:** RISK-004 (Token theft)  
**Reference:** [ROADMAP.md:597-602], [FEATURES.md:521-623]

---

#### REQ-F-025: Role-Based Access Control (RBAC)
**Description:** System must support role-based permissions (super admin, site admin, viewer).

**Acceptance Criteria:**
1. Users have `role` field: `super_admin`, `site_admin`, `viewer`
2. Super admins: Full access to all sites, user management, system settings
3. Site admins: Full access to assigned sites only (create, update, delete, view logs)
4. Viewers: Read-only access to assigned sites (view config, view logs)
5. Site assignments stored in `site_users` join table (user_id, site_id, role)
6. API endpoints protected with role checks (middleware)

**Priority:** Must-have (M)  
**Phase:** Phase 3 (Multi-Site & RBAC)  
**Related Tasks:** RBAC-001, RBAC-002, RBAC-003, RBAC-004, RBAC-005, RBAC-006  
**Related Risks:** None  
**Reference:** [ROADMAP.md:603-626], [FEATURES.md:521-623]

---

#### REQ-F-026: Site Admin Delegation
**Description:** Super admins must be able to assign site admins and viewers to specific sites.

**Acceptance Criteria:**
1. Super admin UI page for user management
2. List of all users with role and site assignments
3. Ability to assign user to site with role (site_admin or viewer)
4. Ability to remove user from site
5. API endpoints:
   - `POST /api/admin/sites/:id/users` (assign user to site)
   - `DELETE /api/admin/sites/:id/users/:userId` (remove user from site)
6. Site admin cannot assign users to sites (only super admin)

**Priority:** Must-have (M)  
**Phase:** Phase 3 (Multi-Site & RBAC)  
**Related Tasks:** RBAC-003, RBAC-004, RBAC-005, UI-007  
**Related Risks:** None  
**Reference:** [ROADMAP.md:603-626]

---

### Audit Logging

#### REQ-F-027: Access Decision Logging
**Description:** All access control decisions (allowed/denied) must be logged with full context.

**Acceptance Criteria:**
1. Every request through access control middleware creates access log entry
2. Log fields:
   - Timestamp (UTC)
   - Site ID
   - Decision (allowed/denied)
   - Reason (specific rule or pass condition)
   - Client IP (anonymized - last octet removed)
   - Country, region, city (from MaxMind)
   - GPS coordinates (if provided), accuracy
   - User agent
   - Screenshot ID (if captured)
   - User ID (if authenticated)
3. Logs written to database asynchronously (non-blocking)
4. Log insertion completes in <10ms (does not block request)

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-010, MVP-011, MVP-012  
**Related Risks:** None  
**Reference:** [ROADMAP.md:337-363], [FEATURES.md:723-836]

---

#### REQ-F-028: IP Anonymization
**Description:** IP addresses must be anonymized before storage to comply with GDPR.

**Acceptance Criteria:**
1. IPv4: Last octet removed (e.g., `192.168.1.100` → `192.168.1.0`)
2. IPv6: Last 80 bits removed (e.g., `2001:db8::1` → `2001:db8::`)
3. Anonymization occurs before database insert
4. Full IP never stored in database
5. Anonymization function has unit tests

**Priority:** Must-have (M) - GDPR Requirement  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-011  
**Related Risks:** RISK-006 (GDPR non-compliance)  
**Reference:** [ROADMAP.md:344-349], [PITFALLS.md:644-783]

---

#### REQ-F-029: Log Retention Policy
**Description:** Access logs must be automatically deleted after retention period (90 days default).

**Acceptance Criteria:**
1. Cron job runs daily to delete logs older than retention period
2. Retention period configurable (environment variable, default 90 days)
3. Deletion query: `DELETE FROM access_logs WHERE timestamp < NOW() - INTERVAL '90 days'`
4. Deletion job logs number of rows deleted
5. Deletion job uses partitioning for performance (delete entire partitions)

**Priority:** Must-have (M) - GDPR Requirement  
**Phase:** Phase 4 (GDPR Compliance)  
**Related Tasks:** GDPR-007, GDPR-008  
**Related Risks:** RISK-006 (GDPR non-compliance)  
**Reference:** [ROADMAP.md:721-729], [SUMMARY.md:1130-1132]

---

#### REQ-F-030: Log Query API
**Description:** Admin UI must be able to query access logs with filtering, pagination, and search.

**Acceptance Criteria:**
1. API endpoint `GET /api/admin/access-logs`
2. Query parameters:
   - `site_id` (filter by site)
   - `decision` (allowed/denied)
   - `start_date`, `end_date` (date range)
   - `ip` (partial match)
   - `page`, `limit` (pagination)
3. Response includes logs array and total count
4. Query uses partitioning and indexes for performance (<100ms response time)
5. Only logs for user's assigned sites returned (RBAC enforcement)

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-012, MVP-019  
**Related Risks:** None  
**Reference:** [ROADMAP.md:350-363], [ROADMAP.md:409-421]

---

### Artifact Capture

#### REQ-F-031: Screenshot Capture on Denial
**Description:** When access is denied, system must capture a screenshot of the blocked page for audit purposes.

**Acceptance Criteria:**
1. Screenshot capture triggered asynchronously via BullMQ job queue
2. Job payload includes: site URL, user agent, viewport size, screenshot resolution
3. Playwright worker captures screenshot (headless Chromium)
4. Screenshot saved to S3 with key: `screenshots/{site_id}/{timestamp}_{uuid}.png`
5. Screenshot ID stored in access log entry
6. Capture completes in 1-5 seconds (background job, does not block request)
7. Request returns immediately with 403 Forbidden (screenshot captured async)

**Priority:** Should-have (S)  
**Phase:** Phase 4 (Artifacts & GDPR)  
**Related Tasks:** ART-001, ART-002, ART-003, ART-004, ART-005, ART-006, ART-007, ART-008  
**Related Risks:** RISK-005 (Sync screenshot blocks request for 1-5s)  
**Reference:** [ROADMAP.md:691-719], [STACK.md:95-157]

---

#### REQ-F-032: Screenshot Storage (S3)
**Description:** Screenshots must be stored in S3-compatible object storage with lifecycle policies.

**Acceptance Criteria:**
1. S3 bucket created for screenshot storage (MinIO for development, AWS S3 for production)
2. Screenshots uploaded with public-read ACL (or signed URL generation)
3. S3 lifecycle policy deletes screenshots after 90 days (matches log retention)
4. Screenshot URL stored in access log entry
5. Admin UI displays screenshot thumbnail in log detail view

**Priority:** Should-have (S)  
**Phase:** Phase 4 (Artifacts & GDPR)  
**Related Tasks:** ART-009, ART-010, ART-011, ART-012  
**Related Risks:** RISK-013 (S3 storage costs)  
**Reference:** [ROADMAP.md:750-773], [SUMMARY.md:1138-1141]

---

#### REQ-F-033: Screenshot Resolution Configuration
**Description:** Screenshot resolution must be configurable to balance visual quality and storage cost.

**Acceptance Criteria:**
1. Screenshot resolution configurable via environment variable (default 1280x720)
2. Supported resolutions: 1280x720 (720p), 1920x1080 (1080p)
3. Viewport size set in Playwright configuration
4. Screenshot quality set to 80% JPEG compression
5. Average file size: 200-500 KB (720p), 500-1000 KB (1080p)

**Priority:** Nice-to-have (N)  
**Phase:** Phase 4 (Artifacts & GDPR)  
**Related Tasks:** ART-006, ART-007  
**Related Risks:** RISK-013 (Storage costs)  
**Reference:** [ROADMAP.md:703-706], [SUMMARY.md:1151-1153]

---

## Non-Functional Requirements

### Performance

#### REQ-NF-001: Site Resolution Performance
**Description:** Site resolution from hostname must complete in <1ms for cache hits.

**Acceptance Criteria:**
1. LRU cache (in-memory) hit returns site in <1ms (p95)
2. Redis cache hit returns site in <10ms (p95)
3. Database query (cache miss) returns site in <50ms (p95)
4. Cache hit rate >99% in steady state (after warmup)
5. Performance monitored with Prometheus metrics

**Priority:** Must-have (M)  
**Phase:** Phase 3 (Multi-Site & RBAC)  
**Related Tasks:** MULTI-003, MULTI-004, MULTI-005  
**Related Risks:** RISK-010 (Cache invalidation bugs)  
**Reference:** [ROADMAP.md:645-668], [ARCHITECTURE.md:17-145]

---

#### REQ-NF-002: Request Latency
**Description:** API requests must complete in <200ms (p95) for normal access control flow.

**Acceptance Criteria:**
1. Site resolution: <1ms (cache hit)
2. IP access control: <2ms (MaxMind lookup + rule evaluation)
3. GPS access control: <5ms (PostGIS query with GIST index)
4. Access log write: <10ms (async, non-blocking)
5. Total request latency: <200ms p95, <500ms p99
6. Latency monitored with Prometheus histograms

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** OPS-008, OPS-009, OPS-010  
**Related Risks:** RISK-009 (Missing GIST index causes 100ms+ queries)  
**Reference:** [ROADMAP.md:869-882], [SUMMARY.md:520-589]

---

#### REQ-NF-003: Throughput
**Description:** System must support 10,000 requests/minute (166 req/sec) per server instance.

**Acceptance Criteria:**
1. Single Fastify instance handles 10k req/min with <200ms p95 latency
2. Caching prevents database bottleneck (99% cache hit rate)
3. Database connection pool sized for peak load (20-50 connections)
4. Redis connection pool sized for peak load (10-20 connections)
5. Load testing validates throughput with realistic traffic patterns

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** OPS-008, OPS-009, OPS-010  
**Related Risks:** RISK-010 (Cache invalidation causes DB overload)  
**Reference:** [ROADMAP.md:869-882], [SUMMARY.md:520-589]

---

#### REQ-NF-004: Database Query Performance
**Description:** All database queries must complete in <50ms (p95) with proper indexing.

**Acceptance Criteria:**
1. Site lookup by hostname: <10ms (index on hostname)
2. PostGIS geofence query: <1ms (GIST index on geofence_polygon)
3. Access log query: <100ms (partitioning + indexes on site_id, timestamp)
4. MaxMind GeoIP lookup: <1ms (in-memory MMDB database)
5. All queries use EXPLAIN ANALYZE to verify index usage

**Priority:** Must-have (M)  
**Phase:** Phase 0 (Foundation - schema design), Phase 5 (Performance testing)  
**Related Tasks:** DEV-005, DEV-006, OPS-010  
**Related Risks:** RISK-009 (Missing GIST index)  
**Reference:** [ROADMAP.md:124-166], [STACK.md:89-189]

---

#### REQ-NF-005: Asynchronous Screenshot Capture
**Description:** Screenshot capture must not block request processing.

**Acceptance Criteria:**
1. Screenshot job enqueued in <5ms (BullMQ)
2. Request returns 403 Forbidden immediately (before screenshot completes)
3. Screenshot captured in background by worker process (1-5 seconds)
4. Worker failure does not affect request processing
5. Job queue metrics monitored (queue depth, processing time, failure rate)

**Priority:** Must-have (M)  
**Phase:** Phase 4 (Artifacts & GDPR)  
**Related Tasks:** ART-001, ART-002, ART-003, ART-008  
**Related Risks:** RISK-005 (Sync screenshot blocks request)  
**Reference:** [ROADMAP.md:691-719], [STACK.md:159-225]

---

### Security

#### REQ-NF-006: HTTPS Enforcement
**Description:** All production traffic must be encrypted with HTTPS (TLS 1.3).

**Acceptance Criteria:**
1. SSL certificates obtained from Let's Encrypt (automatic renewal)
2. HTTP requests redirected to HTTPS (301 Moved Permanently)
3. HSTS header sent with all responses (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
4. TLS 1.3 enabled, TLS 1.0/1.1 disabled
5. SSL Labs grade: A or higher

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** SEC-001, SEC-002, SEC-003  
**Related Risks:** RISK-003 (No HTTPS in development)  
**Reference:** [ROADMAP.md:812-827], [PITFALLS.md:15-83]

---

#### REQ-NF-007: SQL Injection Prevention
**Description:** All database queries must use parameterized queries to prevent SQL injection.

**Acceptance Criteria:**
1. All database queries use parameterized statements (no string concatenation)
2. ORM/query builder (Kysely or Prisma) enforces parameterization
3. User input validated and sanitized before use in queries
4. SQL injection tests included in security test suite
5. Static analysis (ESLint plugin) detects SQL injection vulnerabilities

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP - from day one)  
**Related Tasks:** MVP-001, MVP-003  
**Related Risks:** RISK-002 (SQL injection via IP input), RISK-007 (SQL injection in general)  
**Reference:** [ROADMAP.md:269-283], [PITFALLS.md:216-263]

---

#### REQ-NF-008: XSS Prevention
**Description:** All user-generated content must be sanitized to prevent cross-site scripting (XSS).

**Acceptance Criteria:**
1. React auto-escapes all user input (default behavior)
2. `dangerouslySetInnerHTML` never used with unsanitized input
3. Content-Security-Policy header configured (restrict inline scripts)
4. User input sanitized with DOMPurify (if HTML rendering required)
5. XSS tests included in security test suite

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** SEC-006, SEC-007  
**Related Risks:** None  
**Reference:** [ROADMAP.md:838-848]

---

#### REQ-NF-009: CSRF Protection
**Description:** All state-changing API requests must be protected against CSRF attacks.

**Acceptance Criteria:**
1. CSRF tokens generated and validated for all POST/PUT/PATCH/DELETE requests
2. Double-submit cookie pattern or synchronizer token pattern used
3. SameSite cookie attribute set to `Strict` or `Lax`
4. CSRF middleware configured in Fastify (`@fastify/csrf-protection`)
5. CSRF tests included in security test suite

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** SEC-006, SEC-007  
**Related Risks:** None  
**Reference:** [ROADMAP.md:838-848]

---

#### REQ-NF-010: Rate Limiting
**Description:** API endpoints must be rate-limited to prevent abuse and DoS attacks.

**Acceptance Criteria:**
1. Rate limiting configured per IP address (Redis-backed)
2. Limits:
   - Auth endpoints: 5 requests/minute (login, register)
   - Admin API: 100 requests/minute
   - Public API: 1000 requests/minute
3. Rate limit headers sent in response (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
4. 429 Too Many Requests returned when limit exceeded
5. Rate limiting tested with load testing tools

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** SEC-004, SEC-005  
**Related Risks:** RISK-008 (DDoS attack)  
**Reference:** [ROADMAP.md:828-837]

---

#### REQ-NF-011: Password Security
**Description:** User passwords must be hashed with bcrypt and strong policies enforced.

**Acceptance Criteria:**
1. Passwords hashed with bcrypt (cost factor 12)
2. Minimum password length: 8 characters
3. Password complexity enforced: at least one uppercase, lowercase, number (future enhancement)
4. Plain-text passwords never logged or stored
5. Password reset flow uses secure tokens (expiring, single-use)

**Priority:** Must-have (M)  
**Phase:** Phase 3 (Multi-Site & RBAC)  
**Related Tasks:** AUTH-001, AUTH-002  
**Related Risks:** None  
**Reference:** [ROADMAP.md:577-596]

---

### Privacy & GDPR Compliance

#### REQ-NF-012: Explicit Consent for GPS Collection
**Description:** Users must provide explicit consent before GPS coordinates are collected (GDPR Article 6).

**Acceptance Criteria:**
1. Consent modal displayed before GPS request
2. Modal explains: what data collected, why, how long stored, who has access
3. User must click "Accept" button (no pre-checked boxes)
4. Consent timestamp stored (client-side and server-side)
5. User can revoke consent at any time
6. If consent denied, GPS access control bypassed (access denied)

**Priority:** Must-have (M) - GDPR Legal Requirement  
**Phase:** Phase 4 (GDPR Compliance)  
**Related Tasks:** GDPR-002, GDPR-003, GEO-011  
**Related Risks:** RISK-006 (GDPR non-compliance - fines up to €20M)  
**Reference:** [ROADMAP.md:698-710], [PITFALLS.md:644-783]

---

#### REQ-NF-013: Data Retention Limits
**Description:** Personal data (GPS coordinates, IP addresses) must be deleted after retention period (GDPR Article 5).

**Acceptance Criteria:**
1. Access logs deleted after 90 days (configurable)
2. Screenshots deleted after 90 days (S3 lifecycle policy)
3. Cron job runs daily to enforce retention policy
4. Retention policy documented in privacy policy
5. Retention period justified by business need (audit trail)

**Priority:** Must-have (M) - GDPR Legal Requirement  
**Phase:** Phase 4 (GDPR Compliance)  
**Related Tasks:** GDPR-007, GDPR-008, ART-012  
**Related Risks:** RISK-006 (GDPR non-compliance)  
**Reference:** [ROADMAP.md:721-729], [SUMMARY.md:1130-1132]

---

#### REQ-NF-014: Right to Access (Data Export)
**Description:** Users must be able to export all personal data stored about them (GDPR Article 15).

**Acceptance Criteria:**
1. API endpoint `GET /api/user/data-export` (authenticated)
2. Response includes all user data: profile, access logs, screenshots
3. Data exported in machine-readable format (JSON)
4. Export includes data from all systems (database, S3)
5. Export completes in <30 seconds

**Priority:** Must-have (M) - GDPR Legal Requirement  
**Phase:** Phase 4 (GDPR Compliance)  
**Related Tasks:** GDPR-009, GDPR-010  
**Related Risks:** RISK-006 (GDPR non-compliance)  
**Reference:** [ROADMAP.md:730-739]

---

#### REQ-NF-015: Right to Erasure (Data Deletion)
**Description:** Users must be able to delete all personal data stored about them (GDPR Article 17).

**Acceptance Criteria:**
1. API endpoint `DELETE /api/user/data` (authenticated)
2. Deletion includes: user profile, access logs, screenshots (S3)
3. Deletion cascades to all related data
4. Deletion is irreversible (confirmation required in UI)
5. Deletion completes in <30 seconds
6. Deletion logged for audit purposes (anonymized log)

**Priority:** Must-have (M) - GDPR Legal Requirement  
**Phase:** Phase 4 (GDPR Compliance)  
**Related Tasks:** GDPR-011, GDPR-012  
**Related Risks:** RISK-006 (GDPR non-compliance)  
**Reference:** [ROADMAP.md:740-749]

---

#### REQ-NF-016: Privacy Policy
**Description:** Privacy policy must be drafted, reviewed by legal, and published before launch.

**Acceptance Criteria:**
1. Privacy policy document created (Markdown or HTML)
2. Policy explains: data collected, purpose, retention, third parties, user rights
3. Policy reviewed by legal counsel (GDPR compliance)
4. Policy published at `/privacy-policy` URL
5. Link to policy included in consent modals and footer

**Priority:** Must-have (M) - GDPR Legal Requirement  
**Phase:** Phase 4 (GDPR Compliance)  
**Related Tasks:** GDPR-001, GDPR-016  
**Related Risks:** RISK-006 (GDPR non-compliance)  
**Reference:** [ROADMAP.md:695-697], [SUMMARY.md:1166]

---

#### REQ-NF-017: Data Processing Agreements (DPAs)
**Description:** DPAs must be signed with all third-party data processors (GDPR Article 28).

**Acceptance Criteria:**
1. DPA signed with MaxMind (IP geolocation provider)
2. DPA signed with AWS (S3 storage provider)
3. DPA signed with Cloudflare (CDN/proxy, if used)
4. DPA signed with monitoring providers (Sentry, if used)
5. DPAs stored securely and accessible for audits

**Priority:** Must-have (M) - GDPR Legal Requirement  
**Phase:** Phase 4 (GDPR Compliance)  
**Related Tasks:** GDPR-013, GDPR-014, GDPR-015, GDPR-016  
**Related Risks:** RISK-006 (GDPR non-compliance)  
**Reference:** [ROADMAP.md:786-791], [SUMMARY.md:1172-1177]

---

### Scalability

#### REQ-NF-018: Multi-Tenancy
**Description:** System must support hosting 1000+ sites in a shared database with row-level isolation.

**Acceptance Criteria:**
1. All tables have `site_id` foreign key for row-level isolation
2. All queries filtered by `site_id` (no cross-site data leakage)
3. Database indexes include `site_id` for query performance
4. RBAC enforces access to assigned sites only
5. Scalability tested with 1000+ sites and 10k+ users

**Priority:** Must-have (M)  
**Phase:** Phase 3 (Multi-Site & RBAC)  
**Related Tasks:** MULTI-001, MULTI-006, MULTI-007  
**Related Risks:** None  
**Reference:** [ROADMAP.md:669-683], [ARCHITECTURE.md:303-384]

---

#### REQ-NF-019: Horizontal Scaling
**Description:** System must support horizontal scaling by adding more server instances (stateless architecture).

**Acceptance Criteria:**
1. Fastify instances are stateless (no in-process session storage)
2. LRU cache is per-instance (Redis provides shared cache layer)
3. Load balancer distributes traffic across instances (round-robin or least connections)
4. Database connection pooling supports multiple instances
5. Redis connection pooling supports multiple instances
6. Scaling tested with 2-4 instances

**Priority:** Should-have (S)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** OPS-008, OPS-009  
**Related Risks:** None  
**Reference:** [ROADMAP.md:869-882], [ARCHITECTURE.md:147-239]

---

#### REQ-NF-020: Database Partitioning
**Description:** Access logs table must use table partitioning to support billions of rows.

**Acceptance Criteria:**
1. Access logs partitioned by month (monthly partitions)
2. Partitions created automatically (cron job or trigger)
3. Old partitions dropped when retention period exceeded (90 days)
4. Queries optimized to target specific partitions (partition pruning)
5. Partitioning tested with 10M+ log entries

**Priority:** Should-have (S)  
**Phase:** Phase 0 (Foundation - schema design)  
**Related Tasks:** DEV-006  
**Related Risks:** None  
**Reference:** [ROADMAP.md:167-184], [STACK.md:89-189]

---

### Observability

#### REQ-NF-021: Metrics Collection
**Description:** System must collect and expose Prometheus metrics for monitoring.

**Acceptance Criteria:**
1. Metrics exposed at `/metrics` endpoint (Prometheus format)
2. Metrics collected:
   - Request rate (req/sec)
   - Request latency (p50, p95, p99 histograms)
   - Error rate (4xx, 5xx)
   - Cache hit rate (LRU, Redis)
   - Database query duration
   - Job queue depth and processing time
3. Metrics scraped by Prometheus server (15s interval)

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** MON-001, MON-002, MON-003  
**Related Risks:** None  
**Reference:** [ROADMAP.md:849-865]

---

#### REQ-NF-022: Logging
**Description:** System must emit structured JSON logs for aggregation and analysis.

**Acceptance Criteria:**
1. All logs emitted as JSON (use Pino logger in Fastify)
2. Log levels: DEBUG, INFO, WARN, ERROR
3. Log context includes: timestamp, level, message, request_id, user_id, site_id
4. Logs written to stdout (captured by container orchestrator)
5. Logs aggregated in centralized system (Loki, CloudWatch, or ELK)

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** MON-004, MON-005  
**Related Risks:** None  
**Reference:** [ROADMAP.md:849-865]

---

#### REQ-NF-023: Error Tracking
**Description:** Application errors must be captured and tracked with context for debugging.

**Acceptance Criteria:**
1. Error tracking service integrated (Sentry or Rollbar)
2. Uncaught exceptions reported with full stack trace
3. Error context includes: request_id, user_id, site_id, request URL, user agent
4. Error notifications sent to team (email, Slack)
5. Error dashboard shows error frequency, affected users, trends

**Priority:** Should-have (S)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** MON-006, MON-007, MON-008  
**Related Risks:** None  
**Reference:** [ROADMAP.md:866-868]

---

#### REQ-NF-024: Alerting
**Description:** System must send alerts when critical thresholds exceeded (high error rate, high latency, service down).

**Acceptance Criteria:**
1. Alertmanager configured with Prometheus (or CloudWatch Alarms)
2. Alerts defined:
   - Error rate >1% (5min window)
   - p95 latency >500ms (5min window)
   - Service down (healthcheck failing)
   - Cache hit rate <90%
   - Database connection pool exhausted
3. Alerts sent to team (email, Slack, PagerDuty)
4. Alert runbooks documented (how to investigate and resolve)

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** MON-001, MON-002, MON-003  
**Related Risks:** None  
**Reference:** [ROADMAP.md:849-865]

---

### Quality & Testing

#### REQ-NF-025: Test Coverage Gate (Production Readiness)
**Description:** CI must enforce a minimum unit test coverage threshold for services and utilities before production readiness is declared.

**Acceptance Criteria:**
1. CI fails when services/utils unit test coverage is below 80%
2. Coverage threshold configured in test runner and surfaced in CI logs
3. Coverage report stored as a CI artifact for review
4. Coverage gate maps to Phase 1 Success Criterion SC-1.10

**Priority:** Must-have (M)  
**Phase:** Phase 1 (MVP)  
**Related Tasks:** MVP-004, MVP-021, DEV-008  
**Related Risks:** RISK-011 (Insufficient test coverage)  
**Reference:** [ROADMAP.md:352-372]

---

### Reliability

#### REQ-NF-026: Healthcheck Endpoint
**Description:** System must expose healthcheck endpoint for load balancer and monitoring.

**Acceptance Criteria:**
1. Healthcheck endpoint at `GET /health`
2. Healthcheck verifies:
   - Database connection (simple query)
   - Redis connection (PING command)
   - MaxMind database loaded
3. Returns 200 OK if all checks pass
4. Returns 503 Service Unavailable if any check fails
5. Healthcheck completes in <100ms

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** SEC-008, SEC-009, SEC-010  
**Related Risks:** None  
**Reference:** [ROADMAP.md:849-854]

---

#### REQ-NF-027: Graceful Shutdown
**Description:** System must handle SIGTERM signal and gracefully shut down (drain connections, complete in-flight requests).

**Acceptance Criteria:**
1. SIGTERM handler registered in Fastify
2. On SIGTERM:
   - Stop accepting new requests (close HTTP server)
   - Wait for in-flight requests to complete (max 30s timeout)
   - Close database connections
   - Close Redis connections
   - Exit process with code 0
3. Kubernetes/Docker uses SIGTERM for graceful shutdown

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** SEC-010, SEC-011  
**Related Risks:** None  
**Reference:** [ROADMAP.md:855-861]

---

#### REQ-NF-028: Database Backups
**Description:** Database must be backed up daily with point-in-time recovery capability.

**Acceptance Criteria:**
1. Automated daily backups (pg_dump or AWS RDS automated backups)
2. Backups retained for 30 days
3. Point-in-time recovery enabled (Write-Ahead Logging)
4. Backup restoration tested monthly (verify data integrity)
5. Backup storage encrypted and access-controlled

**Priority:** Must-have (M)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** OPS-003, OPS-004, OPS-005  
**Related Risks:** RISK-012 (Data loss due to no backups)  
**Reference:** [ROADMAP.md:883-899]

---

#### REQ-NF-029: Disaster Recovery Plan
**Description:** Documented disaster recovery plan with RTO (Recovery Time Objective) and RPO (Recovery Point Objective).

**Acceptance Criteria:**
1. Disaster recovery runbook documented
2. RTO: 4 hours (time to restore service)
3. RPO: 24 hours (maximum data loss - daily backups)
4. Runbook includes:
   - Database restoration procedure
   - Service re-deployment procedure
   - DNS failover procedure (if multi-region)
   - Communication plan (status page, customer notifications)
5. DR plan tested annually

**Priority:** Should-have (S)  
**Phase:** Phase 5 (Production Hardening)  
**Related Tasks:** OPS-006, OPS-007  
**Related Risks:** RISK-012 (Data loss)  
**Reference:** [ROADMAP.md:900-912]

---

## Traceability Matrix

This matrix maps requirements to roadmap phases and tasks for full traceability.

### Functional Requirements to Tasks

| REQ-ID | Requirement | Priority | Phase | Related Tasks |
|---|---|---|---|---|
| REQ-F-001 | Site Creation | M | Phase 1 | MVP-001, MVP-002, MVP-003 |
| REQ-F-002 | Site Update | M | Phase 1 | MVP-001, MVP-002 |
| REQ-F-003 | Site Deletion | M | Phase 1 | MVP-001, MVP-002 |
| REQ-F-004 | Site Listing | M | Phase 1 | MVP-001, MVP-002, MVP-015 |
| REQ-F-005 | Site Resolution by Hostname | M | Phase 3 | MULTI-001, MULTI-002, MULTI-003, MULTI-004 |
| REQ-F-006 | Access Mode Configuration | M | Phase 1, 2 | MVP-002, GEO-004, GEO-018 |
| REQ-F-007 | IP Allowlist | M | Phase 1 | MVP-007, MVP-008, MVP-009 |
| REQ-F-008 | IP Denylist | M | Phase 1 | MVP-007, MVP-008, MVP-009 |
| REQ-F-009 | Country-Level IP Blocking | M | Phase 1 | MVP-005, MVP-007, MVP-009, DEV-009 |
| REQ-F-010 | VPN/Proxy Detection | S | Phase 1 | MVP-005, MVP-007, MVP-009, DEV-009 |
| REQ-F-011 | IP Extraction from Proxied Requests | M | Phase 1 | MVP-006, MVP-007 |
| REQ-F-012 | Polygon Geofencing | M | Phase 2 | GEO-001, GEO-006, GEO-007, GEO-014, GEO-015, GEO-016 |
| REQ-F-013 | Radius Geofencing | S | Phase 2 | GEO-001, GEO-006, GEO-007, GEO-014 |
| REQ-F-014 | GPS Accuracy Validation | M | Phase 2 | GEO-002, GEO-009, GEO-019 |
| REQ-F-015 | GPS-IP Cross-Validation | M | Phase 2 | GEO-003, GEO-005, GEO-020 |
| REQ-F-016 | GPS Consent Flow | M | Phase 4 | GDPR-002, GDPR-003, GEO-011 |
| REQ-F-017 | Site List View | M | Phase 1 | MVP-015, MVP-018 |
| REQ-F-018 | Site Editor Form | M | Phase 1, 2 | MVP-016, MVP-017, GEO-014, GEO-015, GEO-017, GEO-018 |
| REQ-F-019 | Geofence Map Drawing | M | Phase 2 | GEO-013, GEO-014, GEO-015, GEO-016, GEO-017 |
| REQ-F-020 | Access Logs Viewer | M | Phase 1 | MVP-019, MVP-020 |
| REQ-F-021 | Log Detail View | M | Phase 1, 4 | MVP-020, ART-011 |
| REQ-F-022 | User Registration | M | Phase 3 | AUTH-001, AUTH-002 |
| REQ-F-023 | User Login | M | Phase 3 | AUTH-001, AUTH-002, AUTH-003 |
| REQ-F-024 | Token Refresh | M | Phase 3 | AUTH-003, AUTH-004 |
| REQ-F-025 | Role-Based Access Control | M | Phase 3 | RBAC-001, RBAC-002, RBAC-003, RBAC-004, RBAC-005, RBAC-006 |
| REQ-F-026 | Site Admin Delegation | M | Phase 3 | RBAC-003, RBAC-004, RBAC-005, UI-007 |
| REQ-F-027 | Access Decision Logging | M | Phase 1 | MVP-010, MVP-011, MVP-012 |
| REQ-F-028 | IP Anonymization | M | Phase 1 | MVP-011 |
| REQ-F-029 | Log Retention Policy | M | Phase 4 | GDPR-007, GDPR-008 |
| REQ-F-030 | Log Query API | M | Phase 1 | MVP-012, MVP-019 |
| REQ-F-031 | Screenshot Capture on Denial | S | Phase 4 | ART-001, ART-002, ART-003, ART-004, ART-005, ART-006, ART-007, ART-008 |
| REQ-F-032 | Screenshot Storage (S3) | S | Phase 4 | ART-009, ART-010, ART-011, ART-012 |
| REQ-F-033 | Screenshot Resolution Configuration | N | Phase 4 | ART-006, ART-007 |

### Non-Functional Requirements to Tasks

| REQ-ID | Requirement | Priority | Phase | Related Tasks |
|---|---|---|---|---|
| REQ-NF-001 | Site Resolution Performance | M | Phase 3 | MULTI-003, MULTI-004, MULTI-005 |
| REQ-NF-002 | Request Latency | M | Phase 5 | OPS-008, OPS-009, OPS-010 |
| REQ-NF-003 | Throughput | M | Phase 5 | OPS-008, OPS-009, OPS-010 |
| REQ-NF-004 | Database Query Performance | M | Phase 0, 5 | DEV-005, DEV-006, OPS-010 |
| REQ-NF-005 | Asynchronous Screenshot Capture | M | Phase 4 | ART-001, ART-002, ART-003, ART-008 |
| REQ-NF-006 | HTTPS Enforcement | M | Phase 5 | SEC-001, SEC-002, SEC-003 |
| REQ-NF-007 | SQL Injection Prevention | M | Phase 1 | MVP-001, MVP-003 |
| REQ-NF-008 | XSS Prevention | M | Phase 5 | SEC-006, SEC-007 |
| REQ-NF-009 | CSRF Protection | M | Phase 5 | SEC-006, SEC-007 |
| REQ-NF-010 | Rate Limiting | M | Phase 5 | SEC-004, SEC-005 |
| REQ-NF-011 | Password Security | M | Phase 3 | AUTH-001, AUTH-002 |
| REQ-NF-012 | Explicit Consent for GPS | M | Phase 4 | GDPR-002, GDPR-003, GEO-011 |
| REQ-NF-013 | Data Retention Limits | M | Phase 4 | GDPR-007, GDPR-008, ART-012 |
| REQ-NF-014 | Right to Access (Data Export) | M | Phase 4 | GDPR-009, GDPR-010 |
| REQ-NF-015 | Right to Erasure (Data Deletion) | M | Phase 4 | GDPR-011, GDPR-012 |
| REQ-NF-016 | Privacy Policy | M | Phase 4 | GDPR-001, GDPR-016 |
| REQ-NF-017 | Data Processing Agreements | M | Phase 4 | GDPR-013, GDPR-014, GDPR-015, GDPR-016 |
| REQ-NF-018 | Multi-Tenancy | M | Phase 3 | MULTI-001, MULTI-006, MULTI-007 |
| REQ-NF-019 | Horizontal Scaling | S | Phase 5 | OPS-008, OPS-009 |
| REQ-NF-020 | Database Partitioning | S | Phase 0 | DEV-006 |
| REQ-NF-021 | Metrics Collection | M | Phase 5 | MON-001, MON-002, MON-003 |
| REQ-NF-022 | Logging | M | Phase 5 | MON-004, MON-005 |
| REQ-NF-023 | Error Tracking | S | Phase 5 | MON-006, MON-007, MON-008 |
| REQ-NF-024 | Alerting | M | Phase 5 | MON-001, MON-002, MON-003 |
| REQ-NF-025 | Test Coverage Gate (Production Readiness) | M | Phase 1 | MVP-004, MVP-021, DEV-008 |
| REQ-NF-026 | Healthcheck Endpoint | M | Phase 5 | SEC-008, SEC-009, SEC-010 |
| REQ-NF-027 | Graceful Shutdown | M | Phase 5 | SEC-010, SEC-011 |
| REQ-NF-028 | Database Backups | M | Phase 5 | OPS-003, OPS-004, OPS-005 |
| REQ-NF-029 | Disaster Recovery Plan | S | Phase 5 | OPS-006, OPS-007 |

### Requirements by Priority

**Must-Have (M):** 52 requirements  
**Should-Have (S):** 8 requirements  
**Nice-to-Have (N):** 1 requirement  
**Total:** 61 requirements

### Requirements by Phase

| Phase | Requirements Count | Must-Have | Should-Have | Nice-to-Have |
|---|---|---|---|---|
| Phase 0 | 2 | 2 | 0 | 0 |
| Phase 1 | 17 | 17 | 0 | 0 |
| Phase 2 | 8 | 7 | 1 | 0 |
| Phase 3 | 9 | 9 | 0 | 0 |
| Phase 4 | 14 | 11 | 2 | 1 |
| Phase 5 | 16 | 11 | 5 | 0 |
| **Cross-Phase** | Multiple | - | - | - |

---

## Appendix: Requirement Traceability to Risks

| Requirement | Risk ID | Risk Description |
|---|---|---|
| REQ-F-005 | RISK-010 | Cache invalidation bugs |
| REQ-F-010 | RISK-001 | VPN bypass |
| REQ-F-011 | RISK-001 | IP spoofing via X-Forwarded-For |
| REQ-F-012 | RISK-009 | Missing GIST index |
| REQ-F-013 | RISK-009 | Missing GIST index |
| REQ-F-015 | RISK-001 | GPS spoofing |
| REQ-F-016 | RISK-006 | GDPR non-compliance |
| REQ-F-023 | RISK-004 | JWT in localStorage |
| REQ-F-028 | RISK-006 | GDPR non-compliance |
| REQ-F-029 | RISK-006 | GDPR non-compliance |
| REQ-F-031 | RISK-005 | Sync screenshot blocks request |
| REQ-F-032 | RISK-013 | S3 storage costs |
| REQ-NF-001 | RISK-010 | Cache invalidation bugs |
| REQ-NF-004 | RISK-009 | Missing GIST index |
| REQ-NF-005 | RISK-005 | Sync screenshot blocks request |
| REQ-NF-006 | RISK-003 | No HTTPS in development |
| REQ-NF-007 | RISK-002, RISK-007 | SQL injection |
| REQ-NF-010 | RISK-008 | DDoS attack |
| REQ-NF-012 | RISK-006 | GDPR non-compliance |
| REQ-NF-013 | RISK-006 | GDPR non-compliance |
| REQ-NF-014 | RISK-006 | GDPR non-compliance |
| REQ-NF-015 | RISK-006 | GDPR non-compliance |
| REQ-NF-016 | RISK-006 | GDPR non-compliance |
| REQ-NF-017 | RISK-006 | GDPR non-compliance |
| REQ-NF-025 | RISK-011 | Insufficient test coverage |
| REQ-NF-028 | RISK-012 | Data loss due to no backups |
| REQ-NF-029 | RISK-012 | Data loss |

---

**Document Status:** Complete  
**Total Requirements:** 61 (33 Functional, 28 Non-Functional)  
**Next Review Date:** Before each phase kickoff  
**Change Control:** All requirement changes must be approved and documented in STATE.md change log
