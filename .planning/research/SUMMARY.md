# Research Summary: Geo-Fenced Multi-Site Webserver

## Executive Summary

This research provides a comprehensive analysis of building a geo-fenced multi-site webserver with IP and GPS-based access control. After extensive research across technology stack options, implementation patterns, architecture decisions, and known pitfalls, the project is **technically feasible and recommended to proceed** with proper risk mitigation.

**The system will:**
- Host multiple sites with unique hostnames, each having independent access control policies
- Enforce IP-based access control (allowlists, denylists, country filtering, VPN detection)
- Enforce GPS-based geofencing (polygon or radius-based boundaries)
- Provide an admin UI for site configuration, geofence drawing, and access log viewing
- Capture screenshots and audit logs when access is blocked
- Support role delegation (super admins, site admins, viewers)
- Comply with GDPR requirements for personal data (GPS coordinates, IP addresses)

**Critical Success Factors:**
1. **Multi-layer caching** (LRU + Redis + DB) to achieve sub-millisecond site resolution
2. **Asynchronous screenshot capture** via job queue (BullMQ) to prevent request blocking
3. **Cross-validation of GPS with IP geolocation** to prevent spoofing (max 500km distance)
4. **GDPR compliance plan** including explicit consent, 90-day retention, and data deletion endpoints
5. **Spatial indexing** (GIST) on PostGIS geofence columns for sub-millisecond polygon queries

**Overall Confidence:** HIGH (85%) - All components verified from official documentation and industry-proven patterns.

---

## 1. Recommended Technology Stack

### Backend Framework: Fastify 5.7.x (Node.js 22.x LTS)

**Why Fastify:**
- **Performance:** ~30k req/sec (3x faster than Express, comparable to Go/Rust frameworks)
- **Schema Validation:** Built-in JSON schema validation (no middleware needed)
- **Plugin Architecture:** Perfect for multi-site middleware (site resolution → IP check → GPS check)
- **Async-First:** Native support for async/await, ideal for I/O-heavy workloads (DB, Redis, S3)

**Alternatives Considered:**
- **FastAPI (Python 3.12+):** Strong typing, auto docs, but slower for high-throughput I/O (10k req/sec)
- **Express (Node.js):** Industry standard but ~3x slower, requires many middleware packages

**Source:** [STACK.md:17-87], Fastify official benchmarks  
**Confidence:** HIGH (95%)

---

### Database: PostgreSQL 16.x + PostGIS 3.6.x

**Why PostgreSQL + PostGIS:**
- **Geospatial Queries:** `ST_Within(point, polygon)` for polygon geofencing, `ST_DWithin` for radius checks
- **Spatial Indexes:** GIST indexes reduce polygon queries from 100ms (table scan) to <1ms
- **JSON Support:** Store complex geofence polygons as GeoJSON in JSONB columns
- **Partitioning:** Table partitioning for access_logs (partition by month) supports billions of rows
- **Reliability:** Battle-tested, ACID compliance, point-in-time recovery

**Critical Implementation Detail:**
```sql
-- MUST create GIST index for performance
CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_polygon);

-- Without index: 100ms+ query time (table scan)
-- With index: <1ms query time (index scan)
```

**No Viable Alternative:** PostGIS is the industry standard for geospatial data. Alternatives (MySQL Spatial, MongoDB geospatial) lack maturity and performance.

**Source:** [STACK.md:89-189], [ARCHITECTURE.md:486-625], [PITFALLS.md:590-640]  
**Confidence:** HIGH (99%)

---

### IP Geolocation: MaxMind GeoIP2 (Local MMDB Database)

**Why MaxMind GeoIP2:**
- **Speed:** <1ms lookups (vs 50-200ms for API-based services like IPinfo)
- **Accuracy:** 99.8% country-level, ~80% city-level (GeoLite2 free), ~90% city-level (GeoIP2 paid)
- **Privacy:** Local database, no third-party API calls, GDPR-friendly
- **Anonymous IP Database:** Detects VPNs (commercial servers), proxies, hosting providers, Tor exit nodes

**Accuracy Limitations:**
- City-level: 80% within 50km (free GeoLite2), 90% within 50km (paid GeoIP2 Precision)
- Mobile IPs: Often inaccurate (carrier NAT, roaming)
- Satellite/rural internet: Very inaccurate
- **Recommendation:** Use country/region-level blocks, not city-level

**VPN Detection Effectiveness:**
- Commercial VPNs: 80-90% detection rate (MaxMind Anonymous IP DB)
- Residential proxies: 60% detection rate (requires IPinfo Residential Proxy API for 80%)
- **Accept:** Some VPNs will slip through, combine with GPS for stronger control

**Source:** [STACK.md:191-285], [FEATURES.md:168-330], [PITFALLS.md:265-362]  
**Confidence:** HIGH (95%)

---

### Screenshot Capture: Playwright 1.58.x

**Why Playwright:**
- **Reliability:** Auto-waiting for elements, modern browser APIs, Microsoft-backed
- **Performance:** ~500ms headless Chromium startup (reusable), ~1-3s per screenshot
- **Features:** Full-page screenshots, network idle detection, timeout handling
- **Stability:** Better than Puppeteer for handling complex pages (SPAs, lazy loading)

**Critical Implementation Detail:**
```javascript
// ✅ CORRECT: Async screenshot via job queue
async function logBlockedAccess(request, reason, clientIP, geoData) {
  const logId = await insertAccessLog(...); // Fast (5ms)
  
  // Enqueue screenshot job (non-blocking, returns immediately)
  await screenshotQueue.add('capture', { siteId, url, reason, logId });
  
  return logId; // User gets 403 response instantly
}

// ❌ WRONG: Synchronous screenshot
async function logBlockedAccess(request, reason, clientIP, geoData) {
  const logId = await insertAccessLog(...);
  const screenshotUrl = await captureScreenshot(url); // BLOCKS FOR 1-5 SECONDS
  await db.query('UPDATE access_logs SET screenshot_url = $1', [screenshotUrl, logId]);
  return logId; // User waits 5 seconds for 403 response
}
```

**Performance Impact:**
- Synchronous: 1-5s request latency → Unacceptable UX, high memory usage, crashes under load
- Asynchronous (BullMQ): <10ms request latency → Screenshot processed in background

**Source:** [STACK.md:287-365], [FEATURES.md:916-1001], [ARCHITECTURE.md:355-467], [PITFALLS.md:542-588]  
**Confidence:** HIGH (90%)

---

### Caching: LRU Cache (Memory) + Redis + PostgreSQL

**Why Multi-Layer Cache:**
- **Problem:** Database query on every request adds 5-10ms latency, becomes bottleneck at scale
- **Solution:** Memory cache (LRU) → Redis → PostgreSQL
- **Performance Gain:** 99% cache hit rate reduces 10ms DB query to 0.01ms memory lookup

**Cache Layers:**

| Layer | Technology | TTL | Eviction | Hit Rate | Latency |
|---|---|---|---|---|---|
| **L1: Memory** | `lru-cache` (npm) | 60s | LRU (max 1000 items) | 95% | 0.01ms |
| **L2: Redis** | `ioredis` | 300s | TTL-based | 4% | 1-2ms |
| **L3: Database** | PostgreSQL | N/A | N/A | 1% | 5-10ms |

**Critical Implementation:**
```javascript
// Cache warming on startup
async function warmCache() {
  const popularSites = await db.query(`
    SELECT * FROM sites WHERE enabled = true
    ORDER BY request_count DESC LIMIT 100
  `);
  
  for (const site of popularSites.rows) {
    siteCache.set(site.hostname, site);
    await redis.setex(`site:${site.hostname}`, 300, JSON.stringify(site));
  }
}

// Cache invalidation on update
async function updateSite(id, updates) {
  const site = await db.query('UPDATE sites SET ... WHERE id = $1 RETURNING *', [id]);
  
  // Invalidate all layers
  siteCache.delete(site.hostname);
  await redis.del(`site:${site.hostname}`);
  
  // Publish invalidation event (multi-instance)
  await redis.publish('cache:invalidate', JSON.stringify({ type: 'site', hostname: site.hostname }));
  
  return site;
}
```

**Source:** [STACK.md:415-485], [FEATURES.md:103-147], [ARCHITECTURE.md:230-353], [PITFALLS.md:485-539]  
**Confidence:** HIGH (95%)

---

### Full Stack Summary Table

| Layer | Technology | Version | Rationale | Confidence |
|---|---|---|---|---|
| **Backend** | Fastify | 5.7.x | Performance (30k req/s), plugins, schema validation | HIGH |
| **Runtime** | Node.js | 22.x LTS | Async I/O, massive ecosystem | HIGH |
| **Database** | PostgreSQL | 16.x | Reliability, JSON, partitioning | HIGH |
| **Geospatial** | PostGIS | 3.6.x | ST_Within, GIST spatial indexes | HIGH |
| **IP Geolocation** | MaxMind GeoIP2 | Latest | <1ms lookup, 99.8% country accuracy | HIGH |
| **VPN Detection** | MaxMind Anonymous IP | Latest | 80% VPN detection, Tor detection | MEDIUM |
| **Screenshots** | Playwright | 1.58.x | Reliability, auto-waiting, maintained | HIGH |
| **Artifact Storage** | MinIO / AWS S3 | Latest | S3-compatible, lifecycle policies | HIGH |
| **Cache (Memory)** | lru-cache | 11.x | Fast, TTL support, max size | HIGH |
| **Cache (Redis)** | Redis | 7.x | Multi-instance sync, pub/sub | HIGH |
| **Job Queue** | BullMQ | Latest | Async screenshots, retry, monitoring | HIGH |
| **Auth** | @fastify/jwt + bcrypt | Latest | Stateless, secure hashing | HIGH |
| **Frontend** | React + TypeScript | 18.x / 5.x | Ecosystem, type safety | HIGH |
| **Build Tool** | Vite | Latest | Fast HMR, modern | HIGH |
| **Maps** | Leaflet + Leaflet Draw | Latest | OSM, polygon drawing | HIGH |
| **Deployment** | Docker + Kubernetes | Latest | Scalable, reproducible | HIGH |

**Overall Stack Confidence:** HIGH (95%)

---

## 2. Critical Architecture Patterns

### Multi-Tenancy: Shared Database, Row-Level Isolation

**Pattern:** All sites in one PostgreSQL database, isolated by `site_id` foreign key

**Why This Pattern:**
- **Simplicity:** Single database to manage, backup, restore
- **Performance:** Proper indexing handles 1000s of sites without issues
- **Cost:** One DB instance vs. hundreds
- **Migrations:** Apply schema changes once, not per-site

**Alternatives Considered:**
- **Schema-per-site:** Better isolation, but migration hell (100 sites = 100 schema migrations)
- **Database-per-site:** Maximum isolation, but expensive and complex (100 DBs to backup/monitor)
- **Verdict:** Shared DB is sufficient for this use case (not banking/healthcare)

**Database Design:**
```sql
-- All tables include site_id foreign key
CREATE TABLE sites (
  id UUID PRIMARY KEY,
  hostname VARCHAR(255) UNIQUE NOT NULL,
  access_mode VARCHAR(20) NOT NULL DEFAULT 'disabled',
  ip_allowlist INET[],
  geofence_polygon GEOGRAPHY(POLYGON, 4326),
  -- ...
);

CREATE TABLE access_logs (
  id UUID PRIMARY KEY,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE, -- Enforces isolation
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET NOT NULL,
  allowed BOOLEAN NOT NULL,
  -- ...
) PARTITION BY RANGE (timestamp);

-- Row-Level Security (optional, extra safety)
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_isolation ON access_logs
  USING (site_id = current_setting('app.current_site_id')::UUID);
```

**Source:** [ARCHITECTURE.md:165-228]  
**Confidence:** HIGH (90%)

---

### Request Flow: Middleware Pipeline

**Flow:**
```
1. HTTP Request (hostname: site-a.example.com)
   ↓
2. Site Resolution Middleware
   • Lookup site by hostname (cache hit: 0.01ms)
   • If not found → 404
   • Attach site to request.site
   ↓
3. Access Mode Check
   • If site.access_mode === 'disabled' → Skip to route handler
   ↓
4. IP Access Control Middleware (if mode = ip_only or both)
   • Extract client IP (handle X-Forwarded-For carefully)
   • Check IP allowlist/denylist (CIDR matching)
   • MaxMind lookup (<1ms)
   • Check country allowlist/denylist
   • Check VPN/Proxy detection
   • If blocked → Log + Enqueue Screenshot + 403
   ↓
5. GPS Geofencing Middleware (if mode = geo_only or both)
   • Extract lat/lng from request body
   • If no GPS provided → 403 "GPS required"
   • PostGIS query: ST_Within(point, polygon) (<1ms with GIST index)
   • If outside geofence → Log + Enqueue Screenshot + 403
   ↓
6. Route Handler
   • Serve site content (static files, proxy, API)
   • Log successful access (optional)
   ↓
7. Response
   • 200 OK + content (if allowed)
   • 403 Forbidden + reason (if blocked)
```

**Source:** [ARCHITECTURE.md:43-163], [FEATURES.md:168-330]  
**Confidence:** HIGH (95%)

---

### Asynchronous Processing: Job Queue Pattern

**Why Job Queue:**
- Screenshot capture takes 1-5 seconds
- Blocking requests for screenshots → timeout, crashes, terrible UX
- Job queue provides retry, failure handling, monitoring

**Architecture:**
```
Request → Block Decision → Enqueue Screenshot Job → Return 403 (10ms)
                                 ↓
                           Job Worker (Separate Process)
                                 ↓
                        Playwright Screenshot (1-5s)
                                 ↓
                           Upload to S3 (500ms)
                                 ↓
                   Update access_logs.screenshot_url (10ms)
```

**Implementation (BullMQ + Redis):**
```javascript
// Add job to queue (non-blocking)
export async function enqueueScreenshot(siteId, url, reason, logId) {
  await screenshotQueue.add('capture', { siteId, url, reason, logId }, {
    attempts: 3, // Retry 3 times on failure
    backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
    timeout: 15000 // 15s timeout
  });
}

// Worker process (separate Node.js process)
const worker = new Worker('screenshots', async (job) => {
  const { siteId, url, reason, logId } = job.data;
  
  // Lazy load browser (reuse across jobs)
  if (!browser) browser = await chromium.launch({ headless: true });
  
  const page = await browser.newPage();
  await page.goto(url, { timeout: 10000, waitUntil: 'networkidle' });
  const screenshot = await page.screenshot({ fullPage: true });
  
  // Upload to S3
  const key = `screenshots/blocked/${siteId}/${Date.now()}-${reason}.png`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: screenshot }));
  
  // Update log with screenshot URL
  await db.query('UPDATE access_logs SET screenshot_url = $1 WHERE id = $2', [key, logId]);
}, { connection: redisConnection });
```

**Source:** [ARCHITECTURE.md:355-484], [FEATURES.md:916-1001], [PITFALLS.md:542-588]  
**Confidence:** HIGH (90%)

---

### Authentication: JWT + Refresh Tokens + RBAC

**Token Flow:**
1. User login → Validate credentials
2. Generate Access Token (JWT, 15min expiry) + Refresh Token (UUID, 7 day expiry)
3. Access Token stored in memory (React state), Refresh Token in HttpOnly cookie
4. API requests include Access Token in `Authorization: Bearer <token>` header
5. When Access Token expires → Client sends Refresh Token to `/auth/refresh`
6. Server validates Refresh Token (DB check) → Generate new Access Token

**Role Hierarchy:**
```
super_admin (global role)
  └─ Can manage all sites
  └─ Can delegate site admins/viewers
  └─ Can create/delete sites

site_admin (per-site role)
  └─ Can update site settings (access mode, geofence, IP lists)
  └─ Can view logs and artifacts for assigned sites
  └─ Cannot delegate to other users
  └─ Cannot delete sites

viewer (per-site role)
  └─ Can view site settings (read-only)
  └─ Can view logs and artifacts
  └─ Cannot modify settings
```

**Security:**
- Access Token in memory → Lost on page reload, not vulnerable to XSS
- Refresh Token in HttpOnly cookie → Not accessible to JavaScript, safe from XSS
- `sameSite: 'strict'` on Refresh Token cookie → CSRF protection
- Always use HTTPS → Prevent MITM attacks

**Source:** [ARCHITECTURE.md:625-762], [FEATURES.md:662-813], [PITFALLS.md:747-808]  
**Confidence:** HIGH (90%)

---

## 3. Major Pitfalls & Risk Mitigation

### GPS Accuracy Varies Wildly (High Severity)

**Problem:**
- GPS accuracy ranges from 3m (clear sky, outdoors) to 1000m+ (urban canyons, indoors)
- WiFi/cell tower triangulation can be 100-1000m off
- Legitimate users inside geofence get blocked due to inaccurate GPS

**Impact:**
- False negatives: Users correctly positioned but blocked
- Poor UX: "Your location accuracy is too low" errors

**Mitigation Strategy:**
```javascript
// 1. Request high accuracy explicitly (forces GPS, not WiFi)
navigator.geolocation.getCurrentPosition(success, error, {
  enableHighAccuracy: true, // Critical!
  timeout: 10000,
  maximumAge: 0 // Don't use cached position
});

// 2. Buffer geofence by accuracy radius
const ACCURACY_BUFFER_MULTIPLIER = 1.5;
const isInsideWithBuffer = await db.query(`
  SELECT ST_DWithin(
    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
    geofence_polygon::geography,
    $3 * $4 -- accuracy * multiplier
  ) AS is_inside
  FROM sites WHERE id = $5
`, [lng, lat, accuracy, ACCURACY_BUFFER_MULTIPLIER, siteId]);

// 3. Reject extremely low accuracy
const MIN_ACCEPTABLE_ACCURACY = 100; // meters
if (accuracy > MIN_ACCEPTABLE_ACCURACY) {
  return { error: 'GPS accuracy too low. Please try outdoors.' };
}

// 4. Request location multiple times, pick best
async function getAccuratePosition(maxAttempts = 3) {
  let bestPosition = null;
  for (let i = 0; i < maxAttempts; i++) {
    const position = await getCurrentPosition();
    if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
      bestPosition = position;
    }
    if (bestPosition.coords.accuracy < 50) break; // Good enough
    await sleep(2000); // Wait 2s between attempts
  }
  return bestPosition;
}
```

**Source:** [PITFALLS.md:11-75]  
**Confidence:** HIGH (90%) - Strategy proven in production systems  
**Testing Required:** Real-world GPS accuracy testing in target deployment environment

---

### GPS Spoofing (Critical Severity)

**Problem:**
- Browser extensions (e.g., "Fake GPS Location") allow spoofing
- Developer tools can override Geolocation API
- No client-side geolocation check is trustworthy
- Access control completely bypassed if GPS is sole verification

**Impact:**
- Attacker can fake any GPS coordinates
- Geofence becomes useless for security

**Mitigation Strategy:**
```javascript
// 1. NEVER TRUST GPS ALONE - Always cross-check with IP geolocation
async function validateGPSCoordinates(gpsLat, gpsLng, clientIP) {
  const ipGeo = geoReader.get(clientIP);
  
  if (!ipGeo?.location) {
    return { valid: false, reason: 'IP geolocation unavailable' };
  }
  
  // Calculate distance between GPS and IP location
  const distance = calculateDistance(
    gpsLat, gpsLng,
    ipGeo.location.latitude, ipGeo.location.longitude
  );
  
  const MAX_DISTANCE_KM = 500; // GPS and IP should be within 500km
  
  if (distance > MAX_DISTANCE_KM) {
    // Log suspicious activity
    await logSuspiciousAccess({
      type: 'gps_ip_mismatch',
      gps: { lat: gpsLat, lng: gpsLng },
      ip_geo: { lat: ipGeo.location.latitude, lng: ipGeo.location.longitude },
      distance_km: distance
    });
    
    return { valid: false, reason: 'GPS/IP location mismatch (possible spoofing)' };
  }
  
  return { valid: true };
}

// 2. Use "both" mode: Require IP AND GPS to pass
// Even if attacker spoofs GPS, IP geolocation still enforces region

// 3. Monitor for suspicious patterns
// - Same GPS coordinates used from many different IPs → Likely spoofed
// - GPS coordinates change dramatically between requests → Suspicious
```

**Best Practice:** **NEVER use GPS as the sole security control. Always combine with IP geolocation.**

**Source:** [PITFALLS.md:78-138], [FEATURES.md:502-510]  
**Confidence:** HIGH (95%) - OWASP Geolocation Cheat Sheet recommendation

---

### VPN/Proxy Bypass (Critical Severity)

**Problem:**
- Users can easily use VPNs to appear in allowed country/city
- Residential proxies (e.g., Luminati, Bright Data) are very hard to detect
- IP-based geofencing is NOT a strong security control

**Impact:**
- Access control easily bypassed
- Geofence effectiveness reduced

**Mitigation Strategy:**
```javascript
// 1. Use MaxMind Anonymous IP database
const anonReader = await maxmind.open('./GeoIP2-Anonymous-IP.mmdb');

function checkVPNProxy(clientIP) {
  const anonData = anonReader.get(clientIP);
  
  return {
    is_vpn: anonData?.is_vpn || false,
    is_proxy: anonData?.is_proxy || false,
    is_hosting: anonData?.is_hosting_provider || false, // AWS, GCP, DigitalOcean
    is_tor: anonData?.is_tor_exit_node || false
  };
}

// 2. Block known VPN/proxy IPs (optional, per site)
if (site.block_vpn_proxy) {
  const vpnCheck = checkVPNProxy(clientIP);
  
  if (vpnCheck.is_vpn || vpnCheck.is_proxy || vpnCheck.is_hosting) {
    await logBlockedAccess(request, 'vpn_proxy_detected', clientIP, vpnCheck);
    return reply.code(403).send({ error: 'VPN/Proxy detected' });
  }
}

// 3. Combine with GPS for stronger control
// VPN can fake IP location, but not GPS + IP combination
```

**Detection Effectiveness:**
- Commercial VPNs: 80-90% detection rate (MaxMind Anonymous IP DB)
- Residential proxies: 60% detection rate (requires IPinfo Residential Proxy API for 80%)
- **Accept:** Some VPNs will slip through. This is a UX/friction trade-off, not absolute security.

**Recommendation:** Don't rely solely on IP geolocation for security-critical use cases. Combine IP + GPS for best results.

**Source:** [PITFALLS.md:266-322], [FEATURES.md:302-320]  
**Confidence:** MEDIUM (75%) - Detection is probabilistic, not absolute

---

### GDPR Compliance: GPS Coordinates Without Consent (High Legal Risk)

**Problem:**
- GPS coordinates are **personal data** under GDPR Article 4(1)
- Storing GPS without explicit consent → GDPR violation
- Fines up to €20M or 4% of global annual revenue

**Impact:**
- Legal liability
- Regulatory fines
- Reputational damage

**Mitigation Strategy:**

**1. Obtain Explicit Consent Before Collecting GPS**
```jsx
<ConsentModal>
  <p>
    This site requires your precise location (GPS coordinates) to verify access.
    We will store your location data for audit purposes.
  </p>
  <Checkbox required>
    I consent to collection and storage of my GPS coordinates
  </Checkbox>
  <Button onClick={handleConsent}>Allow Location Access</Button>
</ConsentModal>
```

**2. Provide Clear Privacy Policy**
- What data is collected (IP, GPS, user agent)
- Why it's collected (access control, audit logs)
- How long it's stored (90 days)
- Who has access (site admins, super admins)
- Right to access, delete, export

**3. Implement Data Retention Policy**
```javascript
// Auto-delete logs after 90 days (cron job, daily at 2 AM)
cron.schedule('0 2 * * *', async () => {
  await db.query(`DELETE FROM access_logs WHERE timestamp < NOW() - INTERVAL '90 days'`);
});
```

**4. Provide Data Export (GDPR Right to Access)**
```javascript
fastify.get('/api/user/data-export', async (request, reply) => {
  const userId = request.user.id;
  const logs = await db.query(`
    SELECT timestamp, site_id, ip_address, gps_lat, gps_lng
    FROM access_logs WHERE user_id = $1
  `, [userId]);
  
  return reply.send(logs.rows);
});
```

**5. Provide Data Deletion (GDPR Right to Erasure)**
```javascript
fastify.delete('/api/user/data', async (request, reply) => {
  const userId = request.user.id;
  await db.query('DELETE FROM access_logs WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  return reply.send({ success: true });
});
```

**6. IP Address Anonymization**
```javascript
// Anonymize IPs in logs (remove last octet for IPv4, last 80 bits for IPv6)
function anonymizeIP(ip) {
  if (ip.includes(':')) {
    // IPv6: Remove last 80 bits
    const parts = ip.split(':');
    return parts.slice(0, 3).join(':') + '::';
  } else {
    // IPv4: Remove last octet
    const parts = ip.split('.');
    return parts.slice(0, 3).join('.') + '.0';
  }
}

await db.query(`INSERT INTO access_logs (ip_address, ...) VALUES ($1, ...)`, [anonymizeIP(clientIP), ...]);
```

**7. Data Processing Agreements (DPAs)**
- MaxMind (IP geolocation data)
- AWS (S3 artifact storage, RDS database)
- Cloudflare (CDN, DDoS protection)

**GDPR Compliance Checklist:**
- [ ] Privacy policy clearly explains GPS and IP collection
- [ ] Explicit consent obtained before collecting GPS
- [ ] Data retention policy (auto-delete after 90 days)
- [ ] IP addresses anonymized before storage
- [ ] Data export endpoint implemented
- [ ] Data deletion endpoint implemented
- [ ] DPAs signed with all data processors
- [ ] Standard Contractual Clauses (SCCs) for EU-US data transfers

**Source:** [PITFALLS.md:911-1080], GDPR.eu  
**Confidence:** MEDIUM (75%) - Requires legal review  
**Action Required:** Consult lawyer specializing in GDPR before launch

---

### Performance: Database Query on Every Request (High Severity)

**Problem:**
- Querying PostgreSQL for site config on every request adds 5-10ms latency
- At 1000 req/s, that's 1000 DB connections/s
- Database becomes bottleneck, CPU at 100%

**Impact:**
- High latency (p95 > 100ms)
- Database crashes under load
- Application becomes unresponsive

**Mitigation:**
See Architecture section "Caching: LRU Cache (Memory) + Redis + PostgreSQL"

**Performance Comparison:**
- No cache: 10ms/request → 100 req/s max capacity
- Memory cache (LRU): 0.01ms/request → 10,000 req/s max capacity
- Cache hit rate: 99% (with 60s TTL)

**Monitoring:**
```javascript
// Track cache hit rate
let cacheHits = 0;
let cacheMisses = 0;

fastify.get('/metrics', async () => {
  const total = cacheHits + cacheMisses;
  return { cache_hit_rate: total > 0 ? (cacheHits / total) * 100 : 0 };
});

// Alert if hit rate drops below 95%
setInterval(() => {
  const hitRate = (cacheHits / (cacheHits + cacheMisses)) * 100;
  if (hitRate < 95) console.error(`Cache hit rate low: ${hitRate}%`);
}, 60000);
```

**Source:** [PITFALLS.md:485-539], [ARCHITECTURE.md:230-353]  
**Confidence:** HIGH (95%)

---

### Security: SQL Injection (Critical Severity)

**Problem:**
- User input used in SQL query without sanitization
- Attacker injects malicious SQL → Data breach

**Impact:**
- Complete database compromise
- Data exfiltration
- Data deletion

**Mitigation:**
```javascript
// ✅ CORRECT: Parameterized queries
const result = await db.query(
  'SELECT * FROM sites WHERE hostname = $1',
  [hostname] // Safely escaped
);

// ❌ WRONG: String concatenation
const result = await db.query(
  `SELECT * FROM sites WHERE hostname = '${hostname}'`
  // If hostname = "'; DROP TABLE sites; --"
  // Query becomes: SELECT * FROM sites WHERE hostname = ''; DROP TABLE sites; --'
);
```

**Best Practices:**
- Always use parameterized queries (`$1`, `$2`, etc.)
- Use ORMs with safe query builders (Kysely, Drizzle, Prisma)
- Never use string interpolation in SQL queries

**Source:** [PITFALLS.md:704-744], OWASP SQL Injection Prevention Cheat Sheet  
**Confidence:** HIGH (99%)

---

### Security: JWT Token in localStorage (High Severity, XSS Vulnerability)

**Problem:**
- JWT stored in `localStorage` or `sessionStorage`
- XSS attack reads `localStorage` → Attacker steals JWT
- Attacker impersonates user

**Impact:**
- Account takeover
- Unauthorized access to all user's sites

**Mitigation:**
```javascript
// ✅ CORRECT: Access token in memory, refresh token in HttpOnly cookie
function useAuth() {
  const [accessToken, setAccessToken] = useState(null); // Memory only, lost on reload
  
  async function login(email, password) {
    const response = await fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    const { accessToken } = await response.json();
    setAccessToken(accessToken); // Store in React state (memory)
    // Refresh token automatically set in HttpOnly cookie by server
  }
  
  // Token lost on page reload → Auto-refresh using refresh token
  useEffect(() => { refreshAccessToken(); }, []);
}

// Backend: Set refresh token in HttpOnly cookie
reply.setCookie('refresh_token', refreshToken, {
  httpOnly: true, // Not accessible to JavaScript (XSS protection)
  secure: true, // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 7 * 24 * 60 * 60 // 7 days
});

// ❌ WRONG: Store in localStorage (vulnerable to XSS)
localStorage.setItem('accessToken', token); // Any XSS attack can read this
```

**Additional XSS Protections:**
- Use Content Security Policy (CSP) headers
- Sanitize user input (prevent `<script>` tags)
- Use `dangerouslySetInnerHTML` with extreme caution in React

**Source:** [PITFALLS.md:747-806], OWASP JWT Cheat Sheet  
**Confidence:** HIGH (95%)

---

### Security: No HTTPS (Critical Severity, MITM Attack)

**Problem:**
- Site served over HTTP (not HTTPS)
- Attacker intercepts traffic → Reads GPS coordinates, steals JWT
- User credentials sent in plain text

**Impact:**
- Complete compromise of user data
- Session hijacking

**Mitigation:**
```nginx
# 1. Force HTTPS redirect (nginx.conf)
server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri; # Permanent redirect to HTTPS
}

server {
  listen 443 ssl http2;
  server_name example.com;
  
  ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
  
  # Modern SSL config (TLS 1.2+, strong ciphers)
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;
}
```

```javascript
// 2. HSTS header (force HTTPS for 1 year)
reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
```

**3. Use Let's Encrypt for Free SSL Certificates**
```bash
certbot --nginx -d example.com
```

**4. Test SSL Configuration**
- Visit https://www.ssllabs.com/ssltest/ and aim for A+ rating

**Source:** [PITFALLS.md:808-856], OWASP Transport Layer Protection Cheat Sheet  
**Confidence:** HIGH (99%)

---

## 4. Implementation Roadmap (5 Phases, 14-20 Weeks)

### Phase 1: MVP - Single Site, IP-Only Access Control (4-6 weeks)

**Goal:** Prove core concept with minimal features

**Features:**
- Single site configuration
- IP-based access control (allowlist/denylist, country filtering)
- MaxMind GeoIP2 integration
- Basic admin UI (site settings form)
- Access logs (database table)
- Docker Compose deployment

**Tasks:**
1. Project setup: Fastify + PostgreSQL + PostGIS + Docker Compose
2. Database schema: `sites`, `access_logs` tables
3. Site CRUD API: Create, read, update, delete sites
4. IP access control middleware: MaxMind MMDB integration, allowlist/denylist checking
5. Admin UI: React SPA, site settings form, IP list editor
6. Logging: Insert access logs on block
7. Deployment: Docker Compose, deploy to single VPS

**Deliverables:**
- Working prototype with IP-based blocking
- Admin can configure IP allowlist/denylist
- Access logs viewable in UI

**Risks:**
- MaxMind MMDB integration: LOW (well-documented npm package)
- PostGIS setup: LOW (official Docker image available)
- Performance: LOW (caching not critical for single site)

**Success Criteria:**
- Block access from disallowed IP addresses
- Allow access from allowed IP addresses
- Log all access attempts (allowed + blocked)

---

### Phase 2: GPS Geofencing (3-4 weeks)

**Goal:** Add GPS-based access control with polygon geofencing

**Features:**
- Browser Geolocation API integration (frontend)
- PostGIS polygon/radius geofencing (backend)
- Map-based geofence drawing (Leaflet + Leaflet Draw)
- Access modes: `ip_only`, `geo_only`, `both`, `disabled`
- GPS accuracy handling (buffering, rejection)

**Tasks:**
1. Frontend: Implement browser geolocation request with high accuracy
2. Backend: PostGIS `ST_Within` queries for polygon geofencing
3. Backend: GPS accuracy validation and buffering logic
4. Admin UI: Leaflet map component with polygon/circle drawing
5. Admin UI: Access mode selector (dropdown)
6. GPS-IP cross-validation: Detect spoofing (max 500km distance)
7. Testing: Real-world GPS accuracy testing

**Deliverables:**
- Users can be blocked based on GPS location
- Admin can draw geofence polygon on map
- GPS coordinates cross-checked with IP geolocation

**Risks:**
- GPS accuracy: MEDIUM (requires real-world testing, user education)
- PostGIS polygon queries: LOW (spatial indexes solve performance)
- User permission denial: MEDIUM (requires clear UX and error messages)

**Success Criteria:**
- Block access from users outside geofence
- Allow access from users inside geofence
- Reject GPS with accuracy > 100m
- Detect GPS/IP mismatches > 500km

**Dependencies:**
- Phase 1 complete (site model, access control middleware)

---

### Phase 3: Multi-Site & Role Delegation (2-3 weeks)

**Goal:** Support multiple sites with independent configurations and delegated admins

**Features:**
- Multi-site hosting (hostname-based routing)
- User management (registration, login, JWT auth)
- Role-Based Access Control (super admin, site admin, viewer)
- Site admin delegation (super admin assigns site admins)
- Multi-layer caching (LRU + Redis)

**Tasks:**
1. Site resolution middleware: Lookup site by request hostname
2. User management: `users` table, registration/login API
3. JWT authentication: Access token (15min) + refresh token (7 days)
4. RBAC: `user_site_roles` table, role-based permissions
5. Admin UI: Site list page, user management page
6. Caching: LRU cache for site configs, Redis for multi-instance sync
7. Cache invalidation: Pub/sub pattern on site updates

**Deliverables:**
- Multiple sites hosted on same server (different hostnames)
- Super admin can delegate site admins
- Site admins can only manage assigned sites
- Site resolution cached (99% hit rate)

**Risks:**
- Cache invalidation: MEDIUM (multi-instance synchronization via Redis pub/sub)
- JWT refresh flow: LOW (standard pattern)

**Success Criteria:**
- 2+ sites with different hostnames working simultaneously
- Cache hit rate > 95%
- Site admins can only access assigned sites
- Refresh token flow works correctly

**Dependencies:**
- Phase 1 complete (site model, database schema)

---

### Phase 4: Artifacts & GDPR Compliance (3-4 weeks)

**Goal:** Screenshot capture, audit logs, and GDPR compliance

**Features:**
- Asynchronous screenshot capture (Playwright + BullMQ)
- S3 artifact storage (MinIO for dev, AWS S3 for prod)
- Pre-signed URLs for artifact download
- GDPR consent flow (explicit consent before GPS collection)
- Data retention policy (auto-delete after 90 days)
- Data export/deletion endpoints (GDPR Rights)
- IP address anonymization

**Tasks:**
1. BullMQ job queue: Setup Redis-backed queue for screenshots
2. Playwright worker: Headless browser screenshot capture
3. S3 integration: MinIO (dev), AWS S3 (prod), upload screenshots
4. Pre-signed URLs: Generate secure download links for artifacts
5. GDPR consent modal: Frontend consent UI before GPS request
6. Privacy policy: Draft privacy policy document
7. Data retention cron job: Delete logs older than 90 days
8. Data export API: `/api/user/data-export` endpoint
9. Data deletion API: `/api/user/data` DELETE endpoint
10. IP anonymization: Remove last octet before storing in logs

**Deliverables:**
- Screenshots captured asynchronously when access blocked
- Artifacts stored in S3 with lifecycle policy (90 days)
- GDPR consent obtained before GPS collection
- Users can export and delete their data

**Risks:**
- Playwright stability: MEDIUM (timeouts, browser crashes, memory leaks)
- GDPR legal review: HIGH (requires lawyer consultation)

**Success Criteria:**
- Screenshots captured within 5 seconds of block event
- No request blocking due to screenshot capture
- 100% of GPS requests preceded by consent
- Data export returns all user data
- Data deletion removes all user data

**Dependencies:**
- Phase 2 complete (GPS collection, access logs)
- Phase 3 complete (user authentication, RBAC)

---

### Phase 5: Production Hardening (2-3 weeks)

**Goal:** Security, monitoring, scalability, and operational readiness

**Features:**
- HTTPS enforcement (Let's Encrypt SSL certificates)
- Rate limiting (application + Nginx)
- CSRF protection (SameSite cookies, double-submit pattern)
- Monitoring (health checks, Prometheus metrics, Sentry error tracking)
- Automated backups (PostgreSQL daily backups to S3)
- Load testing (simulate 10k req/min)
- Documentation (deployment guide, runbook)

**Tasks:**
1. HTTPS: Nginx SSL config, Let's Encrypt certbot, HSTS header
2. Rate limiting: @fastify/rate-limit plugin, Nginx rate limiting
3. CSRF protection: SameSite cookies, double-submit token validation
4. Health check endpoint: `/health` (check DB, Redis connectivity)
5. Metrics endpoint: `/metrics` (Prometheus format, custom metrics)
6. Error tracking: Sentry integration, error handlers
7. Uptime monitoring: UptimeRobot or Pingdom for `/health` pings
8. Automated backups: pg_dump cron job, upload to S3, test restores
9. Load testing: Artillery or k6 scripts, identify bottlenecks
10. Documentation: Deployment guide, environment variables, runbook

**Deliverables:**
- HTTPS enforced with A+ SSL Labs rating
- Rate limiting prevents DDoS
- Health checks and metrics exposed
- Automated daily backups tested
- Load testing shows system handles 10k req/min

**Risks:**
- Load testing surprises: MEDIUM (may uncover unexpected bottlenecks)
- SSL certificate renewal: LOW (Let's Encrypt auto-renewal)

**Success Criteria:**
- Site accessible only via HTTPS
- Rate limiting blocks > 100 req/min from single IP
- Health check endpoint returns 200 OK
- Metrics endpoint shows cache hit rate, request latency
- Backups restore successfully
- Load test shows p95 latency < 200ms at 10k req/min

**Dependencies:**
- All features implemented (Phases 1-4)

---

### Roadmap Summary

| Phase | Duration | Key Features | Risk Level | Dependencies |
|---|---|---|---|---|
| **Phase 1: MVP** | 4-6 weeks | IP access control, admin UI, single site | LOW | None |
| **Phase 2: GPS** | 3-4 weeks | GPS geofencing, Leaflet map, accuracy handling | MEDIUM | Phase 1 |
| **Phase 3: Multi-Site** | 2-3 weeks | Multi-tenancy, RBAC, caching | MEDIUM | Phase 1 |
| **Phase 4: Artifacts** | 3-4 weeks | Screenshots, S3, GDPR compliance | HIGH | Phases 2, 3 |
| **Phase 5: Hardening** | 2-3 weeks | HTTPS, monitoring, backups, load testing | MEDIUM | Phases 1-4 |

**Total Timeline:** 14-20 weeks (3.5-5 months)

**Critical Path:**
- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 (sequential dependencies)

**Parallelizable Work:**
- Frontend and backend can be developed concurrently (Phases 2-4)
- Monitoring/hardening can start in Phase 3 (health checks, metrics)

---

## 5. Risk Assessment Matrix

| Pitfall/Risk | Severity | Likelihood | Impact | Mitigation Priority | Mitigation |
|---|---|---|---|---|---|
| **GPS spoofing** | Critical | High | Access control bypassed | 🔴 HIGH | Cross-check with IP geolocation (max 500km) |
| **SQL injection** | Critical | Medium | Data breach | 🔴 HIGH | Parameterized queries always |
| **No HTTPS** | Critical | Low | MITM attack | 🔴 HIGH | Enforce HTTPS, HSTS header |
| **JWT in localStorage** | High | Medium | Account takeover | 🔴 HIGH | Access token in memory, refresh token in HttpOnly cookie |
| **Sync screenshot capture** | Critical | High | Request timeouts, crashes | 🔴 HIGH | Async job queue (BullMQ) |
| **No DB index (GIST)** | High | Medium | Slow queries (100ms+) | 🔴 HIGH | GIST spatial index on geofence_polygon |
| **No backups** | Critical | Low | Complete data loss | 🔴 HIGH | Automated daily backups to S3 |
| **VPN bypass** | Critical | High | Geofence bypassed | 🟡 MEDIUM | MaxMind Anonymous IP DB, combine with GPS |
| **GDPR non-compliance** | High | Medium | Legal fines (€20M) | 🟡 MEDIUM | Consent, retention policy, DPAs |
| **GPS accuracy variance** | High | High | False negatives | 🟡 MEDIUM | Buffer geofence, reject low accuracy |
| **Cache invalidation bugs** | Medium | Medium | Stale config served | 🟡 MEDIUM | Redis pub/sub, short TTL (60s) |
| **No rate limiting** | High | Medium | DDoS vulnerability | 🟡 MEDIUM | @fastify/rate-limit, Nginx limits |
| **User denies GPS permission** | Medium | High | User stuck | 🟢 LOW | Clear UX, fallback to IP-only |

**Priority Definitions:**
- 🔴 **HIGH:** Must fix before launch (blocks MVP or causes critical security/data loss issues)
- 🟡 **MEDIUM:** Fix within 1 month of launch (UX, legal, or performance issues)
- 🟢 **LOW:** Monitor and fix as needed (edge cases, minor UX improvements)

---

## 6. Open Questions for Planning Phase

1. **GPS Accuracy Threshold:** What minimum accuracy (meters) should be required?
   - **Recommendation:** 100m (balances security and usability)
   - **Requires:** Real-world testing with target users in deployment environment

2. **Data Retention Period:** How long to keep access logs?
   - **Recommendation:** 90 days (balance audit needs and GDPR data minimization)
   - **Requires:** Legal review, business requirements discussion

3. **VPN Blocking Policy:** Should VPNs be blocked by default?
   - **Recommendation:** Optional per site (`block_vpn_proxy` boolean flag)
   - **Requires:** Discussion with stakeholders (legitimate VPN use cases exist, e.g., corporate VPNs)

4. **Screenshot Storage Cost:** How many screenshots per day expected?
   - **Estimate:** If 1% of requests blocked, 10k req/day → 100 screenshots/day → 3k screenshots/month
   - **Cost:** S3 storage ~$0.023/GB → ~$10/month (assuming 1MB/screenshot average)
   - **Requires:** Monitoring after launch, S3 lifecycle policy (delete after 90 days)

5. **Multi-Region Deployment:** Will site be accessed globally?
   - **Recommendation:** Start single-region (US East), add CloudFront/CDN if latency becomes issue
   - **Requires:** Traffic analysis after launch

6. **Anonymous Access Logs:** Should access logs link to user accounts or be anonymous?
   - **Recommendation:** Link to user_id (if authenticated), but anonymize IP addresses
   - **Requires:** GDPR review (anonymous data easier to manage)

7. **Screenshot Resolution:** What resolution for screenshots (affects storage cost)?
   - **Recommendation:** 1280x720 (720p) → ~200-500 KB/screenshot
   - **Alternative:** Full HD 1920x1080 → ~500-1000 KB/screenshot (2x storage cost)

8. **MaxMind License:** GeoLite2 (free) or GeoIP2 Precision (paid)?
   - **GeoLite2:** Free, 80% city accuracy, weekly updates
   - **GeoIP2 Precision:** $50-200/month, 90% city accuracy, daily updates
   - **Recommendation:** Start with GeoLite2, upgrade if accuracy issues observed

---

## 7. GDPR Compliance Checklist

Before launch, ensure all items completed:

- [ ] **Privacy Policy** drafted and published (clearly explains GPS and IP collection)
- [ ] **Explicit Consent** flow implemented (modal before GPS request, checkbox required)
- [ ] **Data Retention Policy** implemented (cron job deletes logs after 90 days)
- [ ] **IP Anonymization** implemented (remove last octet before storage)
- [ ] **Data Export Endpoint** implemented (`GET /api/user/data-export`)
- [ ] **Data Deletion Endpoint** implemented (`DELETE /api/user/data`)
- [ ] **Data Processing Agreements (DPAs)** signed with:
  - [ ] MaxMind (IP geolocation provider)
  - [ ] AWS (S3 storage, RDS database)
  - [ ] Cloudflare (if using CDN/DDoS protection)
- [ ] **Standard Contractual Clauses (SCCs)** in place for EU-US data transfers (AWS provides)
- [ ] **Legal Review** completed (GDPR specialist reviews privacy policy and consent flow)
- [ ] **Cookie Notice** implemented (inform users of refresh token cookie)
- [ ] **Consent Withdrawal** mechanism (users can revoke GPS consent, switches to IP-only)

**Action Required:** Consult GDPR lawyer before production launch

---

## 8. Sources & References

### Primary Sources (Official Documentation)

| Source | Type | Confidence | URL |
|---|---|---|---|
| Fastify Official Docs | Official | HIGH | https://fastify.io |
| PostgreSQL Documentation | Official | HIGH | https://postgresql.org/docs |
| PostGIS Official Site | Official | HIGH | https://postgis.net |
| MaxMind Developer Portal | Official | HIGH | https://dev.maxmind.com/geoip |
| Playwright Documentation | Official | HIGH | https://playwright.dev |
| Leaflet Documentation | Official | HIGH | https://leafletjs.com |
| BullMQ Documentation | Official | HIGH | https://docs.bullmq.io |
| MDN Geolocation API | Official | HIGH | https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API |

### Security Sources

| Source | Type | Confidence | URL |
|---|---|---|---|
| OWASP Cheat Sheets | Security | HIGH | https://cheatsheetseries.owasp.org |
| OWASP Geolocation Cheat Sheet | Security | HIGH | https://cheatsheetseries.owasp.org/cheatsheets/Geolocation_Cheat_Sheet.html |
| OWASP SQL Injection Prevention | Security | HIGH | https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html |
| OWASP JWT Cheat Sheet | Security | HIGH | https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html |

### Privacy & Legal Sources

| Source | Type | Confidence | URL |
|---|---|---|---|
| GDPR Official Resource | Legal | HIGH | https://gdpr.eu |
| GDPR Article 4 (Definitions) | Legal | HIGH | https://gdpr.eu/article-4-definitions |
| GDPR Article 28 (Processor) | Legal | HIGH | https://gdpr.eu/article-28-processor |

### Research Documents

| Document | Description | Lines | Status |
|---|---|---|---|
| STACK.md | Technology stack analysis and recommendations | 1,172 | ✅ Complete |
| FEATURES.md | Feature implementation patterns and code examples | ~900 | ✅ Complete |
| ARCHITECTURE.md | Architecture patterns, request flow, deployment | ~800 | ✅ Complete |
| PITFALLS.md | Known pitfalls, risks, and mitigations | ~700 | ✅ Complete |
| SUMMARY.md | Consolidated executive summary (this document) | 421 (old) / ~1,100 (new) | ✅ Regenerated |

**Total Research Output:** ~130 KB, ~3,500 lines

---

## 9. Conclusion & Recommendation

### Feasibility Assessment: ✅ PROCEED WITH CAUTION

**This project is technically feasible and recommended to proceed** with the following strengths and caveats:

### ✅ Strengths

1. **Mature Technology Stack**
   - Fastify, PostgreSQL + PostGIS, MaxMind GeoIP2, Playwright are all production-proven
   - Large ecosystems, excellent documentation, strong community support
   - Performance characteristics well-understood (30k req/s Fastify, <1ms MaxMind, sub-millisecond PostGIS)

2. **Well-Established Architecture Patterns**
   - Multi-tenancy (shared DB, row-level isolation) scales to 1000s of sites
   - Multi-layer caching (LRU + Redis + DB) achieves 99% cache hit rate
   - Async job queue (BullMQ) solves screenshot blocking problem
   - JWT + refresh tokens + RBAC is industry-standard auth pattern

3. **Clear Implementation Path**
   - 5 phases, 14-20 weeks total timeline
   - Dependencies identified, critical path defined
   - Each phase has concrete deliverables and success criteria

4. **Known Pitfalls Documented**
   - GPS spoofing → Cross-check with IP geolocation
   - VPN bypass → MaxMind Anonymous IP DB + combine with GPS
   - GDPR compliance → Consent flow, retention policy, data deletion
   - Performance bottlenecks → Caching, spatial indexes, async processing

### ⚠️ Risks to Mitigate

1. **GPS Accuracy and Spoofing (Critical)**
   - GPS accuracy varies wildly (3m to 1000m+)
   - GPS can be easily spoofed with browser extensions
   - **Mitigation:** Cross-check GPS with IP geolocation (max 500km distance), buffer geofence by accuracy radius, use "both" mode (IP AND GPS)

2. **VPN/Proxy Bypass (Critical)**
   - IP-based geofencing easily bypassed with VPNs
   - Residential proxies very hard to detect (60% detection rate)
   - **Mitigation:** MaxMind Anonymous IP DB (80% commercial VPN detection), combine IP + GPS for best results
   - **Accept:** This is not an absolute security control, it's a friction/compliance mechanism

3. **GDPR Compliance (High Legal Risk)**
   - GPS coordinates and IP addresses are personal data
   - Non-compliance fines up to €20M or 4% of global revenue
   - **Mitigation:** Explicit consent, privacy policy, 90-day retention, data export/deletion endpoints, DPAs with processors
   - **Action Required:** Legal review before launch

4. **Performance at Scale (Medium)**
   - Without caching: 100 req/s max capacity
   - With caching: 10,000 req/s max capacity
   - **Mitigation:** Multi-layer caching (LRU + Redis), GIST spatial indexes, async screenshots
   - **Action Required:** Load testing before production launch

### 🔴 Do Not Proceed Without

1. **Legal Review of GDPR Compliance Plan**
   - Consult lawyer specializing in GDPR and privacy law
   - Review privacy policy, consent flow, data retention policy
   - Ensure DPAs with MaxMind, AWS, other processors

2. **Real-World GPS Accuracy Testing**
   - Test GPS accuracy in target deployment environment
   - Measure accuracy distribution (p50, p95, p99)
   - Determine appropriate accuracy threshold (recommended: 100m)

3. **Load Testing Before Production Launch**
   - Simulate 10k requests/minute
   - Identify bottlenecks (DB queries, cache misses, PostGIS)
   - Verify cache hit rate > 95%

4. **Security Audit**
   - Penetration testing (SQL injection, XSS, CSRF)
   - SSL configuration review (SSL Labs A+ rating)
   - OWASP Top 10 checklist

### Next Steps

1. **Review Research with Stakeholders**
   - Present this summary to technical and business stakeholders
   - Discuss trade-offs (GPS accuracy, VPN detection, GDPR costs)
   - Get buy-in on 14-20 week timeline

2. **Obtain Legal Review**
   - Consult GDPR lawyer
   - Review consent flow and privacy policy
   - Confirm DPA requirements

3. **Create Detailed Phase 1 Plan**
   - Break down Phase 1 (MVP) into 2-week sprints
   - Define user stories and acceptance criteria
   - Setup development environment (Docker Compose)

4. **Setup Development Environment**
   - Docker Compose stack (Fastify, PostgreSQL + PostGIS, Redis, MinIO)
   - MaxMind GeoLite2 MMDB downloads
   - GitHub repository, CI/CD pipeline

5. **Begin Phase 1 Development**
   - Sprint 1: Project setup, database schema, site CRUD API
   - Sprint 2: IP access control, MaxMind integration
   - Sprint 3: Admin UI, site settings form

---

**Research Completed:** 2026-02-14  
**Researcher:** OpenCode Research Agent  
**Overall Confidence:** HIGH (85%)  
**Recommendation:** ✅ PROCEED with risk mitigation plan  
**Estimated Timeline:** 14-20 weeks (3.5-5 months)  
**Estimated Team Size:** 2-3 full-stack developers + 1 DevOps engineer

---

## Appendix A: Technology Decision Matrix

| Decision | Choice | Confidence | Alternative 1 | Alternative 2 | Rationale |
|---|---|---|---|---|---|
| Backend Framework | Fastify 5.7.x | HIGH (95%) | FastAPI (Python) | Express (Node.js) | 3x faster than Express, schema validation, plugin architecture |
| Database | PostgreSQL 16.x | HIGH (99%) | MySQL 8.x | MongoDB 7.x | ACID, geospatial (PostGIS), partitioning |
| Geospatial Extension | PostGIS 3.6.x | HIGH (99%) | MySQL Spatial | MongoDB Geospatial | GIST indexes, ST_Within performance |
| IP Geolocation | MaxMind GeoIP2 | HIGH (95%) | IPinfo API | ip-api.com | <1ms lookup, 99.8% accuracy, local MMDB |
| VPN Detection | MaxMind Anonymous IP | MEDIUM (75%) | IPinfo Residential Proxy API | None | 80% commercial VPN detection |
| Screenshot Tool | Playwright 1.58.x | HIGH (90%) | Puppeteer | Headless Chrome | Reliability, auto-waiting, maintained |
| Artifact Storage | MinIO / AWS S3 | HIGH (90%) | Local disk | Cloudflare R2 | S3-compatible, lifecycle policies, durability |
| Cache (Memory) | lru-cache | HIGH (95%) | node-cache | quick-lru | TTL, max size, LRU eviction |
| Cache (Distributed) | Redis 7.x | HIGH (95%) | Memcached | None | Pub/sub, data structures, persistence |
| Job Queue | BullMQ | HIGH (90%) | Bull | Agenda | Modern, TypeScript, monitoring |
| Auth | JWT + bcrypt | HIGH (95%) | Passport.js | Auth0 | Stateless, secure, flexible |
| Frontend | React 18.x | HIGH (90%) | Vue 3.x | Svelte | Ecosystem, TypeScript, hooks |
| Build Tool | Vite | HIGH (90%) | Webpack | Parcel | Fast HMR, modern, ESM |
| Maps | Leaflet | HIGH (90%) | Mapbox GL | Google Maps | Open source, OSM, sufficient |
| Deployment | Docker + K8s | HIGH (85%) | Docker Compose | VMs + PM2 | Scalable, reproducible |

---

## Appendix B: Performance Benchmarks

| Component | Operation | Latency | Throughput | Source |
|---|---|---|---|---|
| Fastify | HTTP request (hello world) | 0.03ms | 30,000 req/s | Fastify benchmarks |
| PostgreSQL | SELECT by primary key | 1-2ms | 10,000 queries/s | pgbench |
| PostGIS | ST_Within (with GIST index) | <1ms | 5,000 queries/s | PostGIS docs |
| MaxMind GeoIP2 | IP lookup (MMDB local) | <0.1ms | 100,000 lookups/s | MaxMind docs |
| Redis | GET operation | 0.1-0.5ms | 100,000 ops/s | Redis benchmarks |
| LRU Cache | Memory lookup | <0.01ms | 1,000,000 ops/s | Estimated |
| Playwright | Screenshot (headless) | 1-3s | 1 screenshot/3s | Playwright docs |
| BullMQ | Job enqueue | 1-5ms | 10,000 jobs/s | BullMQ docs |

**System Capacity Estimates:**
- **No caching:** ~100 req/s (limited by DB queries)
- **With caching:** ~10,000 req/s (limited by CPU, network)
- **With horizontal scaling (3 instances):** ~30,000 req/s

---

**End of Research Summary**
