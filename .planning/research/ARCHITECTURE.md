# Architecture Patterns & Design Decisions

## Overview

This document outlines the recommended architecture for a geo-fenced multi-site webserver, covering request flow, middleware patterns, database design, caching strategies, and deployment architecture.

---

## 1. High-Level Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Browser                         │
│  • GPS Geolocation API                                       │
│  • React Admin UI (Site Config, Map Drawing)                │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Reverse Proxy (Nginx/Traefik)              │
│  • SSL Termination                                           │
│  • Load Balancing                                            │
│  • Rate Limiting (Layer 7)                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Fastify Application (Node.js)                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Request Middleware Pipeline                          │  │
│  │  1. Site Resolution (hostname → site config)          │  │
│  │  2. IP Access Control (MaxMind + allowlist/denylist)  │  │
│  │  3. GPS Geofencing (PostGIS ST_Within)                │  │
│  │  4. Logging & Artifact Capture                        │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  API Routes                                            │  │
│  │  • Admin API (Site CRUD, User Management)             │  │
│  │  │  • Site Content API (Proxied or Static)             │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────┬───────────────────────────┬────────────────────┘
             │                           │
             ▼                           ▼
┌────────────────────────┐  ┌───────────────────────────────┐
│  PostgreSQL + PostGIS  │  │  Redis (Cache + Sessions)     │
│  • Site Configs        │  │  • Site Config Cache          │
│  • Users & Roles       │  │  • MaxMind DB Cache           │
│  • Access Logs         │  │  • Rate Limit Counters        │
│  • Geofence Polygons   │  └───────────────────────────────┘
└────────────────────────┘
             │
             ▼
┌────────────────────────┐  ┌───────────────────────────────┐
│  MaxMind MMDB Files    │  │  S3 / MinIO (Artifacts)       │
│  • GeoLite2-City.mmdb  │  │  • Screenshots (PNG)          │
│  • Anonymous-IP.mmdb   │  │  • Access Logs (JSON)         │
│  • Auto-updated weekly │  │  • Audit Trail                │
└────────────────────────┘  └───────────────────────────────┘
             │
             ▼
┌────────────────────────┐
│  Playwright (Headless) │
│  • Screenshot Capture  │
│  • Background Worker   │
│  • Browser Pool (2-3)  │
└────────────────────────┘
```

---

## 2. Request Flow Architecture

### Pattern: Layered Middleware Pipeline

**Why this pattern:**
- Early rejection (fail fast) reduces load
- Order matters: cheap checks first (IP lookup), expensive checks last (GPS validation)
- Each middleware is independent and testable

### Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  1. Client Request: GET https://site1.example.com/          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Site Resolution Middleware                               │
│  • Extract hostname from request                            │
│  • Query Redis cache: GET site:site1.example.com            │
│  • If cache miss, query PostgreSQL                          │
│  • Attach site config to request.site                       │
│  • If site not found → 404                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Access Mode Check                                        │
│  • If site.access_mode === 'disabled' → Skip to Route       │
│  • Else → Continue to access control                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  4. IP Access Control Middleware (if mode = ip_only/both)   │
│  • Extract client IP (handle X-Forwarded-For)               │
│  • Check IP allowlist/denylist (CIDR matching)              │
│  • Lookup IP in MaxMind MMDB (sub-millisecond)              │
│  • Check country allowlist/denylist                         │
│  • Check VPN/Proxy (Anonymous IP DB)                        │
│  • If blocked → Log + Screenshot + 403                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  5. GPS Geofencing Middleware (if mode = geo_only/both)     │
│  • Extract lat/lng from request body (POST) or headers      │
│  • If no GPS provided → 403 "GPS required"                  │
│  • Query PostGIS: ST_Within(point, polygon)                 │
│  • If outside geofence → Log + Screenshot + 403             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Route Handler                                            │
│  • Serve site content (static files, proxy, or API)         │
│  • Log successful access (optional)                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  7. Response                                                 │
│  • If allowed: 200 OK + content                             │
│  • If blocked: 403 Forbidden + reason                       │
└─────────────────────────────────────────────────────────────┘
```

### Code Structure

```javascript
// server.js
import Fastify from 'fastify';
import { siteResolutionHook } from './middleware/site-resolution.js';
import { accessControlHook } from './middleware/access-control.js';
import { adminRoutes } from './routes/admin.js';
import { siteRoutes } from './routes/sites.js';

const fastify = Fastify({ logger: true });

// Global hooks (run on every request)
fastify.addHook('onRequest', siteResolutionHook);
fastify.addHook('onRequest', accessControlHook);

// Routes
fastify.register(adminRoutes, { prefix: '/api/admin' });
fastify.register(siteRoutes, { prefix: '/sites' }); // Site content

await fastify.listen({ port: 3000, host: '0.0.0.0' });
```

---

## 3. Multi-Tenancy Pattern

### Recommended Pattern: **Shared Database, Row-Level Isolation**

**Why:**
- Simplest to implement and maintain
- Good performance with proper indexing
- Easy to backup and restore
- Scales to ~1000 sites without issues

**Alternatives considered:**
- **Separate DBs per site**: Too complex, hard to manage, expensive
- **Schema-per-site**: Better isolation but migration hell
- **Database-per-site**: Overkill, only for extreme isolation needs

### Database Design

```sql
-- Multi-tenancy enforced via site_id foreign key
CREATE TABLE sites (
  id UUID PRIMARY KEY,
  hostname VARCHAR(255) UNIQUE NOT NULL,
  -- ... site config fields
);

-- All site-specific data includes site_id
CREATE TABLE access_logs (
  id UUID PRIMARY KEY,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  -- ... log fields
);

-- Row-Level Security (RLS) for extra safety (optional)
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_isolation ON access_logs
  USING (site_id = current_setting('app.current_site_id')::UUID);

-- Set in application code before queries
-- SET LOCAL app.current_site_id = 'uuid-here';
```

### Query Isolation

```javascript
// Always include site_id in WHERE clauses
async function getAccessLogs(siteId, limit = 100) {
  return await db.query(`
    SELECT * FROM access_logs
    WHERE site_id = $1
    ORDER BY timestamp DESC
    LIMIT $2
  `, [siteId, limit]);
}

// Use parameterized queries (prevents SQL injection)
// ✅ Good
await db.query('SELECT * FROM sites WHERE id = $1', [siteId]);

// ❌ Bad (SQL injection vulnerable)
await db.query(`SELECT * FROM sites WHERE id = '${siteId}'`);
```

---

## 4. Caching Strategy

### Pattern: **Multi-Layer Cache (Memory → Redis → DB)**

**Why:**
- Site configs are read-heavy (every request needs it)
- Database queries are slow (~5-10ms)
- Memory cache is instant (~0.01ms)
- Redis provides shared cache across instances

### Cache Layers

| Layer | Technology | TTL | Eviction | Use Case |
|---|---|---|---|---|
| **L1: In-Memory** | `lru-cache` | 60s | LRU (max 1000 items) | Site config, MaxMind reader |
| **L2: Redis** | `ioredis` | 300s | TTL-based | Site config (shared across instances) |
| **L3: Database** | PostgreSQL | N/A | N/A | Source of truth |

### Implementation

```javascript
import LRU from 'lru-cache';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const siteCache = new LRU({ max: 1000, ttl: 60000 }); // 60s

async function getSiteByHostname(hostname) {
  // L1: Check memory cache
  let site = siteCache.get(hostname);
  if (site) {
    fastify.log.debug({ hostname }, 'Site cache hit (memory)');
    return site;
  }
  
  // L2: Check Redis
  const cached = await redis.get(`site:${hostname}`);
  if (cached) {
    site = JSON.parse(cached);
    siteCache.set(hostname, site);
    fastify.log.debug({ hostname }, 'Site cache hit (Redis)');
    return site;
  }
  
  // L3: Query database
  const result = await db.query(
    'SELECT * FROM sites WHERE hostname = $1',
    [hostname]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  site = result.rows[0];
  
  // Populate caches
  siteCache.set(hostname, site);
  await redis.setex(`site:${hostname}`, 300, JSON.stringify(site));
  
  fastify.log.debug({ hostname }, 'Site cache miss (DB query)');
  return site;
}

// Cache invalidation on update
async function updateSite(id, updates) {
  const result = await db.query(
    'UPDATE sites SET ... WHERE id = $1 RETURNING *',
    [id, ...]
  );
  
  const site = result.rows[0];
  
  // Invalidate all cache layers
  siteCache.delete(site.hostname);
  await redis.del(`site:${site.hostname}`);
  
  // Optional: Publish cache invalidation event to other instances
  await redis.publish('cache:invalidate', JSON.stringify({
    type: 'site',
    hostname: site.hostname
  }));
  
  return site;
}

// Subscribe to cache invalidation events (multi-instance)
redis.subscribe('cache:invalidate', (err) => {
  if (err) throw err;
});

redis.on('message', (channel, message) => {
  const event = JSON.parse(message);
  if (event.type === 'site') {
    siteCache.delete(event.hostname);
  }
});
```

### Cache Warming (Startup)

```javascript
// Preload popular sites into cache on startup
async function warmCache() {
  const popularSites = await db.query(`
    SELECT * FROM sites
    WHERE enabled = true
    ORDER BY request_count DESC
    LIMIT 100
  `);
  
  for (const site of popularSites.rows) {
    siteCache.set(site.hostname, site);
    await redis.setex(`site:${site.hostname}`, 300, JSON.stringify(site));
  }
  
  fastify.log.info(`Cache warmed with ${popularSites.rows.length} sites`);
}

fastify.addHook('onReady', warmCache);
```

---

## 5. Asynchronous Processing Pattern

### Pattern: **Background Job Queue (BullMQ + Redis)**

**Why:**
- Screenshot capture is slow (1-5s)
- Blocking requests for screenshots is bad UX
- Job queue provides retry, failure handling, and monitoring

### Architecture

```
Request → Block Decision → Enqueue Screenshot Job → Return 403
                                  ↓
                            Job Worker (Separate Process)
                                  ↓
                         Playwright Screenshot
                                  ↓
                            Upload to S3
                                  ↓
                       Update access_logs.screenshot_url
```

### Implementation

```javascript
// jobs/screenshot-queue.js
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);

export const screenshotQueue = new Queue('screenshots', { connection });

// Add job to queue (called when access blocked)
export async function enqueueScreenshot(siteId, url, reason, logId) {
  await screenshotQueue.add('capture', {
    siteId,
    url,
    reason,
    logId
  }, {
    attempts: 3, // Retry 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 2000 // 2s, 4s, 8s
    },
    timeout: 15000 // 15s timeout
  });
}

// Worker process (jobs/screenshot-worker.js)
import { Worker } from 'bullmq';
import { chromium } from 'playwright';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });
let browser;

const worker = new Worker('screenshots', async (job) => {
  const { siteId, url, reason, logId } = job.data;
  
  // Lazy load browser
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto(url, { timeout: 10000, waitUntil: 'networkidle' });
    const screenshot = await page.screenshot({ fullPage: true });
    
    // Upload to S3
    const timestamp = new Date().toISOString();
    const key = `screenshots/blocked/${siteId}/${timestamp}-${reason}.png`;
    
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: screenshot,
      ContentType: 'image/png'
    }));
    
    const screenshotUrl = `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`;
    
    // Update access log with screenshot URL
    await db.query(
      'UPDATE access_logs SET screenshot_url = $1 WHERE id = $2',
      [screenshotUrl, logId]
    );
    
    return { screenshotUrl };
  } finally {
    await context.close();
  }
}, { connection });

worker.on('completed', (job) => {
  console.log(`Screenshot job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Screenshot job ${job.id} failed:`, err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close();
  if (browser) await browser.close();
});
```

### Alternative: Simple Async (No Queue)

If job queue is overkill for small deployments:

```javascript
async function logBlockedAccess(request, reason, clientIP, geoData) {
  const logId = await insertAccessLog(...);
  
  // Fire and forget (async, no await)
  captureScreenshot(request.site.id, request.url, reason, logId)
    .catch(err => fastify.log.error({ err }, 'Screenshot failed'));
  
  return logId;
}
```

---

## 6. Database Design Patterns

### Pattern: **Feature-Based Tables with Proper Indexing**

### Core Tables

```sql
-- Sites (multi-tenant root)
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  hostname VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  access_mode VARCHAR(20) NOT NULL DEFAULT 'disabled',
  
  -- IP filtering
  ip_allowlist INET[],
  ip_denylist INET[],
  country_allowlist VARCHAR(2)[],
  country_denylist VARCHAR(2)[],
  block_vpn_proxy BOOLEAN DEFAULT false,
  
  -- Geo filtering
  geofence_type VARCHAR(20),
  geofence_polygon GEOGRAPHY(POLYGON, 4326),
  geofence_center GEOGRAPHY(POINT, 4326),
  geofence_radius_km NUMERIC(10, 2),
  
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sites_hostname ON sites(hostname);
CREATE INDEX idx_sites_enabled ON sites(enabled);
CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_polygon);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  global_role VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- User site roles (many-to-many)
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

-- Access logs (partitioned by month)
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
  
  CHECK (timestamp >= '2026-01-01')
) PARTITION BY RANGE (timestamp);

-- Partition for February 2026
CREATE TABLE access_logs_2026_02 PARTITION OF access_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Indexes on partition
CREATE INDEX idx_access_logs_2026_02_site ON access_logs_2026_02(site_id, timestamp DESC);
CREATE INDEX idx_access_logs_2026_02_allowed ON access_logs_2026_02(allowed);
```

### Partitioning Strategy

**Why partition access_logs:**
- Table grows quickly (1M+ rows/month at scale)
- Old data rarely accessed
- Easy to drop old partitions (vs DELETE)

**Partition creation (monthly cron job):**

```javascript
// Create next month's partition
async function createNextMonthPartition() {
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  const year = nextMonth.getFullYear();
  const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
  
  const startDate = `${year}-${month}-01`;
  const endDate = new Date(year, nextMonth.getMonth() + 1, 1)
    .toISOString().split('T')[0];
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS access_logs_${year}_${month}
    PARTITION OF access_logs
    FOR VALUES FROM ('${startDate}') TO ('${endDate}')
  `);
  
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_access_logs_${year}_${month}_site
    ON access_logs_${year}_${month}(site_id, timestamp DESC)
  `);
}

// Run on 1st of every month
cron.schedule('0 0 1 * *', createNextMonthPartition);
```

---

## 7. Authentication & Authorization Architecture

### Pattern: **JWT + Refresh Tokens + RBAC**

**Why:**
- Stateless (no session storage)
- Scalable (no sticky sessions)
- Works with multi-instance deployments

### Token Flow

```
1. User Login
   ↓
2. Validate credentials
   ↓
3. Generate Access Token (JWT, 15min expiry)
   + Refresh Token (UUID, 7 day expiry, stored in DB)
   ↓
4. Return both tokens to client
   ↓
5. Client stores:
   - Access Token: Memory (or short-lived localStorage)
   - Refresh Token: HttpOnly cookie
   ↓
6. API requests include Access Token in Authorization header
   ↓
7. When Access Token expires:
   - Client sends Refresh Token to /auth/refresh
   - Server validates Refresh Token (check DB + expiry)
   - Generate new Access Token
   - Return new Access Token
```

### Implementation

```javascript
// Login route
fastify.post('/auth/login', async (request, reply) => {
  const { email, password } = request.body;
  
  // Validate credentials
  const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (!user.rows.length) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }
  
  const valid = await bcrypt.compare(password, user.rows[0].password_hash);
  if (!valid) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }
  
  // Fetch user's site roles
  const roles = await db.query(`
    SELECT site_id, role FROM user_site_roles WHERE user_id = $1
  `, [user.rows[0].id]);
  
  // Generate access token (JWT, 15min)
  const accessToken = fastify.jwt.sign({
    sub: user.rows[0].id,
    email: user.rows[0].email,
    role: user.rows[0].global_role,
    sites: roles.rows.reduce((acc, r) => {
      acc[r.site_id] = r.role;
      return acc;
    }, {})
  }, { expiresIn: '15m' });
  
  // Generate refresh token (random UUID, 7 days)
  const refreshToken = crypto.randomUUID();
  await db.query(`
    INSERT INTO refresh_tokens (token, user_id, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '7 days')
  `, [refreshToken, user.rows[0].id]);
  
  // Set refresh token in HttpOnly cookie
  reply.setCookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: true, // HTTPS only
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 // 7 days
  });
  
  return { accessToken };
});

// Refresh route
fastify.post('/auth/refresh', async (request, reply) => {
  const refreshToken = request.cookies.refresh_token;
  
  if (!refreshToken) {
    return reply.code(401).send({ error: 'No refresh token' });
  }
  
  // Validate refresh token
  const result = await db.query(`
    SELECT user_id FROM refresh_tokens
    WHERE token = $1 AND expires_at > NOW()
  `, [refreshToken]);
  
  if (!result.rows.length) {
    return reply.code(401).send({ error: 'Invalid refresh token' });
  }
  
  const userId = result.rows[0].user_id;
  
  // Fetch user and roles
  const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  const roles = await db.query(`
    SELECT site_id, role FROM user_site_roles WHERE user_id = $1
  `, [userId]);
  
  // Generate new access token
  const accessToken = fastify.jwt.sign({
    sub: userId,
    email: user.rows[0].email,
    role: user.rows[0].global_role,
    sites: roles.rows.reduce((acc, r) => {
      acc[r.site_id] = r.role;
      return acc;
    }, {})
  }, { expiresIn: '15m' });
  
  return { accessToken };
});

// JWT verification middleware
async function authenticateJWT(request, reply) {
  try {
    await request.jwtVerify(); // Fastify JWT plugin
    // JWT payload available as request.user
  } catch (err) {
    reply.code(401).send({ error: 'Invalid token' });
  }
}
```

---

## 8. Deployment Architecture

### Small Scale Deployment (Docker Compose)

**Best for:** <10k requests/day, single server

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/geoapp
      REDIS_URL: redis://redis:6379
      S3_BUCKET: artifacts
    depends_on:
      - db
      - redis
      - minio
    deploy:
      replicas: 2 # Run 2 instances
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - app
  
  db:
    image: postgis/postgis:16-3.6
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: geoapp
    volumes:
      - pgdata:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
  
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
  
  screenshot-worker:
    build: .
    command: node jobs/screenshot-worker.js
    environment:
      REDIS_URL: redis://redis:6379
      S3_BUCKET: artifacts
    depends_on:
      - redis
      - minio

volumes:
  pgdata:
  redisdata:
  miniodata:
```

### Medium Scale Deployment (Kubernetes)

**Best for:** 10k-100k requests/day, multi-instance

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: geo-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: geo-app
  template:
    metadata:
      labels:
        app: geo-app
    spec:
      containers:
      - name: app
        image: geo-app:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        - name: REDIS_URL
          value: redis://redis-service:6379
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: geo-app-service
spec:
  selector:
    app: geo-app
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: geo-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: geo-app
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## 9. Admin UI Architecture

### Pattern: **SPA with API Backend**

**Frontend:** React + TypeScript + Vite  
**Backend:** Fastify REST API

### Directory Structure

```
/admin-ui/
├─ src/
│  ├─ components/
│  │  ├─ SiteList.tsx
│  │  ├─ SiteEditor.tsx
│  │  ├─ GeofenceMap.tsx
│  │  ├─ AccessLogsTable.tsx
│  ├─ pages/
│  │  ├─ Dashboard.tsx
│  │  ├─ SiteDetail.tsx
│  │  ├─ Users.tsx
│  ├─ hooks/
│  │  ├─ useSites.ts (React Query)
│  │  ├─ useAuth.ts
│  ├─ lib/
│  │  ├─ api.ts (Axios client)
│  ├─ App.tsx
│  ├─ main.tsx
├─ package.json
├─ vite.config.ts
```

### State Management (React Query)

```typescript
// hooks/useSites.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data } = await api.get('/api/admin/sites');
      return data;
    },
    staleTime: 60000 // Cache for 60s
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data } = await api.patch(`/api/admin/sites/${id}`, updates);
      return data;
    },
    onSuccess: (data) => {
      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.setQueryData(['sites', data.id], data);
    }
  });
}
```

---

## Summary: Key Architectural Decisions

| Decision | Choice | Alternative Considered | Rationale |
|---|---|---|---|
| **Multi-Tenancy** | Shared DB, row-level isolation | Schema-per-site | Simplicity, 1000s of sites supported |
| **Caching** | LRU + Redis + DB | Redis only | Memory cache is 100x faster |
| **Async Jobs** | BullMQ + Redis | Simple async/await | Retry, monitoring, failure handling |
| **Auth** | JWT + Refresh Tokens | Sessions in DB | Stateless, scalable |
| **Geofencing** | PostGIS ST_Within | Turf.js | 10x faster, spatial indexes |
| **Screenshots** | Playwright + S3 | Puppeteer + local disk | Reliability, durability |
| **Deployment** | Docker Compose → K8s | VMs + PM2 | Scalability, reproducibility |

**Confidence Level:** HIGH (all patterns are industry-proven)

---

**Last Updated**: 2026-02-14  
**Researcher**: OpenCode Research Agent
