# Implementation Roadmap: Geo-Fenced Multi-Site Webserver

**Version:** 1.0  
**Last Updated:** 2026-02-14  
**Total Duration:** 16-22 weeks (4-5.5 months)  
**Status:** Planning  

---

## Executive Summary

This roadmap defines a 6-phase implementation plan for building a geo-fenced multi-site webserver with IP and GPS-based access control. The plan is based on comprehensive research (see `.planning/research/SUMMARY.md`) and addresses critical risks early while delivering incremental value.

**Key Principles:**
- Each phase is independently testable and deployable
- High-risk items (GPS spoofing, GDPR, performance) addressed early
- Security and privacy built-in from Phase 1, not bolted on later
- Continuous testing and validation throughout

**Critical Success Factors:**
- Multi-layer caching (LRU + Redis + DB) for sub-millisecond site resolution
- Asynchronous screenshot capture (BullMQ) to prevent request blocking
- GPS cross-validation with IP geolocation to prevent spoofing
- GDPR compliance from day one (consent, retention, deletion)
- Spatial indexing (GIST) for sub-millisecond geofence queries

---

## Phase Overview

| Phase | Name | Duration | Goal | Risk | Dependencies |
|---|---|---|---|---|---|
| **0** | Foundation | 1-2 weeks | Development environment, architecture foundation | LOW | None |
| **1** | MVP - IP Access Control | 4-5 weeks | Single-site IP-based blocking with admin UI | LOW | Phase 0 |
| **2** | GPS Geofencing | 3-4 weeks | GPS-based access control with map UI | MEDIUM | Phase 1 |
| **3** | Multi-Site & RBAC | 3-4 weeks | Multi-tenancy, user management, caching | MEDIUM | Phase 1 |
| **4** | Artifacts & GDPR | 3-4 weeks | Screenshots, audit logs, GDPR compliance | HIGH | Phases 2, 3 |
| **5** | Production Hardening | 2-3 weeks | Security, monitoring, performance, deployment | MEDIUM | Phases 1-4 |

**Total Timeline:** 16-22 weeks  
**Critical Path:** Phase 0 → 1 → 2 → 3 → 4 → 5 (sequential)  
**Parallelizable:** Frontend/backend work within phases, monitoring setup in Phase 3

---

## Phase 0: Foundation & Architecture Setup

**Duration:** 1-2 weeks  
**Goal:** Establish development environment, project structure, and core architecture  
**Risk Level:** LOW  
**Dependencies:** None

### Objectives

1. **Development Environment:** Docker Compose stack with all services
2. **Project Structure:** Monorepo structure with backend, frontend, workers
3. **Database Foundation:** PostgreSQL + PostGIS with core schema
4. **CI/CD Pipeline:** GitHub Actions for testing and deployment
5. **Documentation:** Architecture decision records (ADRs)

### Tasks

#### Week 1: Environment & Project Setup
- [ ] **DEV-001:** Initialize Git repository with monorepo structure
  - `backend/` (Fastify API)
  - `frontend/` (React + TypeScript + Vite)
  - `workers/` (BullMQ screenshot worker)
  - `infrastructure/` (Docker Compose, Kubernetes manifests)
  - `.planning/` (roadmap, requirements, state tracking)
  
- [ ] **DEV-002:** Create Docker Compose stack
  - PostgreSQL 16.x with PostGIS 3.6.x
  - Redis 7.x (cache + job queue)
  - MinIO (S3-compatible artifact storage)
  - Fastify backend (Node.js 22.x LTS)
  - React frontend (dev server)
  - Screenshot worker
  
- [ ] **DEV-003:** Setup backend project (Fastify)
  - Initialize npm project with TypeScript
  - Install core dependencies: `fastify`, `@fastify/jwt`, `@fastify/cors`, `@fastify/helmet`
  - Configure TypeScript, ESLint, Prettier
  - Setup folder structure: `routes/`, `middleware/`, `services/`, `models/`
  
- [ ] **DEV-004:** Setup frontend project (React + Vite)
  - Initialize Vite project with React + TypeScript template
  - Install core dependencies: `react-query`, `react-router-dom`, `axios`
  - Configure TypeScript, ESLint, Prettier
  - Setup folder structure: `components/`, `pages/`, `hooks/`, `lib/`

#### Week 2: Database & CI/CD
- [ ] **DEV-005:** Create core database schema (migration 001)
  ```sql
  -- sites table with PostGIS columns
  CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    hostname VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    access_mode VARCHAR(20) NOT NULL DEFAULT 'disabled',
    ip_allowlist INET[],
    ip_denylist INET[],
    country_allowlist VARCHAR(2)[],
    country_denylist VARCHAR(2)[],
    block_vpn_proxy BOOLEAN DEFAULT false,
    geofence_type VARCHAR(20),
    geofence_polygon GEOGRAPHY(POLYGON, 4326),
    geofence_center GEOGRAPHY(POINT, 4326),
    geofence_radius_km NUMERIC(10, 2),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  
  -- Critical: GIST spatial index for performance
  CREATE INDEX idx_sites_hostname ON sites(hostname);
  CREATE INDEX idx_sites_enabled ON sites(enabled);
  CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_polygon);
  ```
  
- [ ] **DEV-006:** Create access_logs table with partitioning (migration 002)
  ```sql
  CREATE TABLE access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET NOT NULL,
    user_agent TEXT,
    url TEXT,
    allowed BOOLEAN NOT NULL,
    reason VARCHAR(100),
    ip_country VARCHAR(2),
    ip_city VARCHAR(100),
    ip_lat NUMERIC(10, 6),
    ip_lng NUMERIC(10, 6),
    gps_lat NUMERIC(10, 6),
    gps_lng NUMERIC(10, 6),
    gps_accuracy NUMERIC(10, 2),
    screenshot_url TEXT,
    CHECK (timestamp >= '2026-02-01')
  ) PARTITION BY RANGE (timestamp);
  
  -- Create first partition
  CREATE TABLE access_logs_2026_02 PARTITION OF access_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
  
  CREATE INDEX idx_access_logs_2026_02_site ON access_logs_2026_02(site_id, timestamp DESC);
  CREATE INDEX idx_access_logs_2026_02_allowed ON access_logs_2026_02(allowed);
  ```
  
- [ ] **DEV-007:** Setup database migration system
  - Use `node-pg-migrate` or custom migration runner
  - Create `migrations/` directory
  - Add migration commands to package.json
  
- [ ] **DEV-008:** Setup GitHub Actions CI/CD
  - Workflow: Lint → Test → Build → Deploy (dev)
  - Run on: push to `main`, pull requests
  - Build Docker images and push to registry
  
- [ ] **DEV-009:** Download MaxMind GeoLite2 databases
  - Sign up for free MaxMind account
  - Download GeoLite2-City.mmdb
  - Download GeoIP2-Anonymous-IP.mmdb (free trial or paid)
  - Add to `.gitignore`, document download process in README

### Deliverables

- [x] Docker Compose stack running all services
- [x] Backend API health check endpoint (`/health`) returns 200
- [x] Frontend dev server accessible at `http://localhost:5173`
- [x] PostgreSQL + PostGIS accessible with core schema created
- [x] Redis accessible and responding to PING
- [x] MinIO accessible at `http://localhost:9001` (console)
- [x] GitHub Actions pipeline runs successfully
- [x] MaxMind MMDB files available in `backend/data/maxmind/`

### Success Criteria

✅ **SC-0.1:** Docker Compose brings up all services without errors  
✅ **SC-0.2:** Backend `/health` endpoint returns `{"status":"healthy"}` with DB and Redis checks  
✅ **SC-0.3:** Frontend displays "Hello World" page  
✅ **SC-0.4:** Can insert and query a test site from `sites` table  
✅ **SC-0.5:** PostGIS `ST_Within` query executes successfully with GIST index  
✅ **SC-0.6:** CI/CD pipeline runs tests and builds Docker images  

### Testing Requirements

- **Unit Tests:** Database connection helper functions
- **Integration Tests:** Docker Compose stack health checks
- **Documentation:** README with setup instructions, architecture overview

### Risk Mitigation Checkpoints

| Risk | Mitigation | Checkpoint |
|---|---|---|
| PostGIS not configured correctly | Test spatial query in migration | DEV-006 |
| Docker Compose complexity | Document startup sequence, add health checks | DEV-002 |
| Missing dependencies | Lock file committed, CI validates | DEV-008 |

---

## Phase 1: MVP - IP-Based Access Control

**Duration:** 4-5 weeks  
**Goal:** Working prototype with IP-based access control and basic admin UI  
**Risk Level:** LOW  
**Dependencies:** Phase 0 complete

### Objectives

1. **Site Management:** CRUD API and database operations for sites
2. **IP Access Control:** MaxMind integration, allowlist/denylist, country filtering
3. **VPN Detection:** Anonymous IP database integration
4. **Access Logging:** Insert log entries on allow/block decisions
5. **Admin UI:** React SPA for site configuration and log viewing
6. **Security Foundation:** Parameterized queries, input validation

### Tasks

#### Week 1: Site Management API
- [ ] **MVP-001:** Create Site model and service layer
  - `services/SiteService.ts`: CRUD operations with parameterized queries
  - `models/Site.ts`: Type definitions and validation schemas
  
- [ ] **MVP-002:** Implement Site CRUD API routes
  - `POST /api/admin/sites` - Create site (later: super admin only)
  - `GET /api/admin/sites/:id` - Get site by ID
  - `GET /api/admin/sites` - List all sites
  - `PATCH /api/admin/sites/:id` - Update site settings
  - `DELETE /api/admin/sites/:id` - Delete site (later: super admin only)
  
- [ ] **MVP-003:** Add Fastify schema validation
  - Define JSON schemas for request/response validation
  - Validate: hostname format, IP address format (CIDR), country codes (ISO 3166-1 alpha-2)
  
- [ ] **MVP-004:** Write unit tests for Site service
  - Test CRUD operations
  - Test validation (invalid hostname, invalid IP, etc.)
  - Test SQL injection attempts (parameterized queries)

#### Week 2: IP Access Control Middleware
- [ ] **MVP-005:** Create MaxMind GeoIP service
  - `services/GeoIPService.ts`: Load MMDB files, lookup IP addresses
  - Singleton pattern to reuse reader instances
  - Cache lookups in-memory (LRU, 10k entries, 5min TTL)
  
- [ ] **MVP-006:** Implement IP extraction utility
  - `utils/getClientIP.ts`: Extract real IP from request
  - Handle `X-Forwarded-For`, `X-Real-IP` headers (trustProxy config)
  - Validate IP format, reject invalid IPs
  
- [ ] **MVP-007:** Create IP access control middleware
  - `middleware/ipAccessControl.ts`
  - Check IP allowlist/denylist (CIDR matching with `ipaddr.js`)
  - Check country allowlist/denylist (MaxMind lookup)
  - Check VPN/Proxy detection (Anonymous IP DB)
  - Return 403 with reason if blocked
  
- [ ] **MVP-008:** Integrate access control into request pipeline
  - Add middleware to Fastify hooks (after site resolution, later)
  - For MVP: Single site, no hostname-based routing yet
  
- [ ] **MVP-009:** Write integration tests for IP access control
  - Test allowlist: IP in allowlist → allowed
  - Test denylist: IP in denylist → blocked
  - Test country blocking: IP from blocked country → blocked
  - Test VPN detection: Known VPN IP → blocked (if enabled)

#### Week 3: Access Logging
- [ ] **MVP-010:** Create AccessLogService
  - `services/AccessLogService.ts`: Insert log entries
  - Log both allowed and blocked requests (configurable)
  - Include: IP, country, city, lat/lng, user agent, URL, reason
  
- [ ] **MVP-011:** Implement IP anonymization
  - `utils/anonymizeIP.ts`: Remove last octet (IPv4) or last 80 bits (IPv6)
  - Apply before storing in database (GDPR compliance)
  
- [ ] **MVP-012:** Create log query API
  - `GET /api/admin/access-logs` - Get access logs (paginated, 100 per page)
  - Query params: `?allowed=true/false&limit=100&offset=0`
  - Order by timestamp DESC
  
- [ ] **MVP-013:** Add log retention cron job placeholder
  - `jobs/logRetention.ts`: Cron job to delete logs older than 90 days
  - Use `node-cron` library
  - For now: Log message, implement deletion in Phase 4

#### Week 4: Admin UI - Site Configuration
- [ ] **MVP-014:** Create Admin UI layout
  - React Router with routes: `/sites`, `/sites/:id`, `/sites/:id/logs`
  - Navigation bar, sidebar
  - Responsive layout (Tailwind CSS or shadcn/ui)
  
- [ ] **MVP-015:** Implement Site List page
  - Fetch sites from `GET /api/admin/sites`
  - Display table: Name, Hostname, Access Mode, Enabled
  - Actions: View, Edit, Delete
  
- [ ] **MVP-016:** Implement Site Editor page
  - Form for site settings: Name, Hostname, Access Mode
  - IP allowlist/denylist editor (textarea, one IP/CIDR per line)
  - Country allowlist/denylist editor (multi-select dropdown, ISO codes)
  - VPN blocking toggle
  - Save button → `PATCH /api/admin/sites/:id`
  
- [ ] **MVP-017:** Implement IP list validation in UI
  - Validate IP addresses and CIDR notation
  - Highlight invalid entries in red
  - Show error messages
  
- [ ] **MVP-018:** Add React Query for data fetching
  - Setup query client with caching (5min stale time)
  - Use mutations for updates (optimistic updates)
  - Invalidate queries on mutation success

#### Week 5: Admin UI - Access Logs & Testing
- [ ] **MVP-019:** Implement Access Logs page
  - Fetch logs from `GET /api/admin/access-logs`
  - Display table: Timestamp, IP, Country, Allowed/Blocked, Reason
  - Pagination controls
  - Filter: Show only blocked / Show only allowed
  
- [ ] **MVP-020:** Add log detail view (modal or drawer)
  - Click log entry → Show full details
  - Display: IP geolocation (city, lat/lng), User Agent, URL, Reason
  
- [ ] **MVP-021:** End-to-end testing
  - Use Playwright for E2E tests
  - Test: Create site, configure IP allowlist, verify blocking
  - Test: View access logs, verify entries displayed
  
- [ ] **MVP-022:** Create deployment documentation
  - README: How to run locally (Docker Compose)
  - Environment variables: `DATABASE_URL`, `REDIS_URL`, `MAXMIND_DB_PATH`
  - API documentation (Swagger/OpenAPI spec)
  
- [ ] **MVP-023:** Deploy MVP to staging environment
  - Single VPS or cloud instance
  - Docker Compose deployment
  - Nginx reverse proxy (HTTP for now, HTTPS in Phase 5)

### Deliverables

- [x] Functional Site CRUD API with validation
- [x] IP-based access control middleware with MaxMind integration
- [x] Access logging to PostgreSQL (IP anonymized)
- [x] Admin UI for site configuration and log viewing
- [x] Deployment to staging environment

### Success Criteria

✅ **SC-1.1:** Can create a site via API with valid hostname and IP allowlist  
✅ **SC-1.2:** Request from allowed IP → 200 OK, logged in access_logs with `allowed=true`  
✅ **SC-1.3:** Request from blocked IP → 403 Forbidden, logged with `allowed=false` and reason  
✅ **SC-1.4:** Request from blocked country → 403 with reason "country_blocked"  
✅ **SC-1.5:** Request from VPN IP (if `block_vpn_proxy=true`) → 403 with reason "vpn_proxy_detected"  
✅ **SC-1.6:** Admin UI can create, edit, delete sites  
✅ **SC-1.7:** Admin UI displays access logs with pagination  
✅ **SC-1.8:** All SQL queries use parameterized queries (verified via code review)  
✅ **SC-1.9:** IP addresses in logs are anonymized (last octet removed)  
✅ **SC-1.10:** Unit test coverage > 80% for services and utilities  

### Testing Requirements

- **Unit Tests:** Site service, GeoIP service, IP anonymization, CIDR matching
- **Integration Tests:** API endpoints, middleware pipeline
- **E2E Tests:** Full flow from UI to database
- **Security Tests:** SQL injection attempts (parameterized queries), XSS in admin UI
- **Performance Tests:** MaxMind lookup latency (<1ms), access control middleware (<5ms)

### Risk Mitigation Checkpoints

| Risk | Mitigation | Checkpoint |
|---|---|---|
| SQL injection | Parameterized queries enforced, code review | MVP-001, MVP-004 |
| MaxMind MMDB not found | Health check verifies file exists | MVP-005 |
| X-Forwarded-For spoofing | Trust proxy only if configured, validate format | MVP-006 |
| Performance: DB query on every request | Will add caching in Phase 3 (acceptable for MVP) | Noted in Phase 3 plan |

---

## Phase 2: GPS Geofencing

**Duration:** 3-4 weeks  
**Goal:** Add GPS-based access control with polygon geofencing and map UI  
**Risk Level:** MEDIUM  
**Dependencies:** Phase 1 complete

### Objectives

1. **Browser Geolocation:** Frontend requests GPS with high accuracy
2. **PostGIS Geofencing:** ST_Within queries for polygon/radius checks
3. **GPS Accuracy Handling:** Buffering, rejection, multiple attempts
4. **GPS-IP Cross-Validation:** Detect spoofing (max 500km distance)
5. **Map UI:** Leaflet map with polygon/circle drawing (Leaflet Draw)
6. **Access Modes:** `ip_only`, `geo_only`, `both`, `disabled`

### Tasks

#### Week 1: Backend - GPS Geofencing Logic
- [ ] **GEO-001:** Create Geofence service
  - `services/GeofenceService.ts`: PostGIS ST_Within queries
  - Support polygon and radius geofences
  - GPS accuracy buffering (1.5x multiplier)
  
- [ ] **GEO-002:** Implement GPS validation utility
  - `utils/validateGPS.ts`: Validate lat/lng ranges, accuracy threshold
  - Reject accuracy > 100m (configurable)
  - Validate GeoJSON polygon format (no self-intersections)
  
- [ ] **GEO-003:** Implement GPS-IP cross-validation
  - `utils/validateGPSWithIP.ts`: Calculate distance between GPS and IP location
  - Haversine distance formula
  - Reject if distance > 500km (configurable)
  - Log suspicious activity (gps_ip_mismatch)
  
- [ ] **GEO-004:** Create GPS access control middleware
  - `middleware/gpsAccessControl.ts`
  - Extract GPS coordinates from request body (POST with lat/lng)
  - Check if GPS provided (required for `geo_only` and `both` modes)
  - PostGIS ST_Within query with accuracy buffering
  - Return 403 with reason if outside geofence
  
- [ ] **GEO-005:** Integrate GPS middleware into pipeline
  - Add after IP access control middleware
  - Conditional execution based on `access_mode`
  
- [ ] **GEO-006:** Update Site API to accept geofence data
  - `PATCH /api/admin/sites/:id` - Accept `geofence_polygon` (GeoJSON), `geofence_type`, `geofence_radius_km`
  - Validate GeoJSON format (Turf.js validation)
  - Auto-fix polygon winding order (Turf.js rewind)
  
- [ ] **GEO-007:** Write tests for geofence service
  - Test polygon geofence: Point inside → allowed, outside → blocked
  - Test radius geofence: Within radius → allowed, outside → blocked
  - Test GPS accuracy buffering: Low accuracy + inside buffer → allowed
  - Test GPS-IP cross-validation: GPS 1000km from IP → blocked (spoofing)

#### Week 2: Frontend - Browser Geolocation
- [ ] **GEO-008:** Create useGeolocation hook
  - `hooks/useGeolocation.ts`: Request location with high accuracy
  - Options: `enableHighAccuracy: true`, `timeout: 10000`, `maximumAge: 0`
  - Handle permission denied, position unavailable, timeout errors
  
- [ ] **GEO-009:** Implement accurate position helper
  - Request location multiple times (max 3 attempts)
  - Pick position with best accuracy
  - Stop if accuracy < 50m
  - Wait 2s between attempts
  
- [ ] **GEO-010:** Create GPS permission state checker
  - `utils/checkLocationPermission.ts`: Use Permissions API
  - Return state: `granted`, `denied`, `prompt`
  - Display helpful UI based on state
  
- [ ] **GEO-011:** Implement GPS consent modal
  - Modal shown before requesting GPS permission
  - Explain: "This site requires your location to verify access"
  - Checkbox: "I consent to GPS collection and storage"
  - Button: "Allow Location Access"
  
- [ ] **GEO-012:** Handle permission denial gracefully
  - If denied: Show instructions to re-enable in browser settings
  - Browser-specific instructions (Chrome, Firefox, Safari)
  - Fallback option: Contact admin or try IP-only mode (if available)

#### Week 3: Frontend - Map UI for Geofence Drawing
- [ ] **GEO-013:** Add Leaflet map dependencies
  - Install: `leaflet`, `react-leaflet`, `leaflet-draw`, `@types/leaflet`
  - Import Leaflet CSS in main.tsx
  
- [ ] **GEO-014:** Create GeofenceMap component
  - `components/GeofenceMap.tsx`: Leaflet map with drawing tools
  - Center on user location or default (San Francisco)
  - Zoom level: 12
  
- [ ] **GEO-015:** Integrate Leaflet Draw
  - Add DrawControl: Rectangle, Circle, Polygon
  - Disable: Marker, Polyline, CircleMarker
  - On draw created: Convert to GeoJSON, save to state
  
- [ ] **GEO-016:** Add geofence visualization
  - Display existing geofence polygon/circle on map
  - Highlight polygon boundary (blue stroke)
  - Allow editing existing geofence (edit mode)
  
- [ ] **GEO-017:** Validate drawn geofence
  - Check for self-intersections (Turf.js kinks)
  - Show error if invalid
  - Auto-fix winding order (Turf.js rewind)
  
- [ ] **GEO-018:** Add access mode selector to Site Editor
  - Dropdown: `disabled`, `ip_only`, `geo_only`, `both`
  - Show/hide IP and GPS sections based on mode
  - Update site on change

#### Week 4: Testing & GPS Accuracy Tuning
- [ ] **GEO-019:** Real-world GPS accuracy testing
  - Test on multiple devices (phone, tablet, laptop)
  - Test in different environments (outdoors, indoors, urban canyon)
  - Measure accuracy distribution (p50, p95, p99)
  - Document findings in `.planning/GPS_ACCURACY_REPORT.md`
  
- [ ] **GEO-020:** Tune GPS accuracy threshold
  - Based on real-world testing, adjust `MIN_ACCEPTABLE_ACCURACY`
  - Recommendation: 100m (start conservative)
  - Make configurable per site
  
- [ ] **GEO-021:** Implement GPS error messages
  - Clear error messages for each failure reason:
    - "GPS accuracy too low (150m). Please try outdoors."
    - "Location permission denied. Please enable in settings."
    - "GPS coordinates don't match IP location. Possible spoofing detected."
    - "You are outside the allowed area."
  
- [ ] **GEO-022:** End-to-end testing
  - Test polygon geofence: Draw polygon, test access inside/outside
  - Test radius geofence: Set radius, test access at boundary
  - Test GPS spoofing detection: Mock GPS far from IP location
  - Test permission denial: Deny permission, verify error message
  
- [ ] **GEO-023:** Update access logs to include GPS data
  - Add columns: `gps_lat`, `gps_lng`, `gps_accuracy` (already in schema)
  - Display in Admin UI logs table
  - Show GPS accuracy indicator (green < 50m, yellow < 100m, red > 100m)
  
- [ ] **GEO-024:** Performance testing
  - Measure PostGIS ST_Within query latency (should be <1ms with GIST index)
  - Verify GIST index is being used (EXPLAIN ANALYZE)
  - Load test: 1000 GPS checks/second

### Deliverables

- [x] GPS-based access control middleware
- [x] GPS-IP cross-validation (anti-spoofing)
- [x] Admin UI map for drawing geofence polygons/circles
- [x] Browser geolocation integration with consent
- [x] Access modes: `ip_only`, `geo_only`, `both`, `disabled`
- [x] GPS accuracy report based on real-world testing

### Success Criteria

✅ **SC-2.1:** User inside polygon geofence → 200 OK (with GPS accuracy < 100m)  
✅ **SC-2.2:** User outside polygon geofence → 403 "outside_geofence"  
✅ **SC-2.3:** User with GPS accuracy > 100m → 403 "gps_accuracy_too_low"  
✅ **SC-2.4:** GPS coordinates 600km from IP location → 403 "gps_ip_mismatch"  
✅ **SC-2.5:** User denies GPS permission → Clear error message with instructions  
✅ **SC-2.6:** Admin can draw polygon on map and save geofence  
✅ **SC-2.7:** PostGIS ST_Within query executes in <1ms (verified via EXPLAIN ANALYZE)  
✅ **SC-2.8:** Access mode `both` requires IP AND GPS to pass  
✅ **SC-2.9:** Access mode `geo_only` skips IP checks  
✅ **SC-2.10:** GPS coordinates logged in access_logs with accuracy  

### Testing Requirements

- **Unit Tests:** Geofence service, GPS validation, distance calculation
- **Integration Tests:** GPS middleware pipeline, API endpoints
- **E2E Tests:** Full flow from GPS request to block/allow decision
- **Real-World Tests:** GPS accuracy testing (documented)
- **Performance Tests:** PostGIS query latency, GIST index verification
- **Security Tests:** GPS spoofing detection, GPS-IP distance validation

### Risk Mitigation Checkpoints

| Risk | Mitigation | Checkpoint |
|---|---|---|
| GPS accuracy too low | Accuracy threshold + buffering + multiple attempts | GEO-001, GEO-009, GEO-020 |
| GPS spoofing | GPS-IP cross-validation (max 500km) | GEO-003, GEO-007 |
| User denies permission | Clear error messages + fallback instructions | GEO-010, GEO-012 |
| Polygon winding order wrong | Auto-fix with Turf.js rewind | GEO-006, GEO-017 |
| PostGIS query slow | Verify GIST index used, load testing | GEO-024 |

---

## Phase 3: Multi-Site & RBAC

**Duration:** 3-4 weeks  
**Goal:** Support multiple sites with independent configurations and role-based access control  
**Risk Level:** MEDIUM  
**Dependencies:** Phase 1 complete (database schema, site API)

### Objectives

1. **Multi-Site Hosting:** Hostname-based site resolution
2. **User Management:** Registration, login, JWT authentication
3. **RBAC:** Super admin, site admin, viewer roles
4. **Site Delegation:** Super admins assign site admins
5. **Multi-Layer Caching:** LRU + Redis for site resolution (99% hit rate)
6. **Cache Invalidation:** Pub/sub pattern for multi-instance sync

### Tasks

#### Week 1: User Management & Authentication
- [ ] **AUTH-001:** Create users table (migration 003)
  ```sql
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    global_role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX idx_users_email ON users(email);
  ```
  
- [ ] **AUTH-002:** Create user_site_roles table (migration 004)
  ```sql
  CREATE TABLE user_site_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- 'admin', 'viewer'
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, site_id)
  );
  CREATE INDEX idx_user_site_roles_user ON user_site_roles(user_id);
  CREATE INDEX idx_user_site_roles_site ON user_site_roles(site_id);
  ```
  
- [ ] **AUTH-003:** Create refresh_tokens table (migration 005)
  ```sql
  CREATE TABLE refresh_tokens (
    token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
  CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
  ```
  
- [ ] **AUTH-004:** Create AuthService
  - `services/AuthService.ts`: Password hashing (bcrypt), user creation, login
  - Hash passwords with bcrypt (12 rounds)
  - Validate email format, password strength (min 8 chars)
  
- [ ] **AUTH-005:** Implement registration endpoint
  - `POST /api/auth/register` - Create new user (email, password)
  - Return 201 with user ID
  - First user automatically becomes super_admin (migration script)
  
- [ ] **AUTH-006:** Implement login endpoint
  - `POST /api/auth/login` - Validate credentials, generate tokens
  - Access token: JWT, 15min expiry, contains user ID, email, role, sites
  - Refresh token: UUID, 7 day expiry, stored in database
  - Set refresh token in HttpOnly cookie (`sameSite: 'strict'`, `secure: true`)
  - Return access token in response body
  
- [ ] **AUTH-007:** Implement token refresh endpoint
  - `POST /api/auth/refresh` - Validate refresh token, generate new access token
  - Read refresh token from cookie
  - Validate token exists in database and not expired
  - Generate new access token with updated user data (sites may have changed)
  
- [ ] **AUTH-008:** Create JWT verification middleware
  - `middleware/authenticateJWT.ts`: Verify JWT from Authorization header
  - Attach `request.user` with decoded payload (user ID, email, role, sites)
  - Return 401 if token invalid or expired

#### Week 2: RBAC & Site Delegation
- [ ] **RBAC-001:** Create RBAC middleware
  - `middleware/requireRole.ts`: Check user has required role(s)
  - Example: `requireRole('super_admin', 'site_admin')`
  
- [ ] **RBAC-002:** Create site access middleware
  - `middleware/requireSiteAccess.ts`: Check user can access site
  - Super admin: Access all sites
  - Site admin/viewer: Access only assigned sites (check `user_site_roles`)
  - Attach `request.siteRole` (admin or viewer)
  
- [ ] **RBAC-003:** Protect existing Site API endpoints
  - `POST /api/admin/sites` - Require super_admin
  - `GET /api/admin/sites` - Filter by user's accessible sites
  - `GET /api/admin/sites/:id` - Require site access (super_admin or assigned)
  - `PATCH /api/admin/sites/:id` - Require super_admin or site_admin role
  - `DELETE /api/admin/sites/:id` - Require super_admin
  
- [ ] **RBAC-004:** Create site delegation endpoints
  - `POST /api/admin/sites/:id/admins` - Grant site role (super_admin only)
    - Body: `{ userId, role: 'admin' | 'viewer' }`
  - `GET /api/admin/sites/:id/admins` - List site admins (super_admin, site_admin)
  - `DELETE /api/admin/sites/:id/admins/:userId` - Revoke site role (super_admin only)
  
- [ ] **RBAC-005:** Update JWT payload to include sites
  - Include sites map in JWT: `{ siteId: role, ... }`
  - Query `user_site_roles` on login and refresh
  - Middleware can check site access from JWT (no DB query)
  
- [ ] **RBAC-006:** Write tests for RBAC
  - Test: Super admin can access all sites
  - Test: Site admin can only access assigned sites
  - Test: Viewer can read but not modify
  - Test: Non-assigned user gets 403 on site access

#### Week 3: Multi-Site Hosting & Site Resolution
- [ ] **MULTI-001:** Create site resolution middleware
  - `middleware/siteResolution.ts`: Lookup site by request hostname
  - Extract hostname from `request.hostname`
  - Query sites table: `SELECT * FROM sites WHERE hostname = $1`
  - Attach `request.site` with site config
  - Return 404 if site not found
  
- [ ] **MULTI-002:** Implement LRU memory cache
  - `services/CacheService.ts`: In-memory cache for site configs
  - Use `lru-cache` library (max 1000 items, 60s TTL)
  - Cache key: hostname
  - Cache value: site object
  
- [ ] **MULTI-003:** Implement Redis cache layer
  - Add Redis caching to site resolution
  - Check memory cache → Redis cache → database
  - TTL: 300s (5 minutes) in Redis
  - Populate memory cache on Redis hit
  
- [ ] **MULTI-004:** Implement cache warming
  - `utils/warmCache.ts`: Preload popular sites on startup
  - Query: `SELECT * FROM sites WHERE enabled = true ORDER BY request_count DESC LIMIT 100`
  - Populate memory and Redis caches
  - Run on `onReady` Fastify hook
  
- [ ] **MULTI-005:** Implement cache invalidation
  - On site update: Invalidate memory and Redis caches
  - Publish cache invalidation event to Redis pub/sub
  - Subscribe to invalidation events in all instances
  - Clear memory cache on event received
  
- [ ] **MULTI-006:** Add cache hit rate tracking
  - Increment counters: `cacheHits`, `cacheMisses`
  - Expose metrics endpoint: `GET /metrics` (cache hit rate, cache size)
  - Alert if hit rate < 95%
  
- [ ] **MULTI-007:** Update access control middleware to use `request.site`
  - IP and GPS middleware read site config from `request.site` (cached)
  - No direct database queries in hot path

#### Week 4: Admin UI Updates & Testing
- [ ] **UI-001:** Add user registration/login pages
  - `/login` page: Email, password, login button
  - `/register` page: Email, password, confirm password
  - Store access token in React state (memory)
  - Refresh token stored in HttpOnly cookie (automatic)
  
- [ ] **UI-002:** Create auth context and hooks
  - `contexts/AuthContext.tsx`: Manage auth state
  - `hooks/useAuth.ts`: Login, logout, refresh, current user
  - Auto-refresh access token on mount (if refresh token exists)
  
- [ ] **UI-003:** Add protected route wrapper
  - Redirect to `/login` if not authenticated
  - Check user role for admin routes
  
- [ ] **UI-004:** Update Site List to show only accessible sites
  - Filter sites based on user's role
  - Super admin: Show all sites
  - Site admin/viewer: Show only assigned sites
  
- [ ] **UI-005:** Add user management page (super admin only)
  - `/admin/users` - List all users
  - Assign site roles to users
  - View user's assigned sites
  
- [ ] **UI-006:** Add site delegation UI
  - On Site Editor page: "Manage Admins" section
  - List current admins/viewers
  - Add new admin/viewer (email search, role selector)
  - Remove admin/viewer
  
- [ ] **UI-007:** End-to-end testing
  - Test: Super admin can access all sites
  - Test: Site admin can only edit assigned sites
  - Test: Viewer can view but not edit
  - Test: Cache hit rate > 95% under load
  
- [ ] **UI-008:** Load testing with caching
  - Use Artillery or k6 to simulate 1000 req/s
  - Verify cache hit rate > 95%
  - Verify p95 latency < 10ms for cached site resolution
  - Verify database query count is <1% of total requests

### Deliverables

- [x] User registration, login, JWT authentication
- [x] RBAC with super admin, site admin, viewer roles
- [x] Site delegation (assign admins to sites)
- [x] Multi-site hosting with hostname-based routing
- [x] Multi-layer caching (LRU + Redis + DB) with 99% hit rate
- [x] Cache invalidation with pub/sub
- [x] Admin UI for user management and site delegation

### Success Criteria

✅ **SC-3.1:** User can register, login, and receive JWT access token  
✅ **SC-3.2:** Access token expires after 15min, refresh token works to get new access token  
✅ **SC-3.3:** Super admin can create sites, assign site admins  
✅ **SC-3.4:** Site admin can only edit assigned sites, not others  
✅ **SC-3.5:** Viewer can view site settings and logs but cannot modify  
✅ **SC-3.6:** Multiple sites (2+) can be accessed via different hostnames  
✅ **SC-3.7:** Cache hit rate > 95% for site resolution  
✅ **SC-3.8:** Cache invalidation works across multiple instances (tested with 2 instances)  
✅ **SC-3.9:** Site resolution latency < 1ms (p95) with cache hit  
✅ **SC-3.10:** Load test: 1000 req/s with <10ms p95 latency  

### Testing Requirements

- **Unit Tests:** Auth service (bcrypt), cache service, RBAC middleware
- **Integration Tests:** Login flow, JWT refresh, site delegation API
- **E2E Tests:** Full RBAC flow (super admin, site admin, viewer)
- **Performance Tests:** Cache hit rate, site resolution latency, load testing
- **Security Tests:** JWT verification, role enforcement, XSS in auth forms

### Risk Mitigation Checkpoints

| Risk | Mitigation | Checkpoint |
|---|---|---|
| JWT in localStorage (XSS) | Access token in memory, refresh token in HttpOnly cookie | AUTH-006, UI-001 |
| Cache invalidation bugs | Pub/sub pattern, short TTL (60s memory, 300s Redis) | MULTI-005 |
| Performance without cache | Cache warming, hit rate monitoring, alerts | MULTI-004, MULTI-006 |
| Password storage | bcrypt with 12 rounds | AUTH-004 |
| RBAC bypass | Middleware enforces roles on every protected route | RBAC-003, RBAC-006 |

---

## Phase 4: Artifacts & GDPR Compliance

**Duration:** 3-4 weeks  
**Goal:** Screenshot capture, audit logs, and full GDPR compliance  
**Risk Level:** HIGH (legal compliance)  
**Dependencies:** Phase 2 (GPS), Phase 3 (auth, RBAC)

### Objectives

1. **Async Screenshot Capture:** BullMQ + Playwright (1-5s, non-blocking)
2. **S3 Artifact Storage:** MinIO (dev), AWS S3 (prod), pre-signed URLs
3. **GDPR Consent:** Explicit consent before GPS collection
4. **Data Retention:** Auto-delete logs after 90 days
5. **Data Rights:** Export and deletion endpoints (GDPR Articles 15, 17)
6. **Privacy Policy:** Draft privacy policy document
7. **Legal Review:** GDPR compliance review (external lawyer)

### Tasks

#### Week 1: Async Screenshot Capture
- [ ] **ART-001:** Setup BullMQ job queue
  - `workers/screenshot-worker.ts`: BullMQ worker process
  - Queue name: `screenshots`
  - Redis connection (shared with cache)
  
- [ ] **ART-002:** Create screenshot service
  - `services/ScreenshotService.ts`: Enqueue screenshot jobs
  - `enqueueScreenshot(siteId, url, reason, logId)`: Add job to queue
  - Job options: 3 retries, exponential backoff (2s, 4s, 8s), 15s timeout
  
- [ ] **ART-003:** Implement Playwright screenshot worker
  - Launch headless Chromium on worker startup (reuse browser instance)
  - On job: Navigate to URL, wait for networkidle, capture full-page screenshot
  - Timeout: 10s navigation, 15s total job
  - Handle errors: Page not found, timeout, network error
  
- [ ] **ART-004:** Integrate S3 upload
  - Upload screenshot to MinIO (dev) or AWS S3 (prod)
  - Key format: `screenshots/blocked/{siteId}/{timestamp}-{reason}.png`
  - Content-Type: `image/png`
  - Return S3 URL or object key
  
- [ ] **ART-005:** Update access logs with screenshot URL
  - After upload: `UPDATE access_logs SET screenshot_url = $1 WHERE id = $2`
  - Retry on failure (job retry mechanism)
  
- [ ] **ART-006:** Update access logging to enqueue screenshots
  - In `logBlockedAccess()`: Call `enqueueScreenshot()` after inserting log
  - Non-blocking: Return immediately, screenshot processed async
  
- [ ] **ART-007:** Test screenshot capture
  - Test: Block access, verify screenshot job enqueued
  - Test: Screenshot captured within 5 seconds
  - Test: Screenshot URL updated in access_logs
  - Test: Retry on failure (simulate timeout, network error)
  - Test: No request blocking (latency <10ms)

#### Week 2: S3 & Artifact Management
- [ ] **ART-008:** Create S3 service
  - `services/S3Service.ts`: Upload, download, delete, generate pre-signed URLs
  - Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
  - Support both MinIO (dev) and AWS S3 (prod) via env config
  
- [ ] **ART-009:** Implement pre-signed URL generation
  - Generate temporary URLs (1 hour expiry) for artifact download
  - Prevents direct S3 access, enforces RBAC
  
- [ ] **ART-010:** Create artifact API endpoints
  - `GET /api/admin/sites/:id/artifacts` - List artifacts (screenshots) for site
  - `GET /api/artifacts/:key` - Get pre-signed URL for download
  - Require site access (super_admin or assigned admin/viewer)
  
- [ ] **ART-011:** Validate artifact access
  - Extract site ID from artifact key: `screenshots/blocked/{siteId}/...`
  - Verify user has access to that site
  - Return 403 if not authorized
  
- [ ] **ART-012:** Implement S3 lifecycle policy (AWS S3 only)
  - Auto-delete artifacts after 90 days
  - Lifecycle rule: Delete objects with prefix `screenshots/` after 90 days
  - For MinIO: Implement manual cleanup cron job
  
- [ ] **ART-013:** Add artifact viewer to Admin UI
  - On Access Logs page: Click "View Screenshot" button (if screenshot_url exists)
  - Fetch pre-signed URL from API
  - Display screenshot in modal or new tab

#### Week 3: GDPR Compliance
- [ ] **GDPR-001:** Create GDPR consent modal component
  - `components/GDPRConsentModal.tsx`: Modal shown before GPS request
  - Content:
    - "This site requires your precise location (GPS coordinates) to verify access."
    - "We will store your location data for audit purposes (90 days)."
    - "You can withdraw consent and delete your data at any time."
  - Checkbox: "I consent to collection and storage of my GPS coordinates" (required)
  - Button: "Allow Location Access"
  
- [ ] **GDPR-002:** Integrate consent modal into geolocation flow
  - Show modal before calling `navigator.geolocation.getCurrentPosition()`
  - Store consent in local state (not persisted, required on each visit)
  - If consent denied: Do not request GPS, show "GPS required" message
  
- [ ] **GDPR-003:** Draft privacy policy
  - Document in `.planning/PRIVACY_POLICY.md`
  - Sections:
    - What data we collect (IP, GPS, user agent, cookies)
    - Why we collect it (access control, audit logs)
    - How long we store it (90 days for logs, 7 days for refresh tokens)
    - Who has access (super admins, assigned site admins/viewers)
    - Your rights (access, deletion, export)
    - Third-party processors (MaxMind, AWS S3)
    - Contact information
  
- [ ] **GDPR-004:** Implement data retention cron job
  - Update `jobs/logRetention.ts`: Delete logs older than 90 days
  - Query: `DELETE FROM access_logs WHERE timestamp < NOW() - INTERVAL '90 days'`
  - Also delete associated screenshots from S3
  - Run daily at 2 AM
  
- [ ] **GDPR-005:** Implement data export endpoint (Right to Access)
  - `GET /api/user/data-export` - Export all user data as JSON
  - Include: User profile, access logs (if user authenticated when accessing sites)
  - Return ZIP file with JSON data
  
- [ ] **GDPR-006:** Implement data deletion endpoint (Right to Erasure)
  - `DELETE /api/user/data` - Delete user account and all associated data
  - Delete: User record, user_site_roles, refresh_tokens
  - Delete access logs: If logs linked to user account (optional, discuss anonymization)
  - Return 200 OK with confirmation message
  
- [ ] **GDPR-007:** Add consent withdrawal mechanism
  - User can revoke GPS consent (site switches to IP-only mode for that user)
  - Implementation: Cookie or localStorage flag (user-specific)
  - If consent withdrawn: Skip GPS check, use IP-only mode
  
- [ ] **GDPR-008:** Add privacy policy link to UI
  - Footer: "Privacy Policy" link
  - Privacy policy page: Render `.planning/PRIVACY_POLICY.md` as HTML
  
- [ ] **GDPR-009:** Add cookie notice
  - Banner: "We use cookies for authentication (refresh token)"
  - Link to privacy policy
  - Accept button (dismiss banner)

#### Week 4: Legal Review & Testing
- [ ] **GDPR-010:** GDPR compliance checklist review
  - Review checklist in `.planning/research/SUMMARY.md` (Section 7)
  - Ensure all items completed or documented
  
- [ ] **GDPR-011:** Schedule legal review (external GDPR lawyer)
  - Share privacy policy, consent flow, data retention policy
  - Review: Explicit consent mechanism, data export/deletion endpoints
  - Review: DPAs with MaxMind, AWS (confirm SCCs for EU-US transfers)
  - Get sign-off or feedback for changes
  
- [ ] **GDPR-012:** Implement legal review feedback
  - Update privacy policy based on lawyer feedback
  - Adjust consent flow if needed
  - Update data retention or export/deletion logic
  
- [ ] **GDPR-013:** Test data export functionality
  - Create test user, generate access logs
  - Export data, verify all data included
  - Verify format (JSON, readable)
  
- [ ] **GDPR-014:** Test data deletion functionality
  - Create test user, assign to site, generate access logs
  - Delete user account
  - Verify: User deleted, roles deleted, tokens deleted
  - Verify: Access logs anonymized or deleted (based on policy)
  
- [ ] **GDPR-015:** Test screenshot + S3 lifecycle
  - Block access, verify screenshot captured and uploaded
  - Verify screenshot URL in access logs
  - Verify pre-signed URL works and expires after 1 hour
  - Simulate 90-day deletion (manually trigger or wait)
  
- [ ] **GDPR-016:** Document GDPR compliance
  - Create `.planning/GDPR_COMPLIANCE.md`
  - Document: Consent flow, data retention, export/deletion, DPAs
  - Include screenshots of UI flows
  - Sign-off from legal review

### Deliverables

- [x] Async screenshot capture (BullMQ + Playwright)
- [x] S3 artifact storage with pre-signed URLs
- [x] GDPR consent modal and flow
- [x] Data retention cron job (90 days)
- [x] Data export and deletion endpoints
- [x] Privacy policy document
- [x] Legal review completed and feedback implemented
- [x] GDPR compliance documentation

### Success Criteria

✅ **SC-4.1:** Screenshot captured within 5 seconds of block event  
✅ **SC-4.2:** No request blocking due to screenshot capture (latency <10ms)  
✅ **SC-4.3:** Screenshot uploaded to S3 and URL stored in access_logs  
✅ **SC-4.4:** Pre-signed URL generated and expires after 1 hour  
✅ **SC-4.5:** 100% of GPS requests preceded by consent modal  
✅ **SC-4.6:** User can export all their data as JSON  
✅ **SC-4.7:** User can delete their account and all associated data  
✅ **SC-4.8:** Logs older than 90 days automatically deleted (tested via manual trigger)  
✅ **SC-4.9:** Privacy policy accessible and clearly explains data collection  
✅ **SC-4.10:** Legal review completed with sign-off or action items documented  

### Testing Requirements

- **Unit Tests:** Screenshot service, S3 service, data export/deletion logic
- **Integration Tests:** BullMQ worker, S3 upload/download, artifact API
- **E2E Tests:** Full screenshot flow (block → enqueue → capture → upload → view)
- **GDPR Tests:** Consent flow, data export, data deletion, retention cron job
- **Performance Tests:** Screenshot capture latency, job queue throughput
- **Security Tests:** Pre-signed URL expiry, artifact access control (RBAC)

### Risk Mitigation Checkpoints

| Risk | Mitigation | Checkpoint |
|---|---|---|
| Sync screenshot blocks requests | Async job queue (BullMQ), tested latency <10ms | ART-002, ART-006, ART-007 |
| Playwright crashes/hangs | Timeout (10s nav, 15s job), retry 3x, graceful degradation | ART-003 |
| GDPR non-compliance | Legal review, consent flow, retention, export/deletion | GDPR-001 to GDPR-016 |
| DPAs not signed | Document DPA requirements, contact vendors | GDPR-011 |
| S3 costs explode | Lifecycle policy (90 days), monitoring | ART-012 |

---

## Phase 5: Production Hardening

**Duration:** 2-3 weeks  
**Goal:** Security, monitoring, scalability, and operational readiness for production launch  
**Risk Level:** MEDIUM  
**Dependencies:** All features implemented (Phases 1-4)

### Objectives

1. **HTTPS Enforcement:** Let's Encrypt SSL, HSTS header
2. **Rate Limiting:** Application + Nginx rate limits (DDoS prevention)
3. **CSRF Protection:** SameSite cookies, double-submit pattern
4. **Monitoring:** Health checks, Prometheus metrics, Sentry error tracking
5. **Backups:** Automated PostgreSQL backups to S3
6. **Load Testing:** Verify system handles 10k req/min
7. **Documentation:** Deployment guide, runbook, API docs

### Tasks

#### Week 1: Security Hardening
- [ ] **SEC-001:** Setup Nginx reverse proxy
  - Nginx config for reverse proxy to Fastify backend
  - Proxy headers: `X-Forwarded-For`, `X-Real-IP`, `X-Forwarded-Proto`
  - Configure `trustProxy` in Fastify
  
- [ ] **SEC-002:** Obtain Let's Encrypt SSL certificate
  - Install certbot
  - Run: `certbot --nginx -d example.com -d www.example.com`
  - Verify auto-renewal cron job created
  
- [ ] **SEC-003:** Enforce HTTPS redirect
  - Nginx: Redirect HTTP (port 80) → HTTPS (port 443)
  - Config: `return 301 https://$host$request_uri;`
  
- [ ] **SEC-004:** Add HSTS header
  - Fastify hook: `reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')`
  - Test: Verify header present in response
  
- [ ] **SEC-005:** Configure modern SSL settings
  - TLS 1.2 and 1.3 only (disable TLS 1.0, 1.1)
  - Strong ciphers: `HIGH:!aNULL:!MD5`
  - OCSP stapling for performance
  
- [ ] **SEC-006:** Test SSL configuration
  - Run: `https://www.ssllabs.com/ssltest/`
  - Target: A+ rating
  - Fix any issues (weak ciphers, missing headers)
  
- [ ] **SEC-007:** Implement application rate limiting
  - Install: `@fastify/rate-limit`
  - Global: 100 requests per minute per IP
  - API routes: 10 requests per minute (admin endpoints)
  - Use Redis for multi-instance sync
  
- [ ] **SEC-008:** Implement Nginx rate limiting
  - Nginx config: `limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;`
  - Apply to `/api/` routes
  - Burst: 20 requests, no delay
  
- [ ] **SEC-009:** Add CSRF protection
  - SameSite cookies already implemented (Phase 3)
  - Add double-submit token for state-changing requests (POST, PUT, DELETE)
  - Middleware: Validate CSRF token in header matches cookie
  
- [ ] **SEC-010:** Add Content Security Policy (CSP) header
  - Prevent XSS attacks
  - Config: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';`
  - Adjust for Leaflet, external map tiles (allow OSM)
  
- [ ] **SEC-011:** Security audit
  - Run: `npm audit` and fix vulnerabilities
  - Test: SQL injection attempts (verify parameterized queries)
  - Test: XSS attempts (verify input sanitization)
  - Review: OWASP Top 10 checklist

#### Week 2: Monitoring & Observability
- [ ] **MON-001:** Create health check endpoint
  - `GET /health` - Check service health
  - Checks: PostgreSQL connection, Redis connection, S3 connection (optional)
  - Return: `200 OK` if healthy, `503 Service Unavailable` if unhealthy
  - Response: `{"status":"healthy","checks":{"db":"ok","redis":"ok"}}`
  
- [ ] **MON-002:** Create readiness endpoint
  - `GET /ready` - Check if service ready to receive traffic
  - Checks: Database migrations applied, cache warmed
  - Used by Kubernetes readiness probe
  
- [ ] **MON-003:** Setup Prometheus metrics
  - Install: `prom-client`
  - Collect default metrics (CPU, memory, event loop lag)
  - Custom metrics: HTTP request duration, cache hit rate, DB query count
  - Expose: `GET /metrics` (Prometheus format)
  
- [ ] **MON-004:** Add custom metrics
  - Counter: `http_requests_total` (labels: method, route, status_code)
  - Histogram: `http_request_duration_seconds` (labels: method, route)
  - Gauge: `cache_hit_rate` (0-100%)
  - Gauge: `site_cache_size` (number of cached sites)
  
- [ ] **MON-005:** Setup Sentry error tracking
  - Install: `@sentry/node`
  - Initialize Sentry with DSN from env
  - Capture all unhandled errors
  - Add context: User ID, site ID, request ID
  
- [ ] **MON-006:** Add structured logging
  - Use Fastify built-in logger (pino)
  - Log levels: error, warn, info, debug
  - Log format: JSON (structured)
  - Include: Request ID, user ID, site ID, timestamp
  
- [ ] **MON-007:** Setup uptime monitoring
  - Use: UptimeRobot or Pingdom (free tier)
  - Monitor: `/health` endpoint every 5 minutes
  - Alert: Email or Slack if down for >5 minutes
  
- [ ] **MON-008:** Create monitoring dashboard (optional)
  - Grafana dashboard for Prometheus metrics
  - Panels: Request rate, latency (p50, p95, p99), error rate, cache hit rate
  - Alerts: High latency (p95 > 200ms), low cache hit rate (<95%)

#### Week 3: Backups, Load Testing & Documentation
- [ ] **OPS-001:** Setup automated PostgreSQL backups
  - Cron job: Daily at 2 AM
  - Command: `pg_dump -U user dbname | gzip > /backups/db-$(date +%Y%m%d).sql.gz`
  - Retention: Keep last 30 days, delete older backups
  
- [ ] **OPS-002:** Upload backups to S3
  - After backup: `aws s3 sync /backups s3://backups-bucket/postgres/`
  - Verify upload success
  
- [ ] **OPS-003:** Test backup restore
  - Download backup from S3
  - Restore to test database: `gunzip -c backup.sql.gz | psql -U user testdb`
  - Verify data integrity (row counts, sample queries)
  - Document restore procedure in runbook
  
- [ ] **OPS-004:** Setup backup monitoring
  - Alert if backup fails or is >24 hours old
  - Script: Check backup file timestamp, send alert if stale
  
- [ ] **OPS-005:** Create load testing scripts
  - Use: Artillery or k6
  - Scenarios:
    - Scenario 1: 1000 req/s to site resolution (cache hit)
    - Scenario 2: 100 req/s to IP access control (cache miss)
    - Scenario 3: 50 req/s to GPS geofencing
  - Duration: 5 minutes each
  
- [ ] **OPS-006:** Run load tests
  - Execute load testing scripts
  - Monitor: CPU, memory, DB connections, cache hit rate, latency
  - Identify bottlenecks: Slow queries, cache misses, high CPU
  
- [ ] **OPS-007:** Optimize based on load test results
  - If cache hit rate < 95%: Increase cache size or TTL
  - If DB slow: Add missing indexes, optimize queries
  - If high CPU: Scale horizontally (add more instances)
  - Target: p95 latency < 200ms at 10k req/min
  
- [ ] **OPS-008:** Create deployment documentation
  - `.planning/DEPLOYMENT.md`: Step-by-step deployment guide
  - Sections:
    - Prerequisites (Docker, Node.js, PostgreSQL, SSL cert)
    - Environment variables (DATABASE_URL, REDIS_URL, S3_BUCKET, etc.)
    - Deployment steps (Docker Compose or Kubernetes)
    - Post-deployment checks (health check, logs)
    - Rollback procedure
  
- [ ] **OPS-009:** Create runbook
  - `.planning/RUNBOOK.md`: Operational procedures
  - Sections:
    - Common issues and troubleshooting
    - How to check logs
    - How to restore from backup
    - How to scale horizontally
    - Emergency contacts
  
- [ ] **OPS-010:** Create API documentation
  - Use: Swagger/OpenAPI 3.0 spec
  - Document all API endpoints: Request/response schemas, auth requirements
  - Host: Swagger UI at `/api/docs`
  
- [ ] **OPS-011:** Final production checklist
  - [ ] HTTPS enforced with A+ SSL Labs rating
  - [ ] Rate limiting configured (application + Nginx)
  - [ ] CSRF protection enabled
  - [ ] Health checks and metrics working
  - [ ] Sentry error tracking configured
  - [ ] Uptime monitoring active
  - [ ] Automated backups tested
  - [ ] Load testing passed (p95 < 200ms at 10k req/min)
  - [ ] GDPR compliance verified (legal review sign-off)
  - [ ] Documentation complete (deployment guide, runbook, API docs)
  
- [ ] **OPS-012:** Production deployment
  - Deploy to production environment (VPS or cloud)
  - Run smoke tests (create site, test access control, view logs)
  - Monitor for 24 hours (check logs, metrics, errors)
  - Announce launch to stakeholders

### Deliverables

- [x] HTTPS enforced with Let's Encrypt SSL (A+ rating)
- [x] Rate limiting (DDoS prevention)
- [x] CSRF protection
- [x] Health checks and metrics (Prometheus)
- [x] Error tracking (Sentry)
- [x] Automated daily backups to S3
- [x] Load testing passed (10k req/min, p95 < 200ms)
- [x] Deployment guide and runbook
- [x] API documentation (Swagger)
- [x] Production deployment

### Success Criteria

✅ **SC-5.1:** Site accessible only via HTTPS (HTTP redirects to HTTPS)  
✅ **SC-5.2:** SSL Labs rating: A or A+  
✅ **SC-5.3:** Rate limiting blocks > 100 req/min from single IP  
✅ **SC-5.4:** Health check endpoint returns 200 OK  
✅ **SC-5.5:** Metrics endpoint shows cache hit rate, request latency  
✅ **SC-5.6:** Sentry captures and reports errors  
✅ **SC-5.7:** Automated backup runs successfully, uploaded to S3  
✅ **SC-5.8:** Backup restore tested and documented  
✅ **SC-5.9:** Load test shows p95 latency < 200ms at 10k req/min  
✅ **SC-5.10:** Production deployment successful, no critical errors in 24h  

### Testing Requirements

- **Security Tests:** SSL configuration, rate limiting, CSRF protection, OWASP Top 10
- **Load Tests:** 10k req/min for 5 minutes, measure latency and throughput
- **Backup Tests:** Create backup, restore to test DB, verify integrity
- **Monitoring Tests:** Trigger errors, verify Sentry captures, check metrics endpoint
- **E2E Tests:** Full production smoke test (create site, block access, view logs)

### Risk Mitigation Checkpoints

| Risk | Mitigation | Checkpoint |
|---|---|---|
| No HTTPS (MITM attack) | Let's Encrypt SSL, HSTS header, A+ rating | SEC-002 to SEC-006 |
| DDoS attack | Rate limiting (app + Nginx), monitoring | SEC-007, SEC-008 |
| Data loss (no backups) | Automated daily backups, tested restore | OPS-001 to OPS-004 |
| Performance issues at scale | Load testing, optimization, horizontal scaling | OPS-005 to OPS-007 |
| SSL cert expiry | Auto-renewal (certbot), monitoring | SEC-002 |

---

## Dependencies & Critical Path

### Dependency Graph

```
Phase 0: Foundation
   ├─→ Phase 1: MVP (IP Access Control)
   │      ├─→ Phase 2: GPS Geofencing
   │      └─→ Phase 3: Multi-Site & RBAC
   │             └─→ Phase 4: Artifacts & GDPR
   │                    └─→ Phase 5: Production Hardening
```

### Critical Path (Sequential)

1. **Phase 0** (1-2 weeks): Must complete before any other phase
2. **Phase 1** (4-5 weeks): Must complete before Phases 2 and 3
3. **Phases 2 & 3 can run in parallel** (3-4 weeks each)
   - Phase 2 depends only on Phase 1 (site model, access control middleware)
   - Phase 3 depends only on Phase 1 (site model, database schema)
4. **Phase 4** (3-4 weeks): Depends on Phases 2 (GPS) and 3 (auth, RBAC)
5. **Phase 5** (2-3 weeks): Depends on all features (Phases 1-4)

### Parallelization Opportunities

**Within Phases:**
- Frontend and backend can be developed concurrently (separate developers)
- Example: While backend implements IP middleware (MVP-005 to MVP-007), frontend builds Site Editor UI (MVP-014 to MVP-017)

**Across Phases:**
- **Phases 2 & 3 can run in parallel** (after Phase 1 complete)
- Monitoring setup (Phase 5) can start in Phase 3 (health checks, metrics)
- Documentation can be written throughout (not all at end)

### Timeline Optimization

**Minimum Timeline (16 weeks):** Assuming parallel work and optimal execution
- Phase 0: 1 week
- Phase 1: 4 weeks
- Phases 2 & 3: 3 weeks (parallel)
- Phase 4: 3 weeks
- Phase 5: 2 weeks
- **Total: 13 weeks** (with perfect parallelization and no blockers)

**Realistic Timeline (20 weeks):** Accounting for dependencies, bugs, reviews
- Phase 0: 2 weeks
- Phase 1: 5 weeks
- Phases 2 & 3: 4 weeks each (some serial work within phases)
- Phase 4: 4 weeks
- Phase 5: 3 weeks
- **Total: 18-20 weeks**

**Conservative Timeline (22 weeks):** Includes buffer for unknowns
- Add 10% buffer to each phase
- **Total: 20-22 weeks**

---

## Risk Register & Mitigation

### High-Priority Risks (Must Address Before Launch)

| ID | Risk | Severity | Likelihood | Mitigation | Owner | Checkpoint |
|---|---|---|---|---|---|---|
| **R-001** | GPS spoofing bypass | Critical | High | GPS-IP cross-validation (max 500km distance) | Backend | GEO-003 |
| **R-002** | SQL injection | Critical | Medium | Parameterized queries always, code review | Backend | MVP-004 |
| **R-003** | No HTTPS (MITM) | Critical | Low | Let's Encrypt SSL, HSTS header | DevOps | SEC-002 to SEC-006 |
| **R-004** | JWT in localStorage (XSS) | High | Medium | Access token in memory, refresh in HttpOnly cookie | Frontend | AUTH-006 |
| **R-005** | Sync screenshot blocks requests | Critical | High | Async job queue (BullMQ), latency <10ms | Backend | ART-002, ART-007 |
| **R-006** | No DB index (GIST) | High | Medium | GIST spatial index on geofence_polygon | Backend | DEV-006, GEO-024 |
| **R-007** | No backups (data loss) | Critical | Low | Automated daily backups to S3, tested restore | DevOps | OPS-001 to OPS-003 |

### Medium-Priority Risks (Address Within 1 Month of Launch)

| ID | Risk | Severity | Likelihood | Mitigation | Owner | Checkpoint |
|---|---|---|---|---|---|---|
| **R-008** | VPN bypass | Critical | High | MaxMind Anonymous IP DB, combine with GPS | Backend | MVP-007 |
| **R-009** | GDPR non-compliance | High | Medium | Consent, retention, DPAs, legal review | Legal/Backend | GDPR-001 to GDPR-016 |
| **R-010** | GPS accuracy variance | High | High | Buffer geofence (1.5x), reject low accuracy | Backend | GEO-001, GEO-020 |
| **R-011** | Cache invalidation bugs | Medium | Medium | Redis pub/sub, short TTL (60s), monitoring | Backend | MULTI-005 |
| **R-012** | No rate limiting (DDoS) | High | Medium | @fastify/rate-limit, Nginx limits | Backend/DevOps | SEC-007, SEC-008 |

### Low-Priority Risks (Monitor and Fix as Needed)

| ID | Risk | Severity | Likelihood | Mitigation | Owner | Checkpoint |
|---|---|---|---|---|---|---|
| **R-013** | User denies GPS permission | Medium | High | Clear UX, fallback instructions | Frontend | GEO-010, GEO-012 |
| **R-014** | Playwright crashes | Medium | Medium | Timeout (15s), retry 3x, graceful degradation | Backend | ART-003 |
| **R-015** | S3 costs explode | Medium | Low | Lifecycle policy (90 days), monitoring | DevOps | ART-012 |

---

## Quality Gates (Phase Exit Criteria)

Each phase must pass these quality gates before proceeding to next phase:

### Phase 0 Exit Criteria
- [ ] All Docker services start without errors
- [ ] `/health` endpoint returns 200 OK
- [ ] Database schema created with PostGIS spatial index
- [ ] CI/CD pipeline runs successfully
- [ ] MaxMind MMDB files downloaded and accessible

### Phase 1 Exit Criteria
- [ ] All success criteria met (SC-1.1 to SC-1.10)
- [ ] Unit test coverage > 80%
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Deployed to staging environment
- [ ] Code review completed
- [ ] Security review: No SQL injection vulnerabilities

### Phase 2 Exit Criteria
- [ ] All success criteria met (SC-2.1 to SC-2.10)
- [ ] GPS accuracy report completed (real-world testing)
- [ ] PostGIS query latency < 1ms (verified via EXPLAIN ANALYZE)
- [ ] GPS-IP cross-validation working (tested with spoofed coordinates)
- [ ] Code review completed
- [ ] E2E tests passing (full GPS flow)

### Phase 3 Exit Criteria
- [ ] All success criteria met (SC-3.1 to SC-3.10)
- [ ] Cache hit rate > 95% under load
- [ ] Load test passed (1000 req/s, <10ms p95 latency)
- [ ] RBAC tests passing (super admin, site admin, viewer)
- [ ] Code review completed
- [ ] Security review: JWT auth, RBAC enforcement

### Phase 4 Exit Criteria
- [ ] All success criteria met (SC-4.1 to SC-4.10)
- [ ] Legal review completed (GDPR compliance sign-off or documented action items)
- [ ] Screenshot capture working (tested, <5s latency)
- [ ] Data export and deletion working (tested)
- [ ] Privacy policy published
- [ ] Code review completed
- [ ] GDPR compliance documentation complete

### Phase 5 Exit Criteria
- [ ] All success criteria met (SC-5.1 to SC-5.10)
- [ ] SSL Labs rating: A or A+
- [ ] Load test passed (10k req/min, <200ms p95 latency)
- [ ] Backup restore tested and documented
- [ ] Production deployment successful
- [ ] 24-hour monitoring (no critical errors)
- [ ] Documentation complete (deployment guide, runbook, API docs)
- [ ] Security audit completed (OWASP Top 10)

---

## Go-Live Checklist

Before production launch, ensure ALL items checked:

### Technical
- [ ] HTTPS enforced with A+ SSL Labs rating
- [ ] Rate limiting configured (application + Nginx)
- [ ] CSRF protection enabled
- [ ] Health checks and metrics working (`/health`, `/metrics`)
- [ ] Sentry error tracking configured and tested
- [ ] Uptime monitoring active (UptimeRobot or Pingdom)
- [ ] Automated daily backups tested (restore verified)
- [ ] Load testing passed (10k req/min, p95 < 200ms)
- [ ] GPS-IP cross-validation working (anti-spoofing)
- [ ] Cache hit rate > 95% (verified via metrics)
- [ ] Database GIST spatial index verified (EXPLAIN ANALYZE)
- [ ] Screenshot capture async (latency <10ms)

### Security
- [ ] SQL injection tested (parameterized queries verified)
- [ ] XSS tested (input sanitization verified)
- [ ] JWT auth working (access token in memory, refresh in HttpOnly cookie)
- [ ] RBAC enforced (super admin, site admin, viewer roles tested)
- [ ] CSP header configured (XSS prevention)
- [ ] OWASP Top 10 checklist reviewed

### GDPR / Legal
- [ ] GDPR consent modal working (before GPS collection)
- [ ] Privacy policy published and accessible
- [ ] Data retention policy implemented (90 days, auto-delete tested)
- [ ] Data export endpoint working (tested)
- [ ] Data deletion endpoint working (tested)
- [ ] IP anonymization working (last octet removed)
- [ ] Legal review completed (sign-off or action items documented)
- [ ] DPAs signed with MaxMind, AWS, Cloudflare (if applicable)
- [ ] Cookie notice displayed

### Documentation
- [ ] Deployment guide complete (`.planning/DEPLOYMENT.md`)
- [ ] Runbook complete (`.planning/RUNBOOK.md`)
- [ ] API documentation complete (Swagger UI at `/api/docs`)
- [ ] README updated (setup instructions, architecture overview)
- [ ] Environment variables documented

### Monitoring
- [ ] Production monitoring dashboard created (Grafana or equivalent)
- [ ] Alerts configured:
  - [ ] High latency (p95 > 200ms)
  - [ ] Low cache hit rate (<95%)
  - [ ] Error rate > 1%
  - [ ] Service down (health check fails)
  - [ ] Backup failure or >24h old
- [ ] On-call rotation established (who to contact for incidents)

### Smoke Tests (Post-Deployment)
- [ ] Create site via API
- [ ] Configure IP allowlist
- [ ] Test IP blocking (from blocked IP → 403)
- [ ] Draw geofence polygon on map
- [ ] Test GPS blocking (outside geofence → 403)
- [ ] View access logs
- [ ] View screenshot artifact
- [ ] Export user data
- [ ] Delete user account
- [ ] Monitor for 24 hours (no critical errors)

---

## Maintenance & Post-Launch

### Weekly Tasks
- Review error rate in Sentry
- Check cache hit rate (should be >95%)
- Review uptime monitoring alerts
- Check backup success (should be daily)

### Monthly Tasks
- Review and analyze access logs (blocked attempts, patterns)
- Update MaxMind GeoLite2 databases (automatic, verify success)
- Review and update dependencies (`npm audit`, security updates)
- Review SSL certificate expiry (auto-renewed, verify success)
- Capacity planning (if traffic growing, consider scaling)

### Quarterly Tasks
- Review GDPR compliance (data retention, DPAs, privacy policy)
- Security audit (penetration testing, OWASP Top 10)
- Performance optimization (query optimization, caching tuning)
- Documentation updates (deployment guide, runbook, API docs)

### Ongoing
- Monitor for GPS accuracy issues (real-world reports from users)
- Monitor for VPN bypass attempts (log analysis)
- Respond to legal review feedback (if any follow-up required)
- Feature requests and enhancements (prioritize based on user needs)

---

**Roadmap Version:** 1.0  
**Last Updated:** 2026-02-14  
**Total Duration:** 16-22 weeks  
**Next Review:** After Phase 0 completion
