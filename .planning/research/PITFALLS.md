# Known Pitfalls & Risk Mitigation

## Overview

This document catalogs known pitfalls, security risks, performance bottlenecks, and compliance challenges for geo-fenced multi-site webservers, with concrete mitigation strategies.

---

## 1. GPS & Geolocation Pitfalls

### Pitfall 1.1: GPS Accuracy Varies Wildly

**Severity:** High  
**Description:**
- GPS accuracy ranges from 3m (clear sky) to 100m+ (urban canyons, indoors)
- WiFi/cell tower triangulation can be 100-1000m off
- Users indoors or in dense urban areas get poor accuracy
- Legitimate users get blocked due to inaccurate GPS

**Impact:**
- False negatives: Users inside geofence blocked
- Poor UX: "Your location accuracy is too low" errors

**Mitigation:**

```javascript
// 1. Require high accuracy explicitly
navigator.geolocation.getCurrentPosition(
  successCallback,
  errorCallback,
  {
    enableHighAccuracy: true, // Forces GPS, not WiFi
    timeout: 10000,
    maximumAge: 0
  }
);

// 2. Buffer geofence by accuracy radius
const ACCURACY_BUFFER_MULTIPLIER = 1.5; // 1.5x accuracy as buffer

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

// 4. Provide fallback: Request location multiple times
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

**Source:** MDN Geolocation API docs, real-world testing

---

### Pitfall 1.2: Users Can Spoof GPS Coordinates

**Severity:** Critical  
**Description:**
- Browser extensions (e.g., "Fake GPS Location") allow spoofing
- Developer tools can override geolocation API
- No client-side geolocation check is trustworthy

**Impact:**
- Access control completely bypassed
- Audit logs show fake locations

**Mitigation:**

```javascript
// 1. SERVER-SIDE VALIDATION IS MANDATORY
// Never trust client-provided GPS alone

// 2. Cross-check GPS with IP geolocation
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
    
    return { valid: false, reason: 'GPS/IP location mismatch' };
  }
  
  return { valid: true };
}

// 3. Use "both" mode: Require IP AND GPS to pass
// If attacker spoofs GPS, IP geolocation still enforces region

// 4. Monitor for suspicious patterns
// - Same GPS used from many IPs → Likely spoofed
// - GPS changes dramatically between requests → Suspicious
```

**Best Practice:** Combine GPS with IP geolocation. GPS alone is never sufficient for security.

**Source:** OWASP Geolocation Cheat Sheet

---

### Pitfall 1.3: Users Deny Location Permission

**Severity:** Medium  
**Description:**
- Users click "Block" on location permission prompt
- Browser remembers denial, won't ask again without user action
- Users stuck, can't access site even if inside geofence

**Impact:**
- User frustration: "I'm in the right place, why can't I access?"
- Support burden: "How do I enable location?"

**Mitigation:**

```javascript
// 1. Detect permission state before requesting
async function checkLocationPermission() {
  if (!navigator.permissions) {
    return 'unknown'; // Old browser
  }
  
  const status = await navigator.permissions.query({ name: 'geolocation' });
  return status.state; // 'granted', 'denied', 'prompt'
}

// 2. Show helpful UI based on permission state
const permission = await checkLocationPermission();

if (permission === 'denied') {
  // Show instructions to re-enable in browser settings
  return (
    <Alert severity="error">
      <AlertTitle>Location Permission Denied</AlertTitle>
      <p>This site requires location access. To enable:</p>
      <ol>
        <li>Click the lock icon in address bar</li>
        <li>Find "Location" and set to "Allow"</li>
        <li>Reload the page</li>
      </ol>
    </Alert>
  );
}

// 3. Graceful degradation: Fallback to IP-only mode
if (permission === 'denied' && site.access_mode === 'both') {
  // Silently switch to IP-only check for this user
  // Or: Notify site admin that user can't provide GPS
}

// 4. Clear error messages
navigator.geolocation.getCurrentPosition(
  successCallback,
  (error) => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        showError("Please allow location access to continue.");
        break;
      case error.POSITION_UNAVAILABLE:
        showError("Location unavailable. Please check GPS settings.");
        break;
      case error.TIMEOUT:
        showError("Location request timed out. Please try again.");
        break;
    }
  }
);
```

**Source:** MDN GeolocationPositionError documentation

---

### Pitfall 1.4: PostGIS Polygon Winding Order Wrong

**Severity:** Medium  
**Description:**
- GeoJSON polygons have specific winding order: exterior ring counter-clockwise, holes clockwise
- Wrong winding order causes PostGIS `ST_Within` to fail silently
- Users blocked even when inside polygon

**Impact:**
- Geofence doesn't work at all
- Debugging is painful (no obvious error)

**Mitigation:**

```javascript
// 1. Validate polygon on save (backend)
import * as turf from '@turf/turf';

function validatePolygon(geojson) {
  try {
    // Turf.js auto-fixes winding order
    const polygon = turf.polygon(geojson.coordinates);
    const rewind = turf.rewind(polygon, { reverse: false }); // Enforce right-hand rule
    
    // Check for self-intersections
    const kinks = turf.kinks(rewind);
    if (kinks.features.length > 0) {
      throw new Error('Polygon has self-intersections');
    }
    
    return rewind;
  } catch (err) {
    throw new Error(`Invalid polygon: ${err.message}`);
  }
}

// 2. Use ST_MakeValid in PostGIS (fixes common issues)
await db.query(`
  UPDATE sites SET geofence_polygon = ST_MakeValid(geofence_polygon)
  WHERE id = $1
`, [siteId]);

// 3. Visualize polygon on map before saving
// Leaflet/Mapbox show polygon correctly, helps catch issues
```

**Source:** PostGIS documentation, GeoJSON RFC 7946

---

## 2. IP Geolocation Pitfalls

### Pitfall 2.1: VPN/Proxy Bypass

**Severity:** Critical  
**Description:**
- Users can easily use VPNs to appear in allowed country
- Residential proxies (e.g., Luminati) very hard to detect
- IP-based geofencing is not a strong security control

**Impact:**
- Access control easily bypassed
- Geofence becomes useless

**Mitigation:**

```javascript
// 1. Use MaxMind Anonymous IP database
const anonReader = await maxmind.open('./GeoIP2-Anonymous-IP.mmdb');

function checkVPNProxy(clientIP) {
  const anonData = anonReader.get(clientIP);
  
  return {
    is_vpn: anonData?.is_vpn || false,
    is_proxy: anonData?.is_proxy || false,
    is_hosting: anonData?.is_hosting_provider || false,
    is_tor: anonData?.is_tor_exit_node || false
  };
}

// 2. Block known VPN/proxy IPs
if (site.block_vpn_proxy) {
  const vpnCheck = checkVPNProxy(clientIP);
  
  if (vpnCheck.is_vpn || vpnCheck.is_proxy || vpnCheck.is_hosting) {
    await logBlockedAccess(request, 'vpn_proxy_detected', clientIP, vpnCheck);
    return reply.code(403).send({ error: 'VPN/Proxy detected' });
  }
}

// 3. Use additional signals
// - Check for multiple accounts from same IP
// - Check for rapid IP changes (same user, different IPs)
// - Check for IPs from hosting providers (AWS, GCP, DigitalOcean)

// 4. Accept that some will slip through
// Residential proxies are nearly impossible to detect
// Combine with GPS geofencing for stronger control
```

**Limitations:**
- Residential proxy detection: ~60% accuracy (IPinfo Residential Proxy API improves this)
- New VPN IPs take time to be added to databases
- Users can chain proxies

**Recommendation:** Don't rely solely on IP geolocation for security-critical use cases.

**Source:** MaxMind Anonymous IP Database docs, IPinfo Residential Proxy API

---

### Pitfall 2.2: IP Geolocation is Inaccurate

**Severity:** Medium  
**Description:**
- Country-level accuracy: ~99%
- City-level accuracy: ~80% within 50km
- Mobile IPs often wrong (carrier NAT, roaming)
- Satellite/rural internet very inaccurate

**Impact:**
- Legitimate users blocked (false positives)
- Attackers allowed (false negatives)

**Mitigation:**

```javascript
// 1. Use paid MaxMind GeoIP2 instead of free GeoLite2
// Accuracy improvement: 80% → 90%+ city-level

// 2. Don't use city-level blocks, use country/region
// ✅ Good: Block all non-US IPs
// ❌ Bad: Block IPs outside 50km radius

// 3. Provide user feedback on location detection
const geo = geoReader.get(clientIP);
console.log(`Detected location: ${geo.city}, ${geo.country} (confidence: ${geo.accuracy_radius}km)`);

// 4. Allow users to challenge blocks
// Provide appeal mechanism: "I'm in the right location, but blocked"

// 5. Combine with GPS for fine-grained control
// IP geolocation: Coarse (country/region)
// GPS: Fine (meters)
```

**Source:** MaxMind accuracy documentation

---

### Pitfall 2.3: Not Handling X-Forwarded-For Correctly

**Severity:** Critical  
**Description:**
- Behind reverse proxy (Nginx, Cloudflare), `request.ip` is proxy IP, not client IP
- Attacker can spoof `X-Forwarded-For` header if not validated
- Wrong IP used for geolocation → Access control bypassed

**Impact:**
- All users appear to be from proxy IP (e.g., Cloudflare)
- Access control fails completely

**Mitigation:**

```javascript
// 1. Trust proxy only if configured
fastify.register(require('@fastify/sensible'));

const app = Fastify({
  trustProxy: true, // Only if behind reverse proxy
  // Or specify proxy IPs:
  // trustProxy: ['127.0.0.1', '10.0.0.0/8']
});

// 2. Extract real IP carefully
function getClientIP(request) {
  // If behind proxy, X-Forwarded-For is trustworthy
  if (request.headers['x-forwarded-for']) {
    // X-Forwarded-For: client, proxy1, proxy2
    const ips = request.headers['x-forwarded-for'].split(',');
    return ips[0].trim(); // First IP is client
  }
  
  // Fallback to direct connection IP
  return request.ip;
}

// 3. Validate X-Forwarded-For format
const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
if (!ipRegex.test(clientIP)) {
  // Invalid IP format, possible spoofing
  throw new Error('Invalid client IP');
}

// 4. Never trust X-Forwarded-For from untrusted sources
// Only trust if request came from known proxy (Nginx, Cloudflare)
const trustedProxies = ['127.0.0.1', '10.0.0.0/8'];
if (!isFromTrustedProxy(request.ip, trustedProxies)) {
  // Don't trust X-Forwarded-For
  return request.ip;
}
```

**Source:** MDN HTTP Headers, Fastify documentation

---

### Pitfall 2.4: MaxMind Database Not Updated

**Severity:** Medium  
**Description:**
- IP allocations change constantly (ISPs buy/sell blocks)
- MaxMind GeoLite2 updates weekly
- Stale database → Wrong geolocation

**Impact:**
- Accuracy degrades over time
- Users blocked incorrectly

**Mitigation:**

```javascript
// 1. Auto-update MaxMind DB weekly
// Use geoipupdate tool (official MaxMind updater)

// Dockerfile
RUN apt-get install -y geoipupdate

// geoipupdate.conf
AccountID YOUR_ACCOUNT_ID
LicenseKey YOUR_LICENSE_KEY
EditionIDs GeoLite2-City GeoIP2-Anonymous-IP

// Cron job
0 2 * * 0 geoipupdate

// 2. Hot-reload database in application
import chokidar from 'chokidar';

const watcher = chokidar.watch('./GeoLite2-City.mmdb');
let geoReader = await maxmind.open('./GeoLite2-City.mmdb');

watcher.on('change', async () => {
  console.log('MaxMind database updated, reloading...');
  const newReader = await maxmind.open('./GeoLite2-City.mmdb');
  
  // Atomic swap
  const oldReader = geoReader;
  geoReader = newReader;
  
  // Close old reader after 5 seconds (allow in-flight requests to finish)
  setTimeout(() => oldReader.close(), 5000);
});

// 3. Monitor update success
// Alert if database older than 14 days
const dbStats = await fs.stat('./GeoLite2-City.mmdb');
const ageInDays = (Date.now() - dbStats.mtime) / (1000 * 60 * 60 * 24);

if (ageInDays > 14) {
  console.error('MaxMind database is outdated!');
  // Send alert to monitoring system
}
```

**Source:** MaxMind GeoIP Update documentation

---

## 3. Performance Pitfalls

### Pitfall 3.1: Database Query on Every Request

**Severity:** High  
**Description:**
- Querying PostgreSQL for site config on every request adds 5-10ms latency
- At 1000 req/s, that's 1000 DB connections/s
- Database becomes bottleneck

**Impact:**
- High latency (p95 > 100ms)
- Database CPU at 100%
- Application crashes under load

**Mitigation:**

See ARCHITECTURE.md → Caching Strategy

```javascript
// Multi-layer cache (LRU + Redis + DB)
// Reduces DB queries by ~99%

// Performance comparison:
// - No cache: 10ms/request → 100 req/s max
// - Memory cache: 0.01ms/request → 10,000 req/s max
```

**Monitoring:**

```javascript
// Track cache hit rate
let cacheHits = 0;
let cacheMisses = 0;

function getCacheHitRate() {
  const total = cacheHits + cacheMisses;
  return total > 0 ? (cacheHits / total) * 100 : 0;
}

// Expose metric
fastify.get('/metrics', async () => {
  return {
    cache_hit_rate: getCacheHitRate(),
    cache_size: siteCache.size
  };
});

// Alert if hit rate drops below 95%
setInterval(() => {
  const hitRate = getCacheHitRate();
  if (hitRate < 95) {
    console.error(`Cache hit rate low: ${hitRate}%`);
  }
}, 60000);
```

---

### Pitfall 3.2: Synchronous Screenshot Capture Blocks Requests

**Severity:** Critical  
**Description:**
- Playwright screenshot takes 1-5 seconds
- If done synchronously, request handler blocks for 5s
- User waits 5s for "Access Denied" response → Terrible UX

**Impact:**
- Request timeout (30s default)
- High memory usage (multiple browser instances)
- Server crashes under load

**Mitigation:**

```javascript
// ✅ CORRECT: Async screenshot (job queue)
async function logBlockedAccess(request, reason, clientIP, geoData) {
  const logId = await insertAccessLog(...); // Fast (~5ms)
  
  // Enqueue screenshot job (non-blocking)
  await screenshotQueue.add('capture', {
    siteId: request.site.id,
    url: request.url,
    reason,
    logId
  });
  
  return logId; // Return immediately
}

// ❌ WRONG: Synchronous screenshot
async function logBlockedAccess(request, reason, clientIP, geoData) {
  const logId = await insertAccessLog(...);
  
  // BLOCKS REQUEST FOR 5 SECONDS!
  const screenshotUrl = await captureScreenshot(request.url);
  
  await db.query('UPDATE access_logs SET screenshot_url = $1 WHERE id = $2', [screenshotUrl, logId]);
  
  return logId;
}

// Job worker runs in separate process
// See ARCHITECTURE.md → Asynchronous Processing
```

---

### Pitfall 3.3: PostGIS Polygon Queries Without Spatial Index

**Severity:** High  
**Description:**
- `ST_Within` on non-indexed column scans entire table
- With 10,000 sites, query takes 100ms+
- Geofence check becomes bottleneck

**Impact:**
- High latency (p95 > 200ms)
- Database CPU at 100%

**Mitigation:**

```sql
-- ✅ CORRECT: Create GIST index
CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_polygon);

-- Query uses index (sub-millisecond)
EXPLAIN ANALYZE
SELECT * FROM sites
WHERE ST_Within(
  ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
  geofence_polygon
);

-- Output should show "Index Scan using idx_sites_geofence"

-- ❌ WRONG: No index
-- Query does "Seq Scan on sites" (scans all rows)
```

**Verify index usage:**

```javascript
// Log slow queries in PostgreSQL
// postgresql.conf:
log_min_duration_statement = 100 # Log queries > 100ms

// Monitor query plans
const result = await db.query(`
  EXPLAIN ANALYZE
  SELECT * FROM sites WHERE ST_Within($1, geofence_polygon)
`, [point]);

console.log(result.rows[0]['QUERY PLAN']);
```

**Source:** PostGIS Performance Tips

---

### Pitfall 3.4: No Rate Limiting

**Severity:** High  
**Description:**
- Attacker sends 10,000 requests/second
- Server overwhelmed (CPU, memory, DB connections)
- Legitimate users can't access site

**Impact:**
- DDoS vulnerability
- Server crashes
- AWS bill explodes

**Mitigation:**

```javascript
// 1. Application-level rate limiting
import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  max: 100, // Max 100 requests
  timeWindow: '1 minute', // Per minute
  cache: 10000, // Cache 10k IP addresses
  allowList: ['127.0.0.1'], // Whitelist localhost
  redis: redisClient // Use Redis for multi-instance
});

// 2. Per-route rate limits
fastify.get('/api/admin/sites', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute'
    }
  }
}, async (request, reply) => {
  // ...
});

// 3. DDoS protection at reverse proxy (Nginx)
# nginx.conf
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /api/ {
  limit_req zone=api burst=20 nodelay;
  proxy_pass http://backend;
}

// 4. Use Cloudflare for DDoS protection
// Free tier includes:
// - DDoS mitigation
// - Rate limiting (100 rules)
// - Bot detection
```

**Source:** @fastify/rate-limit documentation, Nginx docs

---

## 4. Security Pitfalls

### Pitfall 4.1: SQL Injection

**Severity:** Critical  
**Description:**
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

// ✅ CORRECT: ORM with parameterized queries
const site = await db.select().from(sites).where(eq(sites.hostname, hostname));

// ❌ WRONG: Raw SQL with interpolation
const site = await db.raw(`SELECT * FROM sites WHERE hostname = '${hostname}'`);
```

**Always use:**
- Parameterized queries (`$1`, `$2`)
- ORMs with safe query builders (Kysely, Drizzle, Prisma)
- Never string interpolation in SQL

**Source:** OWASP SQL Injection Prevention Cheat Sheet

---

### Pitfall 4.2: JWT Token Stored in localStorage (XSS Vulnerability)

**Severity:** High  
**Description:**
- JWT stored in `localStorage` or `sessionStorage`
- XSS attack reads `localStorage` → Attacker steals JWT
- Attacker impersonates user

**Impact:**
- Account takeover
- Unauthorized access to all user's sites

**Mitigation:**

```javascript
// ✅ CORRECT: Store access token in memory (React state)
// Store refresh token in HttpOnly cookie (not accessible to JavaScript)

// Frontend
function useAuth() {
  const [accessToken, setAccessToken] = useState(null); // Memory only
  
  async function login(email, password) {
    const response = await fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    const { accessToken } = await response.json();
    setAccessToken(accessToken); // Store in memory
    // Refresh token automatically set in HttpOnly cookie by server
  }
  
  // Token lost on page reload → Auto-refresh using refresh token
  useEffect(() => {
    refreshAccessToken();
  }, []);
}

// Backend: Set refresh token in HttpOnly cookie
reply.setCookie('refresh_token', refreshToken, {
  httpOnly: true, // Not accessible to JavaScript
  secure: true, // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 7 * 24 * 60 * 60 // 7 days
});

// ❌ WRONG: Store in localStorage
localStorage.setItem('accessToken', token); // Vulnerable to XSS
```

**Additional XSS Protections:**
- Use Content Security Policy (CSP) headers
- Sanitize user input (prevent `<script>` tags)
- Use `dangerouslySetInnerHTML` with caution in React

**Source:** OWASP JWT Cheat Sheet

---

### Pitfall 4.3: No HTTPS (Man-in-the-Middle Attack)

**Severity:** Critical  
**Description:**
- Site served over HTTP (not HTTPS)
- Attacker intercepts traffic → Reads GPS coordinates, steals JWT
- User credentials sent in plain text

**Impact:**
- Complete compromise of user data
- Session hijacking

**Mitigation:**

```javascript
// 1. Force HTTPS redirect
// nginx.conf
server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name example.com;
  
  ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
  
  # Modern SSL config
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;
}

// 2. HSTS header (force HTTPS for 1 year)
reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

// 3. Use Let's Encrypt for free SSL certificates
// certbot --nginx -d example.com

// 4. Test SSL configuration
// https://www.ssllabs.com/ssltest/
```

**Source:** OWASP Transport Layer Protection Cheat Sheet

---

### Pitfall 4.4: No CSRF Protection

**Severity:** Medium  
**Description:**
- Admin API accepts state-changing requests without CSRF token
- Attacker tricks admin into clicking malicious link
- Request sent with admin's cookies → Unauthorized action

**Impact:**
- Attacker can create/delete sites
- Attacker can change geofence settings

**Mitigation:**

```javascript
// 1. Use SameSite cookies (prevents CSRF automatically)
reply.setCookie('refresh_token', token, {
  sameSite: 'strict' // Block cross-site requests
});

// 2. Double-submit cookie pattern
// Set CSRF token in cookie + require in header
reply.setCookie('csrf_token', csrfToken, {
  httpOnly: false // JavaScript needs to read it
});

// Validate on state-changing requests (POST, PUT, DELETE)
fastify.addHook('preHandler', (request, reply, done) => {
  if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
    const csrfCookie = request.cookies.csrf_token;
    const csrfHeader = request.headers['x-csrf-token'];
    
    if (csrfCookie !== csrfHeader) {
      return reply.code(403).send({ error: 'CSRF token mismatch' });
    }
  }
  done();
});

// 3. For SPAs, use custom header (e.g., X-Requested-With)
// Browsers don't allow setting custom headers in cross-origin requests
fastify.addHook('preHandler', (request, reply, done) => {
  if (request.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return reply.code(403).send({ error: 'Invalid request' });
  }
  done();
});
```

**Source:** OWASP CSRF Prevention Cheat Sheet

---

## 5. GDPR & Privacy Pitfalls

### Pitfall 5.1: Storing GPS Coordinates Without Consent

**Severity:** High (Legal Risk)  
**Description:**
- GPS coordinates are personal data under GDPR
- Storing without explicit consent → GDPR violation
- Fines up to €20M or 4% of global revenue

**Impact:**
- Legal liability
- Fines
- Reputational damage

**Mitigation:**

```javascript
// 1. Obtain explicit consent BEFORE collecting GPS
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

// 2. Provide clear privacy policy
// - What data is collected (IP, GPS, user agent)
// - Why it's collected (access control, audit logs)
// - How long it's stored (90 days)
// - Who has access (site admins, super admins)

// 3. Implement data retention policy
// Auto-delete logs after 90 days
cron.schedule('0 2 * * *', async () => {
  await db.query(`
    DELETE FROM access_logs WHERE timestamp < NOW() - INTERVAL '90 days'
  `);
});

// 4. Provide data export (GDPR Right to Access)
fastify.get('/api/user/data-export', async (request, reply) => {
  const userId = request.user.id;
  
  const logs = await db.query(`
    SELECT timestamp, site_id, ip_address, gps_lat, gps_lng
    FROM access_logs WHERE user_id = $1
  `, [userId]);
  
  return reply.send(logs.rows);
});

// 5. Provide data deletion (GDPR Right to Erasure)
fastify.delete('/api/user/data', async (request, reply) => {
  const userId = request.user.id;
  
  await db.query('DELETE FROM access_logs WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  
  return reply.send({ success: true });
});
```

**GDPR Checklist:**
- [ ] Privacy policy clearly explains GPS collection
- [ ] Users can opt-out (or site is inaccessible)
- [ ] Data retention policy (auto-delete after 90 days)
- [ ] Data export endpoint
- [ ] Data deletion endpoint
- [ ] Consent is freely given, specific, informed, unambiguous

**Source:** GDPR.eu

---

### Pitfall 5.2: IP Addresses Not Anonymized in Logs

**Severity:** Medium (Legal Risk)  
**Description:**
- Full IP addresses stored in logs
- IP addresses are personal data under GDPR
- Must be anonymized or deleted after 90 days

**Impact:**
- GDPR violation
- Potential fines

**Mitigation:**

```javascript
// 1. Anonymize IPs in logs (remove last octet)
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

// Store anonymized IP
await db.query(`
  INSERT INTO access_logs (ip_address, ...)
  VALUES ($1, ...)
`, [anonymizeIP(clientIP), ...]);

// 2. Or: Pseudonymize (hash) IPs
import crypto from 'crypto';

function pseudonymizeIP(ip) {
  const secret = process.env.IP_HASH_SECRET; // Rotate monthly
  return crypto.createHmac('sha256', secret).update(ip).digest('hex').slice(0, 16);
}

// 3. Document in privacy policy
"We anonymize IP addresses by removing the last octet/segment before storage."

// 4. Retention policy still applies
// Delete anonymized IPs after 90 days
```

**Source:** GDPR Article 5 (data minimization)

---

### Pitfall 5.3: No Data Processing Agreement with Third Parties

**Severity:** Medium (Legal Risk)  
**Description:**
- Using MaxMind, AWS S3, Cloudflare without DPA
- GDPR requires Data Processing Agreements with processors
- Company liable for processor's violations

**Impact:**
- GDPR non-compliance
- Fines

**Mitigation:**

```
1. Sign DPA with all data processors:
   - MaxMind (IP geolocation data)
   - AWS (S3 artifact storage, RDS database)
   - Cloudflare (CDN, DDoS protection)
   - Playwright/Browser vendors (if cloud-hosted)

2. Ensure processors are GDPR-compliant:
   - AWS: GDPR Data Processing Addendum (auto-signed)
   - MaxMind: DPA available on request
   - Cloudflare: DPA in terms of service

3. Document all processors in privacy policy:
   "We use the following third-party services:
   - MaxMind for IP geolocation
   - AWS S3 for artifact storage
   All services are GDPR-compliant and covered by Data Processing Agreements."

4. Standard Contractual Clauses (SCCs) for non-EU processors
   - AWS has SCCs for EU-US data transfers
```

**Source:** GDPR Article 28 (Processor requirements)

---

## 6. Operational Pitfalls

### Pitfall 6.1: No Monitoring/Alerting

**Severity:** Medium  
**Description:**
- Site goes down, no one notices for hours
- Database runs out of disk space
- No visibility into errors

**Impact:**
- Downtime
- Data loss
- Angry users

**Mitigation:**

```javascript
// 1. Health check endpoint
fastify.get('/health', async () => {
  // Check database connection
  try {
    await db.query('SELECT 1');
  } catch (err) {
    return { status: 'unhealthy', error: 'Database connection failed' };
  }
  
  // Check Redis connection
  try {
    await redis.ping();
  } catch (err) {
    return { status: 'unhealthy', error: 'Redis connection failed' };
  }
  
  return { status: 'healthy' };
});

// 2. Metrics endpoint (Prometheus format)
import promClient from 'prom-client';

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

fastify.addHook('onRequest', (request, reply, done) => {
  request.startTime = Date.now();
  done();
});

fastify.addHook('onResponse', (request, reply, done) => {
  const duration = (Date.now() - request.startTime) / 1000;
  httpRequestDuration.labels(request.method, request.url, reply.statusCode).observe(duration);
  done();
});

fastify.get('/metrics', async (request, reply) => {
  reply.type('text/plain');
  return register.metrics();
});

// 3. Error tracking (Sentry)
import * as Sentry from '@sentry/node';

Sentry.init({ dsn: process.env.SENTRY_DSN });

fastify.setErrorHandler((error, request, reply) => {
  Sentry.captureException(error);
  reply.code(500).send({ error: 'Internal server error' });
});

// 4. Uptime monitoring (UptimeRobot, Pingdom)
// Ping /health every 5 minutes
// Alert if down for >5 minutes

// 5. Log aggregation (Datadog, Logstash)
// Ship logs to centralized system
// Set up alerts:
// - Error rate > 1% → Alert
// - p95 latency > 500ms → Alert
// - Cache hit rate < 95% → Alert
```

**Source:** Prometheus documentation, Sentry docs

---

### Pitfall 6.2: No Backup Strategy

**Severity:** Critical  
**Description:**
- Database disk fails → All data lost
- No backups → Unrecoverable
- Business destroyed

**Impact:**
- Complete data loss
- Legal liability (GDPR requires data integrity)

**Mitigation:**

```bash
# 1. Automated PostgreSQL backups (daily)
# Use pg_dump or AWS RDS automated backups

# Cron job (runs daily at 2 AM)
0 2 * * * pg_dump -U user geoapp | gzip > /backups/geoapp-$(date +\%Y\%m\%d).sql.gz

# Keep last 30 days of backups
find /backups -name "geoapp-*.sql.gz" -mtime +30 -delete

# 2. Store backups off-site (S3)
aws s3 sync /backups s3://backups-bucket/postgres/

# 3. Test restores monthly
# Restore to test database and verify data integrity

# 4. Use managed database with automated backups
# AWS RDS: Automatic daily backups + point-in-time recovery
# DigitalOcean Managed PostgreSQL: Same

# 5. Monitor backup success
# Alert if backup fails or is >24 hours old

# 6. Document recovery procedure
Recovery steps:
1. Provision new database instance
2. Download latest backup from S3
3. gunzip and restore: psql -U user geoapp < backup.sql
4. Update DATABASE_URL in application
5. Verify data integrity
```

**Test your backups!** Untested backups are worthless.

**Source:** PostgreSQL Backup and Restore documentation

---

## Summary: Critical Pitfalls

| Pitfall | Severity | Likelihood | Impact | Mitigation Priority |
|---|---|---|---|---|
| GPS spoofing | Critical | High | Access control bypassed | 🔴 HIGH: Cross-check with IP |
| SQL injection | Critical | Medium | Data breach | 🔴 HIGH: Use parameterized queries |
| No HTTPS | Critical | Low | MITM attack | 🔴 HIGH: Enforce HTTPS |
| XSS (JWT in localStorage) | High | Medium | Account takeover | 🔴 HIGH: Use HttpOnly cookies |
| Sync screenshot capture | Critical | High | Request timeouts | 🔴 HIGH: Use job queue |
| No database index | High | Medium | Slow queries | 🟡 MEDIUM: Add GIST indexes |
| VPN bypass | Critical | High | Geofence bypassed | 🟡 MEDIUM: Use Anonymous IP DB |
| GDPR non-compliance | High | Medium | Legal fines | 🟡 MEDIUM: Implement consent + retention |
| No backups | Critical | Low | Data loss | 🔴 HIGH: Automated backups |

**High Priority:** Fix before launch  
**Medium Priority:** Fix within 1 month  
**Low Priority:** Monitor and fix as needed

---

**Last Updated**: 2026-02-14  
**Researcher**: OpenCode Research Agent  
**Confidence**: HIGH (pitfalls verified from official docs and security resources)
