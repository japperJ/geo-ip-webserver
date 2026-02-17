# Copilot Instructions: Geo-IP Webserver

**Production-ready multi-tenant geofencing platform** with IP/GPS-based access control, VPN detection, comprehensive audit logging, screenshot capture, and GDPR compliance.

## What This System Does

This is an **enterprise access control system** that allows organizations to:

1. **Host multiple sites** with individual access policies
2. **Control access by IP address** (allowlists/denylists, country filtering, VPN blocking)
3. **Control access by GPS location** (geofencing with polygon or radius)
4. **Capture audit trails** with anonymized IPs and optional screenshots of blocked attempts
5. **Comply with GDPR** (consent management, data export, deletion, 90-day retention)
6. **Manage users and permissions** (super admins, site admins, viewers)

### Current Status: **Phase 5 Complete - Production Ready**

All 6 phases (0-5) implemented. See `.planning/STATE.md` for detailed progress tracking.

## Project Structure

This is a **monorepo** using npm workspaces:

- **packages/backend/** - Fastify API server (Node 22+, TypeScript)
- **packages/frontend/** - React admin dashboard (Vite, TypeScript, TailwindCSS)
- **packages/workers/** - Background workers (future use)

## Build, Test, and Lint Commands

### Root-level commands (run from project root)

```bash
# Development (runs backend + frontend concurrently)
npm run dev

# Build all packages
npm run build

# Test all packages
npm run test

# Lint all packages
npm run lint

# Clean all packages
npm run clean
```

### Backend commands (use -w packages/backend)

```bash
# Development with hot-reload
npm run dev -w packages/backend

# Build TypeScript
npm run build -w packages/backend

# Start production build
npm run start -w packages/backend

# Tests
npm test -w packages/backend                    # Run all tests
npm run test:watch -w packages/backend          # Watch mode
npm run test:coverage -w packages/backend       # With coverage

# Linting
npm run lint -w packages/backend

# Database migrations
npm run migrate:up -w packages/backend          # Run pending migrations
npm run migrate:down -w packages/backend        # Rollback last migration
npm run migrate:create -w packages/backend -- migration-name  # Create migration
```

### Frontend commands (use -w packages/frontend)

```bash
# Development server (port 5173)
npm run dev -w packages/frontend

# Build for production
npm run build -w packages/frontend

# Preview production build
npm run preview -w packages/frontend

# Tests
npm test -w packages/frontend                   # Vitest unit tests
npm run test:e2e -w packages/frontend          # Playwright E2E tests (headless)
npm run test:e2e:ui -w packages/frontend       # Playwright E2E tests (UI mode)

# Linting
npm run lint -w packages/frontend
```

### Running single tests

```bash
# Backend (Vitest)
npm test -w packages/backend -- src/services/__tests__/SiteService.test.ts

# Frontend E2E (Playwright)
npm run test:e2e -w packages/frontend -- tests/site-creation.spec.ts
```

## High-Level Architecture

### System Design Philosophy

**Multi-phase implementation** (6 phases total):
- **Phase 0:** Foundation & Docker infrastructure ✅
- **Phase 1:** MVP - IP-based access control ✅
- **Phase 2:** GPS geofencing with PostGIS ✅
- **Phase 3:** Multi-tenancy, authentication, RBAC ✅
- **Phase 4:** Screenshot capture, GDPR compliance ✅
- **Phase 5:** Production hardening (SSL, monitoring, backups) ✅

See `.planning/ROADMAP.md` for full implementation plan and `.planning/INTEGRATION.md` for integration verification.

### Backend (Fastify + TypeScript)

**Entry point:** `packages/backend/src/index.ts`

**Key architectural patterns:**

1. **Middleware pipeline for access control:**
   - `siteResolution` → attaches `request.site` based on hostname/slug
   - `ipAccessControl` → enforces IP allowlist/denylist, country filtering, VPN detection
   - `gpsAccessControl` → validates GPS coordinates against geofences
   - `authenticateJWT` → verifies JWT tokens for admin API
   - All middleware reads from `request.site` set by `siteResolution`

2. **Service layer pattern:**
   - `SiteService` - Site CRUD operations
   - `AccessLogService` - Writes access logs (with IP anonymization)
   - `GeofenceService` - PostGIS spatial queries for geofence validation
   - `AuthService` - User authentication and password hashing
   - `GDPRService` - Data deletion and consent management
   - `CacheService` - LRU + Redis caching for site resolution

3. **Plugin system (Fastify):**
   - `geoip.ts` - MaxMind GeoIP2 database reader (country + ASN for VPN detection)
   - `metrics.ts` - Prometheus metrics (request counters, access control decisions)
   - `sentry.ts` - Error tracking integration

4. **Database architecture:**
   - PostgreSQL 16 with PostGIS extension for spatial queries
   - `access_logs` table is **partitioned by month** for performance
   - Migrations managed by `node-pg-migrate` (see `packages/backend/migrations/`)
   - Test database uses separate schema for isolation

5. **Type safety:**
   - Uses `fastify-type-provider-zod` for request/response validation
   - Schemas defined in `packages/backend/src/schemas/`
   - All API types exported from `packages/backend/src/models/`

### Frontend (React + TypeScript)

**Entry point:** `packages/frontend/src/main.tsx`

**Key patterns:**

1. **API client:** `packages/frontend/src/lib/api.ts` - Axios instance with JWT interceptor
2. **React Query** for server state management (`@tanstack/react-query`)
3. **Leaflet maps** for geofence drawing and visualization
4. **React Hook Form** for all forms
5. **Radix UI** primitives for accessible components
6. **TailwindCSS** for styling

### Database Schema

**Critical relationships:**

- `sites` table has PostGIS columns: `geofence_polygon`, `geofence_center`, `geofence_radius`
- `access_logs` table references `site_id` and is **partitioned by created_at month**
- `users` table has `role` (enum: `super_admin`, `admin`, `viewer`)
- `site_roles` table for many-to-many user-site access (RBAC)

### GeoIP Detection

- Requires MaxMind GeoLite2 databases in `packages/backend/geoip/`:
  - `GeoLite2-Country.mmdb` - Country code lookup
  - `GeoLite2-ASN.mmdb` - ASN lookup for VPN/proxy detection
- VPN detection checks if ASN is in known hosting/VPN provider list
- If databases missing, features gracefully degrade (warnings only)

## Key Conventions

### Access Control Flow

When a request comes in (see `.planning/INTEGRATION.md` section 3 for full flows):

1. **Site resolution** (via hostname or `?slug=` param) attaches `request.site`
   - 3-layer cache: Memory (LRU) → Redis → Database
   - Cache hit: <1ms, Cache miss: ~15ms
   
2. **IP access control** (`access_mode: 'ip_only'` or `'ip_and_geo'`):
   - IP denylist (highest priority) → 403 if matched
   - IP allowlist (if configured) → 403 if not matched
   - Country denylist (using MaxMind GeoIP) → 403 if matched
   - Country allowlist (if configured) → 403 if not matched
   - VPN detection (ASN database) → 403 if detected and `block_vpn_proxy=true`
   
3. **GPS access control** (if `access_mode` includes `'geo'`):
   - Validates GPS coordinates against PostGIS geofence (polygon or radius)
   - Cross-validates GPS with IP geolocation (max 500km distance) to prevent spoofing
   - Uses accuracy buffering (1.5x GPS accuracy for polygon checks)
   
4. **All decisions are logged** to `access_logs` with:
   - Anonymized IP (last octet zeroed for IPv4)
   - Allow/deny reason
   - IP and GPS coordinates (for geofencing analysis)
   - Screenshot capture enqueued for blocked requests (async, non-blocking)

### IP Anonymization

- All stored IPs in `access_logs` are anonymized via `anonymizeIP()`
- IPv4: Last octet zeroed (`192.168.1.100` → `192.168.1.0`)
- IPv6: Last 80 bits zeroed
- Raw IPs never persisted to database

### Environment Variables

**Backend requires:**
- `DATABASE_*` - PostgreSQL connection (port 5434 in dev)
- `REDIS_*` - Redis connection (port 6380 in dev)
- `GEOIP_*_DB_PATH` - Paths to MaxMind `.mmdb` files
- `JWT_SECRET` - 32+ character secret for JWT signing
- `LOG_RETENTION_DAYS` - Automatic log deletion threshold

**Frontend requires:**
- `VITE_API_URL` - Backend API URL (default: `http://localhost:3000`)

### TypeScript Configuration

- **Backend:** ES2022 modules (`"type": "module"` in package.json)
  - All imports use `.js` extensions (TypeScript quirk for ES modules)
  - `strict: false` - Gradually migrating to strict mode
- **Frontend:** Standard React TypeScript config

### Testing Philosophy

- **Backend:** Vitest with separate test database
  - Tests use `testPool` from `src/tests/setup.js`
  - Database cleaned between tests (`beforeEach`)
- **Frontend:** Playwright E2E tests run against Docker stack
  - Requires `docker compose up` before running tests
  - Auth state stored in `playwright/.auth/user.json`

### Migration Best Practices

From `packages/backend/MIGRATIONS.md`:

1. Always include DOWN migration (comment it out at bottom)
2. Use atomic changes (one logical change per migration)
3. Add indexes in the same migration as table creation
4. Use database constraints for data integrity
5. Use descriptive kebab-case names

### Docker Development

Use `docker-compose.dev.yml` for local development:

```bash
# Start infrastructure only (PostgreSQL, Redis, MinIO)
docker-compose -f docker-compose.dev.yml up -d

# Run backend/frontend locally with hot-reload
npm run dev -w packages/backend
npm run dev -w packages/frontend
```

Use `docker-compose.yml` for full production-like deployment (includes Nginx).

## Critical Files to Understand

**Backend Core:**
- `packages/backend/src/index.ts` - Server bootstrap and plugin registration
- `packages/backend/src/middleware/ipAccessControl.ts` - IP-based access control logic
- `packages/backend/src/middleware/gpsAccessControl.ts` - GPS geofencing logic
- `packages/backend/src/middleware/siteResolution.ts` - Site identification (hostname/slug)
- `packages/backend/src/services/GeofenceService.ts` - PostGIS spatial queries
- `packages/backend/src/services/ScreenshotService.ts` - BullMQ job queue for screenshots
- `packages/backend/src/services/GDPRService.ts` - Data export/deletion

**Database:**
- `packages/backend/migrations/` - Database schema evolution
- `packages/backend/MIGRATIONS.md` - Migration conventions and best practices

**Planning & Documentation:**
- `.planning/ROADMAP.md` - 6-phase implementation plan with tasks
- `.planning/STATE.md` - Project status tracker (all phases complete)
- `.planning/INTEGRATION.md` - End-to-end flow verification
- `.planning/REQUIREMENTS.md` - Complete requirements specification
- `.planning/PRIVACY_POLICY.md` - GDPR-compliant privacy policy
- `PRODUCTION.md` - Production deployment guide
- `PHASE_5_COMPLETE.md` - Phase 5 completion report

## Known Gotchas

1. **ES Modules:** All backend imports must use `.js` extensions even for `.ts` files
2. **Trust Proxy:** Backend sets `trustProxy: true` - Always use `getClientIP()` utility
3. **CIDR Validation:** Use `ipaddr.js` library, not regex - handles IPv6 and edge cases
4. **PostGIS Types:** Geofences are stored as `geography(Polygon, 4326)` for accuracy
5. **Access Logs Partitioning:** Monthly partitions auto-created by trigger, don't query parent table directly
6. **MaxMind Databases:** Not in git - developers must download manually (free GeoLite2 account)
7. **Playwright Tests:** Base URL configured for Docker port 8080, not dev port 5173
8. **Screenshot Jobs:** BullMQ requires Redis - screenshots won't capture if Redis is down
9. **GPS Spoofing Prevention:** GPS-IP distance validation (500km max) may block legitimate edge cases
10. **Test Concurrency:** Backend tests use `singleFork: true` to avoid race conditions with async logging

## Production Deployment

**Three deployment modes available:**

1. **Development** (`docker-compose.dev.yml`): Infrastructure only, run code locally
2. **Production** (`docker-compose.yml`): Full stack with Nginx reverse proxy
3. **Monitoring** (`docker-compose.monitoring.yml`): Production + Prometheus/Grafana stack

**Pre-production checklist in `.planning/INTEGRATION.md` section 8**

### Key Production Features

- **SSL/TLS:** Let's Encrypt automation via `infrastructure/scripts/setup-ssl.sh`
- **Rate Limiting:** Multi-layer (Nginx + app-level with Redis)
- **Monitoring:** Prometheus metrics at `/metrics`, Grafana dashboards, Sentry errors
- **Backups:** Automated daily PostgreSQL backups via `infrastructure/scripts/backup-database.sh`
- **Security:** HSTS, CSP headers, CORS, Helmet middleware, bcrypt (12 rounds)
- **GDPR:** 90-day log retention (auto-deletion), data export/deletion endpoints

See `PRODUCTION.md` for complete deployment guide.

## Performance Targets

From `.planning/INTEGRATION.md` section 6:

- **Site resolution:** <1ms (cache hit), <15ms (cache miss)
- **IP access control:** <5ms P95 (cached GeoIP)
- **GPS geofencing:** <100ms P95 (PostGIS with GIST index)
- **Screenshot capture:** 1-5s async (non-blocking)
- **Cache hit rate:** >95%
- **Throughput:** 1000+ req/s (single instance, site resolution only)

## GDPR Compliance

All GDPR requirements implemented (Article 6, 7, 15, 17, 20):

- **Consent management:** GPS consent tracked in `gdpr_consents` table
- **Data export:** `GET /api/user/data-export` returns all user data as JSON
- **Data deletion:** `DELETE /api/user/data` removes user with transaction safety
- **IP anonymization:** Last octet zeroed before storage (Article 25)
- **Retention:** 90-day automatic deletion via cron job
- **Privacy policy:** See `.planning/PRIVACY_POLICY.md`

---

## Common Development Tasks

### Adding a New API Endpoint with Authentication

**Pattern:** All endpoints in `packages/backend/src/routes/` follow this structure:

```typescript
// 1. Define Zod schemas in packages/backend/src/schemas/
export const myRequestSchema = z.object({
  field: z.string().min(1),
});

// 2. Add route in route file
export async function myRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();
  
  server.post('/my-endpoint', {
    onRequest: [
      fastify.authenticate,           // JWT authentication (required)
      requireRole('super_admin'),     // Role check (optional)
      requireSiteAccess,              // Site-specific access (optional)
    ],
    schema: {
      body: myRequestSchema,
      response: {
        200: myResponseSchema,
      },
    },
  }, async (request, reply) => {
    // Access user: request.user (JWTPayload)
    // Access site: request.site (if siteResolution middleware ran)
    return reply.send({ success: true });
  });
}
```

**Authentication levels:**
- `fastify.authenticate` - Requires valid JWT token, attaches `request.user`
- `requireRole('super_admin')` - Only super admins can access
- `requireSiteAccess` - User must have access to `request.site` (requires siteResolution first)

### Adding a New Access Control Rule

**Example: Add a "time-based access" feature**

1. **Update database schema** (new migration):
```sql
ALTER TABLE sites ADD COLUMN allowed_hours INT[];
-- Example: [9,10,11,12,13,14,15,16,17] for 9 AM - 5 PM
```

2. **Update Zod schema** in `packages/backend/src/schemas/site.ts`:
```typescript
export const siteSchema = z.object({
  // ... existing fields
  allowed_hours: z.array(z.number().min(0).max(23)).nullable(),
});
```

3. **Add logic to middleware** in `packages/backend/src/middleware/ipAccessControl.ts`:
```typescript
// After IP/country checks, before logging
if (site.allowed_hours && site.allowed_hours.length > 0) {
  const currentHour = new Date().getHours();
  if (!site.allowed_hours.includes(currentHour)) {
    await accessLogService.log({
      site_id: site.id,
      ip_address: anonymizeIP(clientIP),
      allowed: false,
      reason: 'time_restriction',
    });
    return reply.code(403).send({
      error: 'Forbidden',
      reason: 'time_restriction',
      message: 'Access not allowed at this time',
    });
  }
}
```

4. **Update frontend** to show time selection UI in site edit form

### Adding a New Database Migration

**Pattern from `packages/backend/MIGRATIONS.md`:**

```bash
# Create migration
npm run migrate:create -w packages/backend -- add-feature-name

# Edit generated file: packages/backend/migrations/TIMESTAMP_add-feature-name.sql
```

**Migration template:**
```sql
-- UP Migration
ALTER TABLE sites ADD COLUMN new_field VARCHAR(255);
CREATE INDEX idx_sites_new_field ON sites(new_field);

-- Always comment out DOWN migration at bottom
-- -- DOWN Migration
-- -- ALTER TABLE sites DROP COLUMN new_field;
```

**Best practices:**
- One logical change per migration
- Always include indexes in the same migration as table changes
- Use descriptive kebab-case names
- Test rollback manually before committing

### Adding a New Prometheus Metric

**Pattern from `packages/backend/src/plugins/metrics.ts`:**

```typescript
// 1. Define metric (in metrics.ts plugin)
export const myCustomCounter = new client.Counter({
  name: 'my_custom_total',
  help: 'Description of what this counts',
  labelNames: ['label1', 'label2'],
});

// 2. Use in your code
import { myCustomCounter } from '../plugins/metrics.js';

myCustomCounter.inc({ label1: 'value1', label2: 'value2' });
```

**Available metric types:**
- `Counter` - Monotonically increasing (requests, errors)
- `Gauge` - Can go up/down (cache size, active connections)
- `Histogram` - Observations in buckets (request duration, GPS accuracy)

**Metrics exposed at:** `GET /metrics` (Prometheus scrapes this)

### Adding a New Service

**Pattern:** See existing services in `packages/backend/src/services/`

```typescript
// packages/backend/src/services/MyService.ts
import { Pool } from 'pg';

export class MyService {
  constructor(private pool: Pool) {}
  
  async myMethod(params: MyParams): Promise<MyResult> {
    // Always use parameterized queries
    const result = await this.pool.query(
      'SELECT * FROM my_table WHERE id = $1',
      [params.id]
    );
    return result.rows[0];
  }
}

// Use in routes:
import { pool } from '../db/index.js';
const myService = new MyService(pool);
```

**When to create a service vs utility:**
- **Service:** Needs database access, business logic, multiple operations
- **Utility:** Pure functions, no state, no database (e.g., `validateGPS`, `anonymizeIP`)

### Adding Access Control Middleware

**Execution order matters:**

```typescript
// In index.ts or route file
server.get('/my-route', {
  onRequest: [
    siteResolution,        // 1. Attaches request.site (required by others)
    fastify.authenticate,  // 2. Attaches request.user (for admin endpoints)
    ipAccessControl,       // 3. IP-based checks
    gpsAccessControl,      // 4. GPS-based checks (needs IP geolocation)
  ],
}, handler);
```

**Custom middleware pattern:**
```typescript
// packages/backend/src/middleware/myMiddleware.ts
export async function myMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Read from request.site, request.user, etc.
  if (someCondition) {
    return reply.code(403).send({ error: 'Forbidden' });
  }
  // Continue to next middleware/handler
}
```

### Updating Cache Invalidation

**When you modify a site, invalidate cache:**

```typescript
import { CacheService } from '../services/CacheService.js';

// After updating site in database
await cacheService.invalidateSite(siteId);

// Or invalidate by hostname
await cacheService.invalidateSiteByHostname(hostname);
```

**Cache uses Redis pub/sub** - invalidation broadcasts to all backend instances.

### Testing New Features

**Backend test pattern:**

```typescript
// packages/backend/src/services/__tests__/MyService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MyService } from '../MyService.js';
import { testPool } from '../../tests/setup.js';

describe('MyService', () => {
  const service = new MyService(testPool);
  
  beforeEach(async () => {
    // Clean test database
    await testPool.query('DELETE FROM my_table');
  });
  
  it('should do something', async () => {
    const result = await service.myMethod({ id: '123' });
    expect(result).toBeDefined();
  });
});
```

**Run specific test:**
```bash
npm test -w packages/backend -- src/services/__tests__/MyService.test.ts
```

### Adding Frontend API Calls

**Pattern from `packages/frontend/src/lib/api.ts`:**

```typescript
// 1. Define TypeScript interface
export interface MyResource {
  id: string;
  name: string;
}

// 2. Add API function
export async function createMyResource(data: CreateMyResourceInput): Promise<MyResource> {
  const response = await api.post('/my-resources', data);
  return response.data;
}

// 3. Use in component with React Query
import { useMutation, useQueryClient } from '@tanstack/react-query';

const mutation = useMutation({
  mutationFn: createMyResource,
  onSuccess: () => {
    queryClient.invalidateQueries(['my-resources']);
  },
});
```
