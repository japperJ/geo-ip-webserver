# Feature Analysis & Implementation Patterns

## Overview

This document analyzes each core feature of the geo-fenced multi-site webserver, providing standard approaches, recommended libraries, common pitfalls, and implementation guidance.

---

## Feature 1: Multi-Site Hosting

### Standard Approach

**Pattern**: Virtual hosting with hostname/path-based routing
- Each site has unique identifier (slug, domain, subdomain, or path prefix)
- Middleware resolves site from request (hostname or path)
- Site configuration loaded from database (caching recommended)

### Implementation Approaches

#### Option A: Hostname-based (Recommended)
```javascript
// site1.example.com -> Site 1
// site2.example.com -> Site 2

fastify.addHook('onRequest', async (request, reply) => {
  const hostname = request.hostname;
  const site = await getSiteByHostname(hostname); // cached
  
  if (!site) {
    return reply.code(404).send({ error: 'Site not found' });
  }
  
  request.site = site; // Attach to request
});
```

**Pros:**
- Clean separation
- Easy SSL per site (wildcard cert)
- Natural for multi-tenant

**Cons:**
- DNS configuration required
- More complex local development

#### Option B: Path-based
```javascript
// example.com/sites/site1 -> Site 1
// example.com/sites/site2 -> Site 2

fastify.register(async (instance) => {
  instance.get('/sites/:siteSlug/*', async (request, reply) => {
    const { siteSlug } = request.params;
    const site = await getSiteBySlug(siteSlug);
    // ...
  });
});
```

**Pros:**
- Simpler DNS
- Easier local development
- Single SSL certificate

**Cons:**
- URL pollution
- Assets need prefix
- Less clean separation

### Database Schema

```sql
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  hostname VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  
  -- Access control settings
  access_mode VARCHAR(20) NOT NULL, -- 'ip_only', 'geo_only', 'both', 'disabled'
  
  -- IP-based filtering
  ip_allowlist INET[],
  ip_denylist INET[],
  
  -- Geo-based filtering
  geofence_type VARCHAR(20), -- 'polygon', 'radius', null
  geofence_polygon GEOGRAPHY(POLYGON, 4326),
  geofence_center GEOGRAPHY(POINT, 4326),
  geofence_radius_km NUMERIC(10, 2),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  enabled BOOLEAN DEFAULT true
);

CREATE INDEX idx_sites_hostname ON sites(hostname);
CREATE INDEX idx_sites_slug ON sites(slug);
CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_polygon);
```

### Caching Strategy

**Problem**: Database lookup on every request is slow  
**Solution**: Multi-layer cache

```javascript
// Layer 1: In-memory cache (LRU)
const siteCache = new LRU({ max: 1000, ttl: 60000 }); // 60s TTL

// Layer 2: Redis cache (optional, for multi-instance deployments)
async function getSiteByHostname(hostname) {
  // Check memory cache
  let site = siteCache.get(hostname);
  if (site) return site;
  
  // Check Redis
  const cached = await redis.get(`site:${hostname}`);
  if (cached) {
    site = JSON.parse(cached);
    siteCache.set(hostname, site);
    return site;
  }
  
  // Query database
  site = await db.query('SELECT * FROM sites WHERE hostname = $1', [hostname]);
  
  if (site) {
    siteCache.set(hostname, site);
    await redis.setex(`site:${hostname}`, 60, JSON.stringify(site));
  }
  
  return site;
}

// Invalidate cache on update
async function updateSite(id, updates) {
  const site = await db.query('UPDATE sites SET ... WHERE id = $1 RETURNING *', [id]);
  
  // Invalidate caches
  siteCache.delete(site.hostname);
  await redis.del(`site:${site.hostname}`);
  
  return site;
}
```

### Libraries

| Library | Purpose | Confidence |
|---|---|---|
| `lru-cache` | In-memory LRU cache | HIGH |
| `ioredis` | Redis client | HIGH |
| `@fastify/multipart` | File uploads (if sites have content) | MEDIUM |

### Common Pitfalls

1. **Not caching site lookups** → Every request hits DB → Slow
2. **Cache invalidation bugs** → Stale site config served → Wrong access rules applied
3. **No hostname validation** → Open redirect vulnerabilities
4. **Hardcoding site IDs in code** → Not scalable

### Confidence: HIGH

---

## Feature 2: IP-Based Access Control

### Standard Approach

**Pattern**: Middleware checks client IP against allowlist/denylist

**Flow:**
1. Extract client IP from request (handle proxies!)
2. Geolocate IP using MaxMind
3. Check against site's IP allowlist/denylist
4. Check against country allowlist/denylist (if configured)
5. Allow or block

### Implementation

```javascript
import maxmind from 'maxmind';
import { isIPv4, isIPv6, parse as parseIP } from 'ipaddr.js';

// Load MaxMind database at startup
const geoReader = await maxmind.open('./GeoLite2-City.mmdb');
const anonReader = await maxmind.open('./GeoIP2-Anonymous-IP.mmdb');

async function ipAccessControl(request, reply) {
  const site = request.site;
  
  if (site.access_mode === 'disabled' || site.access_mode === 'geo_only') {
    return; // Skip IP checks
  }
  
  // Extract real client IP (handle X-Forwarded-For, X-Real-IP)
  const clientIP = getClientIP(request);
  
  // Check IP allowlist (if exists, only allow these IPs)
  if (site.ip_allowlist?.length > 0) {
    if (!isIPInList(clientIP, site.ip_allowlist)) {
      await logBlockedAccess(request, 'ip_not_in_allowlist', clientIP);
      return reply.code(403).send({ error: 'Access denied: IP not allowed' });
    }
  }
  
  // Check IP denylist
  if (site.ip_denylist?.length > 0) {
    if (isIPInList(clientIP, site.ip_denylist)) {
      await logBlockedAccess(request, 'ip_in_denylist', clientIP);
      return reply.code(403).send({ error: 'Access denied: IP blocked' });
    }
  }
  
  // Geolocate IP
  const geo = geoReader.get(clientIP);
  if (!geo) {
    // IP not in database (private IP, etc.)
    if (site.block_unknown_ips) {
      await logBlockedAccess(request, 'ip_unknown', clientIP);
      return reply.code(403).send({ error: 'Access denied: Unknown IP' });
    }
    return; // Allow by default
  }
  
  // Check country allowlist/denylist
  if (site.country_allowlist?.length > 0) {
    if (!site.country_allowlist.includes(geo.country.iso_code)) {
      await logBlockedAccess(request, 'country_not_allowed', clientIP, geo);
      return reply.code(403).send({ error: 'Access denied: Country not allowed' });
    }
  }
  
  if (site.country_denylist?.length > 0) {
    if (site.country_denylist.includes(geo.country.iso_code)) {
      await logBlockedAccess(request, 'country_blocked', clientIP, geo);
      return reply.code(403).send({ error: 'Access denied: Country blocked' });
    }
  }
  
  // Check for VPN/Proxy (if enabled)
  if (site.block_vpn_proxy) {
    const anonData = anonReader.get(clientIP);
    if (anonData?.is_vpn || anonData?.is_proxy || anonData?.is_hosting_provider) {
      await logBlockedAccess(request, 'vpn_proxy_detected', clientIP, anonData);
      return reply.code(403).send({ error: 'Access denied: VPN/Proxy detected' });
    }
  }
  
  // IP check passed
  request.ipGeo = geo; // Attach to request for logging
}

function getClientIP(request) {
  // Trust proxy headers if behind reverse proxy
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers['x-real-ip'];
  if (realIP) return realIP;
  
  return request.ip;
}

function isIPInList(ip, list) {
  const addr = parseIP(ip);
  
  for (const range of list) {
    if (range.includes('/')) {
      // CIDR range
      const [rangeIP, bits] = range.split('/');
      const rangeAddr = parseIP(rangeIP);
      if (addr.match(rangeAddr, parseInt(bits))) {
        return true;
      }
    } else {
      // Single IP
      if (addr.toString() === parseIP(range).toString()) {
        return true;
      }
    }
  }
  
  return false;
}
```

### Enhanced Schema for IP Filtering

```sql
ALTER TABLE sites ADD COLUMN country_allowlist VARCHAR(2)[];
ALTER TABLE sites ADD COLUMN country_denylist VARCHAR(2)[];
ALTER TABLE sites ADD COLUMN block_vpn_proxy BOOLEAN DEFAULT false;
ALTER TABLE sites ADD COLUMN block_unknown_ips BOOLEAN DEFAULT false;
```

### VPN/Proxy Detection

**MaxMind Anonymous IP Database** detects:
- VPN servers
- Public proxies
- Hosting providers (AWS, GCP, DigitalOcean)
- Tor exit nodes

**Limitations:**
- Not 100% accurate (new VPNs, residential proxies bypass)
- Residential proxy detection requires separate service (IPinfo Residential Proxy API)

### Libraries

| Library | Purpose | Confidence |
|---|---|---|
| `maxmind` | IP geolocation database reader | HIGH |
| `ipaddr.js` | IP address parsing and CIDR matching | HIGH |
| `ip-range-check` | Alternative for CIDR matching | MEDIUM |

### Common Pitfalls

1. **Not handling X-Forwarded-For** → Wrong IP detected → Access control bypassed
2. **Trusting X-Forwarded-For blindly** → IP spoofing → Security vulnerability
3. **Not updating MaxMind DB** → Outdated geolocation → Wrong blocks
4. **Blocking all proxies** → CDNs blocked (Cloudflare, etc.) → Site broken
5. **IPv6 not handled** → Access control bypassed via IPv6

### Confidence: HIGH

---

## Feature 3: GPS-Based Geofencing

### Standard Approach

**Pattern**: Browser Geolocation API → Backend validates against PostGIS polygon

**Flow:**
1. Frontend requests GPS coordinates from browser
2. User grants location permission
3. Frontend sends coordinates to backend
4. Backend checks if coordinates are within geofence using PostGIS
5. Allow or block

### Frontend Implementation

```javascript
// React component
async function requestLocationAccess(siteId, callback) {
  if (!navigator.geolocation) {
    callback({ error: 'Geolocation not supported' });
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      
      // Send to backend
      const response = await fetch(`/api/sites/${siteId}/check-geofence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, accuracy })
      });
      
      const result = await response.json();
      callback(result);
    },
    (error) => {
      // User denied permission or error occurred
      callback({ error: error.message, code: error.code });
    },
    {
      enableHighAccuracy: true, // Request GPS, not WiFi triangulation
      timeout: 10000, // 10s timeout
      maximumAge: 0 // Don't use cached position
    }
  );
}
```

### Backend Implementation (PostGIS)

```javascript
async function checkGeofence(siteId, latitude, longitude) {
  const result = await db.query(`
    SELECT 
      CASE
        WHEN geofence_type = 'polygon' THEN
          ST_Within(
            ST_SetSRID(ST_MakePoint($2, $1), 4326),
            geofence_polygon
          )
        WHEN geofence_type = 'radius' THEN
          ST_DWithin(
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
            geofence_center::geography,
            geofence_radius_km * 1000 -- convert km to meters
          )
        ELSE false
      END AS is_inside
    FROM sites
    WHERE id = $3
  `, [latitude, longitude, siteId]);
  
  return result.rows[0]?.is_inside || false;
}

// Fastify route
fastify.post('/api/sites/:siteId/check-geofence', async (request, reply) => {
  const { siteId } = request.params;
  const { latitude, longitude, accuracy } = request.body;
  
  // Validate coordinates
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return reply.code(400).send({ error: 'Invalid coordinates' });
  }
  
  const isInside = await checkGeofence(siteId, latitude, longitude);
  
  if (!isInside) {
    await logBlockedAccess(request, 'outside_geofence', null, { latitude, longitude, accuracy });
    return reply.send({ allowed: false, reason: 'Outside geofence' });
  }
  
  return reply.send({ allowed: true });
});
```

### Geofence Types

#### 1. Polygon Geofence (Recommended)

**Best for:** Irregular boundaries (city limits, campus, etc.)

```sql
-- Store polygon as GeoJSON coordinates
UPDATE sites SET 
  geofence_type = 'polygon',
  geofence_polygon = ST_GeomFromGeoJSON('{
    "type": "Polygon",
    "coordinates": [[
      [-122.4194, 37.7749],
      [-122.4194, 37.8049],
      [-122.3894, 37.8049],
      [-122.3894, 37.7749],
      [-122.4194, 37.7749]
    ]]
  }')
WHERE id = '...';
```

#### 2. Radius Geofence

**Best for:** Simple circular boundaries (office building, venue)

```sql
UPDATE sites SET
  geofence_type = 'radius',
  geofence_center = ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
  geofence_radius_km = 5.0
WHERE id = '...';
```

### GPS Accuracy Handling

**Problem:** GPS accuracy varies (3-100m outdoors, worse indoors)  
**Solution:** Reject low-accuracy coordinates or buffer geofence

```javascript
const MIN_ACCURACY_METERS = 100;

if (accuracy > MIN_ACCURACY_METERS) {
  return reply.code(400).send({ 
    error: 'GPS accuracy too low',
    accuracy,
    required: MIN_ACCURACY_METERS 
  });
}

// Alternative: Buffer geofence by accuracy radius
const isInsideWithBuffer = await db.query(`
  SELECT ST_DWithin(
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
    geofence_polygon::geography,
    $3 -- buffer in meters
  ) AS is_inside
  FROM sites WHERE id = $4
`, [latitude, longitude, accuracy, siteId]);
```

### Libraries

| Library | Purpose | Confidence |
|---|---|---|
| `@turf/turf` | Client-side geofence preview | HIGH |
| `leaflet` + `leaflet-draw` | Map drawing UI | HIGH |
| `react-leaflet` | React map integration | HIGH |

### Common Pitfalls

1. **Not requesting high accuracy** → WiFi triangulation used → Inaccurate
2. **Not handling permission denial** → User stuck on error screen
3. **Trusting client GPS without re-validation** → Client spoofs GPS → Access control bypassed
4. **Not using GEOGRAPHY type** → Distance calculations wrong (degrees vs meters)
5. **Polygon winding order wrong** → ST_Within fails → Access denied incorrectly
6. **No timeout on geolocation request** → User waits forever

### Confidence: HIGH

---

## Feature 4: Admin UI for Access Control

### Standard Approach

**Pattern**: CRUD interface with map visualization

**Key Pages:**
1. Site list (all sites user manages)
2. Site detail (edit access settings)
3. Access logs (view blocked attempts)
4. Artifacts viewer (screenshots, logs)

### Site Settings Form

```typescript
interface SiteSettings {
  name: string;
  hostname: string;
  access_mode: 'ip_only' | 'geo_only' | 'both' | 'disabled';
  
  // IP settings
  ip_allowlist: string[];
  ip_denylist: string[];
  country_allowlist: string[];
  country_denylist: string[];
  block_vpn_proxy: boolean;
  
  // Geo settings
  geofence_type: 'polygon' | 'radius' | null;
  geofence_polygon: GeoJSON.Polygon | null;
  geofence_center: [number, number] | null;
  geofence_radius_km: number | null;
}
```

### Map Drawing Component (React + Leaflet)

```jsx
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';

function GeofenceEditor({ initialPolygon, onChange }) {
  const [polygon, setPolygon] = useState(initialPolygon);
  
  const handleCreated = (e) => {
    const { layer } = e;
    const geojson = layer.toGeoJSON();
    setPolygon(geojson);
    onChange(geojson);
  };
  
  return (
    <MapContainer center={[37.7749, -122.4194]} zoom={12} style={{ height: '400px' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FeatureGroup>
        <EditControl
          position="topright"
          onCreated={handleCreated}
          draw={{
            rectangle: true,
            circle: true,
            polygon: true,
            marker: false,
            polyline: false,
            circlemarker: false
          }}
        />
        {polygon && <GeoJSON data={polygon} />}
      </FeatureGroup>
    </MapContainer>
  );
}
```

### API Endpoints

```
GET    /api/admin/sites              # List sites (filtered by user role)
GET    /api/admin/sites/:id          # Get site details
POST   /api/admin/sites              # Create site (super admin only)
PATCH  /api/admin/sites/:id          # Update site settings
DELETE /api/admin/sites/:id          # Delete site (super admin only)

GET    /api/admin/sites/:id/logs     # Access logs (paginated)
GET    /api/admin/sites/:id/artifacts # List artifacts (screenshots)
GET    /api/admin/artifacts/:id      # Download artifact (pre-signed URL)

POST   /api/admin/sites/:id/admins   # Delegate site admin (super admin only)
DELETE /api/admin/sites/:id/admins/:userId # Revoke site admin
```

### Role-Based Access Control Middleware

```javascript
function requireRole(...roles) {
  return async (request, reply) => {
    const user = request.user; // From JWT
    
    if (!roles.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}

function requireSiteAccess(request, reply) {
  const user = request.user;
  const siteId = request.params.id;
  
  // Super admin has access to all sites
  if (user.role === 'super_admin') return;
  
  // Site admin/viewer only access assigned sites
  if (!user.sites?.includes(siteId)) {
    return reply.code(403).send({ error: 'Access denied to this site' });
  }
}

// Apply to routes
fastify.get('/api/admin/sites/:id', {
  preHandler: [authenticateJWT, requireSiteAccess]
}, async (request, reply) => {
  // ...
});
```

### Libraries

| Library | Purpose | Confidence |
|---|---|---|
| `react-query` | Server state management, caching | HIGH |
| `react-leaflet` | Map integration | HIGH |
| `react-leaflet-draw` | Geofence drawing | HIGH |
| `react-hook-form` | Form management | HIGH |
| `zod` | Schema validation (client + server) | HIGH |
| `shadcn/ui` | UI components | MEDIUM |

### Common Pitfalls

1. **No optimistic updates** → UI feels slow
2. **No form validation** → Invalid data sent to server
3. **Map doesn't load** → Leaflet CSS not imported
4. **Polygon self-intersects** → PostGIS query fails
5. **No pagination on logs** → Page crashes with large datasets

### Confidence: HIGH

---

## Feature 5: Site Admin Role Delegation

### Standard Approach

**Pattern**: Many-to-many relationship (users ↔ sites) with role column

### Database Schema

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  global_role VARCHAR(50) NOT NULL, -- 'super_admin', 'user'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

### Role Hierarchy

```
super_admin (global)
  └─ Can manage all sites
  └─ Can delegate site admins/viewers
  └─ Can create/delete sites

site_admin (per-site)
  └─ Can update site settings (access mode, geofence, IP lists)
  └─ Can view logs and artifacts for assigned sites
  └─ Cannot delegate to other users
  └─ Cannot delete sites

viewer (per-site)
  └─ Can view site settings (read-only)
  └─ Can view logs and artifacts
  └─ Cannot modify settings
```

### API Implementation

```javascript
// Grant site admin role
fastify.post('/api/admin/sites/:siteId/admins', {
  preHandler: [authenticateJWT, requireRole('super_admin')]
}, async (request, reply) => {
  const { siteId } = request.params;
  const { userId, role } = request.body; // role: 'admin' | 'viewer'
  
  // Validate role
  if (!['admin', 'viewer'].includes(role)) {
    return reply.code(400).send({ error: 'Invalid role' });
  }
  
  // Check if site exists
  const site = await db.query('SELECT id FROM sites WHERE id = $1', [siteId]);
  if (!site.rows.length) {
    return reply.code(404).send({ error: 'Site not found' });
  }
  
  // Check if user exists
  const user = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user.rows.length) {
    return reply.code(404).send({ error: 'User not found' });
  }
  
  // Grant role (upsert)
  await db.query(`
    INSERT INTO user_site_roles (user_id, site_id, role, granted_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, site_id) DO UPDATE SET role = $3, granted_by = $4
  `, [userId, siteId, role, request.user.id]);
  
  return reply.send({ success: true });
});

// List site admins
fastify.get('/api/admin/sites/:siteId/admins', {
  preHandler: [authenticateJWT, requireRole('super_admin', 'site_admin')]
}, async (request, reply) => {
  const { siteId } = request.params;
  
  const admins = await db.query(`
    SELECT u.id, u.email, usr.role, usr.granted_at
    FROM user_site_roles usr
    JOIN users u ON u.id = usr.user_id
    WHERE usr.site_id = $1
    ORDER BY usr.granted_at DESC
  `, [siteId]);
  
  return reply.send(admins.rows);
});
```

### JWT Token with Sites

```javascript
// On login, include sites in JWT
async function generateToken(user) {
  const sites = await db.query(`
    SELECT site_id, role FROM user_site_roles WHERE user_id = $1
  `, [user.id]);
  
  const token = fastify.jwt.sign({
    sub: user.id,
    email: user.email,
    role: user.global_role,
    sites: sites.rows.reduce((acc, row) => {
      acc[row.site_id] = row.role;
      return acc;
    }, {})
  }, { expiresIn: '1h' });
  
  return token;
}

// Middleware to check site access
function requireSiteAccess(request, reply) {
  const siteId = request.params.siteId;
  const user = request.user;
  
  if (user.role === 'super_admin') return; // Super admin can access all
  
  const siteRole = user.sites?.[siteId];
  if (!siteRole) {
    return reply.code(403).send({ error: 'Access denied to this site' });
  }
  
  request.siteRole = siteRole; // 'admin' or 'viewer'
}
```

### Common Pitfalls

1. **No cascade delete** → Orphaned user_site_roles when user/site deleted
2. **JWT doesn't refresh** → User granted access but token still shows no access
3. **Site admin can escalate to super admin** → Privilege escalation vulnerability
4. **No audit trail** → Can't see who delegated access

### Confidence: HIGH

---

## Feature 6: Audit Logs & Artifacts

### Standard Approach

**Pattern**: Append-only logs + S3 artifacts with metadata

### Database Schema

```sql
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Request metadata
  ip_address INET NOT NULL,
  user_agent TEXT,
  url TEXT,
  
  -- Access decision
  allowed BOOLEAN NOT NULL,
  reason VARCHAR(100), -- 'ip_not_in_allowlist', 'outside_geofence', etc.
  
  -- IP geolocation data (if available)
  ip_country VARCHAR(2),
  ip_city VARCHAR(100),
  ip_lat NUMERIC(10, 6),
  ip_lng NUMERIC(10, 6),
  
  -- GPS data (if provided)
  gps_lat NUMERIC(10, 6),
  gps_lng NUMERIC(10, 6),
  gps_accuracy NUMERIC(10, 2),
  
  -- Artifact reference
  screenshot_url TEXT,
  
  -- Index for queries
  CHECK (timestamp >= '2026-01-01') -- Partition ready
);

CREATE INDEX idx_access_logs_site_timestamp ON access_logs(site_id, timestamp DESC);
CREATE INDEX idx_access_logs_allowed ON access_logs(allowed);

-- Partition by month for performance
CREATE TABLE access_logs_2026_02 PARTITION OF access_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### Logging Implementation

```javascript
async function logBlockedAccess(request, reason, clientIP, geoData = {}) {
  const site = request.site;
  const { latitude: gpsLat, longitude: gpsLng, accuracy: gpsAccuracy } = request.body || {};
  
  // Trigger screenshot capture (async, don't block response)
  let screenshotUrl = null;
  try {
    screenshotUrl = await captureScreenshot(site.id, request.url, reason);
  } catch (err) {
    fastify.log.error({ err }, 'Failed to capture screenshot');
  }
  
  // Insert log
  await db.query(`
    INSERT INTO access_logs (
      site_id, ip_address, user_agent, url, allowed, reason,
      ip_country, ip_city, ip_lat, ip_lng,
      gps_lat, gps_lng, gps_accuracy,
      screenshot_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `, [
    site.id,
    clientIP,
    request.headers['user-agent'],
    request.url,
    false, // allowed = false
    reason,
    geoData.country?.iso_code,
    geoData.city?.names?.en,
    geoData.location?.latitude,
    geoData.location?.longitude,
    gpsLat,
    gpsLng,
    gpsAccuracy,
    screenshotUrl
  ]);
}

async function logAllowedAccess(request, clientIP, geoData = {}) {
  // Optional: Log successful access too (can be noisy)
  await db.query(`
    INSERT INTO access_logs (site_id, ip_address, url, allowed)
    VALUES ($1, $2, $3, $4)
  `, [request.site.id, clientIP, request.url, true]);
}
```

### Screenshot Capture (Async)

```javascript
import { chromium } from 'playwright';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });
let browser; // Reuse browser instance

async function captureScreenshot(siteId, url, reason) {
  // Lazy load browser
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate to blocked URL
    await page.goto(url, { timeout: 10000, waitUntil: 'networkidle' });
    
    // Capture screenshot
    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    
    // Upload to S3
    const timestamp = new Date().toISOString();
    const key = `screenshots/blocked/${siteId}/${timestamp}-${reason}.png`;
    
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: screenshot,
      ContentType: 'image/png',
      Metadata: {
        siteId,
        reason,
        timestamp
      }
    }));
    
    return `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`;
  } catch (err) {
    fastify.log.error({ err }, 'Screenshot capture failed');
    throw err;
  } finally {
    await context.close();
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browser) await browser.close();
});
```

### Artifact Retrieval (Pre-signed URLs)

```javascript
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

fastify.get('/api/admin/artifacts/:key', {
  preHandler: [authenticateJWT, requireSiteAccess]
}, async (request, reply) => {
  const { key } = request.params;
  
  // Validate key belongs to user's site
  const siteId = key.split('/')[2]; // screenshots/blocked/{siteId}/...
  if (!canAccessSite(request.user, siteId)) {
    return reply.code(403).send({ error: 'Access denied' });
  }
  
  // Generate pre-signed URL (expires in 1 hour)
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key
  });
  
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  
  return reply.send({ url });
});
```

### Log Retention & Cleanup

```javascript
// Cron job to delete old logs (runs daily)
import cron from 'node-cron';

cron.schedule('0 2 * * *', async () => {
  // Delete logs older than 90 days
  await db.query(`
    DELETE FROM access_logs
    WHERE timestamp < NOW() - INTERVAL '90 days'
  `);
  
  // Delete old screenshots from S3 (lifecycle policy preferred)
  // Or use S3 lifecycle rules to auto-delete after 90 days
});
```

### Libraries

| Library | Purpose | Confidence |
|---|---|---|
| `playwright` | Screenshot capture | HIGH |
| `@aws-sdk/client-s3` | S3 uploads/downloads | HIGH |
| `@aws-sdk/s3-request-presigner` | Pre-signed URLs | HIGH |
| `node-cron` | Scheduled cleanup | MEDIUM |
| `bullmq` | Background job queue (screenshots) | MEDIUM |

### Common Pitfalls

1. **Synchronous screenshot capture** → Request hangs for 2-5s → Bad UX
2. **No screenshot timeout** → Playwright hangs forever → Memory leak
3. **Browser not reused** → Launching browser for each screenshot → Slow + high memory
4. **No log partitioning** → Table grows huge → Slow queries
5. **No S3 lifecycle policy** → Storage costs explode

### Confidence: HIGH

---

## Feature 7: Access Control Modes

### Standard Approach

**Pattern**: Enum-based mode selection with mode-specific middleware

### Modes

| Mode | IP Check | Geo Check | Logic |
|---|---|---|---|
| `ip_only` | ✅ | ❌ | Block if IP fails check |
| `geo_only` | ❌ | ✅ | Block if GPS fails check |
| `both` | ✅ | ✅ | Block if either fails (AND logic) |
| `disabled` | ❌ | ❌ | Allow all |

### Implementation

```javascript
async function accessControlMiddleware(request, reply) {
  const site = request.site;
  
  switch (site.access_mode) {
    case 'disabled':
      return; // Allow all
    
    case 'ip_only':
      await ipAccessControl(request, reply);
      break;
    
    case 'geo_only':
      await geoAccessControl(request, reply);
      break;
    
    case 'both':
      await ipAccessControl(request, reply);
      if (!reply.sent) { // IP check passed
        await geoAccessControl(request, reply);
      }
      break;
    
    default:
      reply.code(500).send({ error: 'Invalid access mode' });
  }
}

async function geoAccessControl(request, reply) {
  const site = request.site;
  const { latitude, longitude, accuracy } = request.body || {};
  
  // If geo mode enabled but no GPS provided, block (require GPS)
  if (!latitude || !longitude) {
    return reply.code(403).send({ 
      error: 'GPS coordinates required',
      requiresGPS: true 
    });
  }
  
  const isInside = await checkGeofence(site.id, latitude, longitude);
  
  if (!isInside) {
    await logBlockedAccess(request, 'outside_geofence', null, { latitude, longitude, accuracy });
    return reply.code(403).send({ error: 'Access denied: Outside geofence' });
  }
}
```

### Frontend Flow (Geo Mode)

```javascript
// When site requires GPS, request on page load
useEffect(() => {
  if (siteSettings.access_mode === 'geo_only' || siteSettings.access_mode === 'both') {
    requestLocationAccess(siteId, (result) => {
      if (result.error) {
        // Show error modal: "This site requires location access"
        setLocationError(result.error);
      } else if (!result.allowed) {
        // Show error modal: "You are outside the allowed area"
        setAccessDenied(true);
      } else {
        // Access granted
        setAccessAllowed(true);
      }
    });
  }
}, [siteSettings]);
```

### Common Pitfalls

1. **No OR logic option** → Users ask for "IP OR Geo" mode → Feature request
2. **Geo mode doesn't handle permission denial gracefully** → User sees browser error
3. **Mode change doesn't clear cache** → Old mode applied

### Confidence: HIGH

---

## Summary Table

| Feature | Standard Library | Complexity | Pitfall Risk |
|---|---|---|---|
| Multi-Site Hosting | `lru-cache`, `ioredis` | Medium | Medium |
| IP Access Control | `maxmind`, `ipaddr.js` | Medium | High |
| GPS Geofencing | PostGIS, `@turf/turf` | High | High |
| Admin UI | `react-leaflet`, `react-query` | Medium | Low |
| Role Delegation | JWT, PostgreSQL | Low | Medium |
| Audit Logs | S3, `playwright` | Medium | Medium |
| Access Modes | Fastify middleware | Low | Low |

**Overall Confidence: HIGH** (Most features have well-established patterns and libraries)

---

## Don't Hand-Roll These

| Feature | Use Instead | Why |
|---|---|---|
| IP geolocation | MaxMind GeoIP2 | Accurate, maintained, fast |
| Geofence calculations | PostGIS ST_Within | Optimized C code, spatial indexes |
| Password hashing | bcrypt/argon2 | Peer-reviewed, constant-time |
| JWT tokens | `@fastify/jwt` | Secure defaults, tested |
| Map drawing | Leaflet Draw | Complex UI interactions |
| Screenshot capture | Playwright | Handles edge cases (popups, lazy loading) |

---

**Last Updated**: 2026-02-14  
**Researcher**: OpenCode Research Agent
