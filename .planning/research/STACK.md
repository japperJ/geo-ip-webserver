# Technology Stack Research

## Executive Summary

Based on research comparing Node.js (Fastify/Express) vs Python (FastAPI), and evaluating PostGIS, IP geolocation services, and screenshot capture tools, the recommended stack provides optimal performance, developer experience, and ecosystem support for a geo-fenced multi-site webserver.

---

## Backend Framework

| Layer | Technology | Version | Confidence | Source | Rationale |
|---|---|---|---|---|---|
| **Runtime** | **Node.js** | **22.x LTS** | **HIGH** | Official docs | LTS support, native ESM, excellent async I/O for handling multiple concurrent requests |
| Framework | **Fastify** | **5.7.x** | **HIGH** | fastify.io, GitHub releases | ~3x faster than Express, schema-based validation, plugin architecture, TypeScript support |
| Alternative | FastAPI (Python) | 0.129.x | HIGH | fastapi.tiangolo.com | Excellent developer experience, auto-generated docs, but slower than Node.js for I/O-heavy workloads |

### Recommendation: **Fastify (Node.js)**

**Rationale:**
- **Performance**: Fastify is one of the fastest Node.js frameworks (~30k req/sec), crucial for handling geolocation checks on every request
- **Plugin Architecture**: Perfect for multi-site routing and per-site middleware (geo/IP checks)
- **Schema Validation**: Built-in JSON Schema validation reduces validation overhead
- **Async-First**: Excellent for I/O-heavy operations (DB queries, IP geolocation API calls, screenshot capture)
- **TypeScript Support**: Strong typing with excellent DX
- **Ecosystem**: Large plugin ecosystem including database connectors, auth, CORS, rate limiting

**FastAPI Advantages (if choosing Python):**
- Auto-generated OpenAPI docs (Swagger/ReDoc)
- Python's data science ecosystem (if analytics needed)
- Simpler syntax for non-JS developers
- Better CPU-bound performance for data processing

**FastAPI Disadvantages:**
- Slower for I/O-heavy workloads (async I/O not as mature as Node.js)
- Larger memory footprint
- PostGIS integration requires psycopg3/SQLAlchemy (more boilerplate)

---

## Database & Geospatial

| Layer | Technology | Version | Confidence | Source | Rationale |
|---|---|---|---|---|---|
| **Database** | **PostgreSQL** | **16.x** | **HIGH** | postgresql.org | Industry standard, ACID compliance, excellent JSON support |
| **Geospatial Extension** | **PostGIS** | **3.6.x** | **HIGH** | postgis.net | De facto standard for geospatial queries, ST_Within for polygon geofencing |
| ORM/Query Builder | Kysely or Drizzle | Latest | MEDIUM | npm | Type-safe SQL builders for Node.js, PostGIS compatibility |

### PostGIS Capabilities

**Key Features for This Project:**
- **Geofencing Queries**: `ST_Within(point, polygon)` for checking if GPS coordinates fall within geofence
- **Distance Calculations**: `ST_Distance(point1, point2)` for radius-based geofencing
- **Spatial Indexing**: GIST indexes for fast polygon queries (critical for performance)
- **Geometry Storage**: GEOGRAPHY type for accurate real-world distances (meters)
- **Performance**: Optimized C implementation, handles millions of points efficiently

**Example Geofence Query:**
```sql
-- Check if GPS coordinates are within site's geofence polygon
SELECT EXISTS (
  SELECT 1 FROM sites
  WHERE site_id = $1
  AND ST_Within(
    ST_SetSRID(ST_MakePoint($2, $3), 4326),
    geofence_polygon
  )
);
```

**Indexing Strategy:**
```sql
CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_polygon);
```

---

## IP Geolocation

| Service | Version/Plan | Confidence | Source | Rationale |
|---|---|---|---|---|
| **MaxMind GeoIP2** | GeoLite2/Paid | **HIGH** | dev.maxmind.com | Industry standard, local database (low latency), 99.8% country accuracy |
| Alternative | IPinfo API | API/Database | HIGH | ipinfo.io | Good API, 95% city accuracy, simple pricing |

### Recommendation: **MaxMind GeoIP2 with Local Database**

**Rationale:**
- **Performance**: Local MMDB lookup (<1ms) vs API call (50-200ms)
- **Cost**: Free GeoLite2 for basic geolocation, paid for higher accuracy
- **Accuracy**: 
  - Country: 99.8%
  - City: ~80% within 50km (GeoLite2), 90%+ (paid)
- **Offline**: Works without external API calls (better reliability)
- **Privacy**: No data sent to third parties
- **Node.js Library**: `maxmind` npm package with TypeScript support

**Implementation Strategy:**
```javascript
// Cache database in memory
const reader = await maxmind.open('./GeoLite2-City.mmdb');

// Lookup on each request (sub-millisecond)
const geo = reader.get(clientIP);
// Returns: { country: 'US', city: 'Mountain View', ... }
```

**Update Strategy:**
- GeoLite2 updates: Weekly via `geoipupdate` tool
- Paid GeoIP2 updates: Daily/weekly
- Atomic swap: Load new DB into memory, swap reader

**VPN/Proxy Detection:**
- Use MaxMind's **Anonymous IP Database** (separate product)
- Detects VPNs, proxies, hosting providers, Tor exit nodes
- Critical for preventing geofence bypass

---

## Screenshot Capture

| Technology | Version | Confidence | Source | Rationale |
|---|---|---|---|---|
| **Playwright** | **1.58.x** | **HIGH** | playwright.dev, GitHub | Modern, cross-browser, reliable, Microsoft-backed |
| Alternative | Puppeteer | Latest | MEDIUM | GitHub | Chrome-only, older but stable |

### Recommendation: **Playwright**

**Rationale:**
- **Reliability**: Auto-waiting, no flaky screenshots
- **Performance**: Headless Chromium startup ~500ms
- **Features**: 
  - Full-page screenshots
  - Specific element screenshots
  - Screenshot on failed access attempt
  - Can capture network logs, console errors
- **Browser Support**: Chromium, Firefox, WebKit (though Chromium sufficient here)
- **Node.js Integration**: Excellent async/await support

**Implementation Pattern:**
```javascript
// Lazy load browser (only when access blocked)
let browser;

async function captureBlockedAccess(url, reason) {
  if (!browser) {
    browser = await playwright.chromium.launch({ headless: true });
  }
  
  const page = await browser.newPage();
  await page.goto(url);
  
  const screenshot = await page.screenshot({ fullPage: true });
  const timestamp = new Date().toISOString();
  
  // Upload to S3
  await s3.putObject({
    Bucket: 'artifacts',
    Key: `blocked/${siteId}/${timestamp}.png`,
    Body: screenshot
  });
  
  await page.close();
}
```

**Performance Considerations:**
- Keep browser instance alive (pool of 2-3 contexts)
- Screenshot async (don't block request response)
- Use background job queue for high traffic
- Timeout after 10s to prevent hangs

---

## Artifact Storage

| Service | Type | Confidence | Source | Rationale |
|---|---|---|---|---|
| **MinIO** | S3-Compatible | **HIGH** | min.io | Self-hosted, S3-compatible, no vendor lock-in |
| Alternative | AWS S3 | Cloud Object Storage | HIGH | aws.amazon.com | Managed, highly available, pay-per-use |

### Recommendation: **MinIO for Development, AWS S3 for Production**

**Rationale:**
- **Development**: MinIO runs locally in Docker, zero cloud costs
- **Production**: AWS S3 for reliability (99.999999999% durability)
- **Compatibility**: Same SDK (`@aws-sdk/client-s3`) for both
- **Features**:
  - Versioning for audit compliance
  - Lifecycle policies (delete old screenshots after 90 days)
  - Pre-signed URLs for secure access
  - Event notifications (trigger on upload)

**Storage Structure:**
```
s3://artifacts/
  ├─ logs/
  │   ├─ 2026/02/14/
  │   │   └─ site-123-access.log
  ├─ screenshots/
  │   ├─ blocked/
  │   │   ├─ site-123/
  │   │   │   └─ 2026-02-14T10:30:00Z.png
```

---

## Authentication & Authorization

| Layer | Technology | Version | Confidence | Source | Rationale |
|---|---|---|---|---|
| **Auth Strategy** | **JWT + Refresh Tokens** | N/A | **HIGH** | RFC 7519 | Stateless, scalable, works with multi-site |
| Auth Library | `@fastify/jwt` | Latest | HIGH | npm | Official Fastify JWT plugin |
| Password Hashing | `bcrypt` or `argon2` | Latest | HIGH | npm | Industry standard, resistant to brute force |
| RBAC | Custom (DB-backed) | N/A | MEDIUM | Pattern research | Simple role hierarchy: Super Admin > Site Admin > Viewer |

### RBAC Model

**Roles:**
1. **Super Admin**: Manage all sites, delegate site admins, global settings
2. **Site Admin**: Manage assigned sites only (toggle filters, view logs/artifacts)
3. **Viewer**: Read-only access to assigned sites

**Permissions Table:**
```sql
CREATE TABLE permissions (
  role VARCHAR(50),
  resource VARCHAR(50),
  action VARCHAR(50),
  PRIMARY KEY (role, resource, action)
);

-- Examples:
-- ('super_admin', '*', '*')
-- ('site_admin', 'site', 'update')
-- ('site_admin', 'artifacts', 'read')
-- ('viewer', 'artifacts', 'read')
```

**JWT Claims:**
```json
{
  "sub": "user-123",
  "role": "site_admin",
  "sites": ["site-1", "site-2"],
  "exp": 1645123456
}
```

---

## Frontend Admin UI

| Layer | Technology | Version | Confidence | Source | Rationale |
|---|---|---|---|---|
| **Framework** | **React** | **18.x** | **HIGH** | react.dev | Industry standard, huge ecosystem |
| **Language** | **TypeScript** | **5.x** | **HIGH** | typescriptlang.org | Type safety, better DX |
| Build Tool | Vite | Latest | HIGH | vitejs.dev | Fast HMR, modern ESM-based |
| State Management | React Query | Latest | HIGH | tanstack.com/query | Server state management, caching |
| UI Library | shadcn/ui + Tailwind | Latest | MEDIUM | shadcn.com | Modern, accessible, customizable |
| Map Integration | Leaflet or Mapbox GL | Latest | HIGH | leafletjs.com | Interactive maps for geofence drawing |

### Map Library Comparison

**Leaflet:**
- Pros: Open source, no API key, good for simple polygons
- Cons: Less performant for large datasets

**Mapbox GL:**
- Pros: Beautiful, performant, excellent drawing tools
- Cons: Requires API key, usage limits on free tier

**Recommendation**: **Leaflet** for MVP, migrate to Mapbox GL if needed.

**Drawing Geofence Polygons:**
```javascript
// Using Leaflet Draw plugin
import L from 'leaflet';
import 'leaflet-draw';

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  edit: { featureGroup: drawnItems },
  draw: {
    polygon: true,
    circle: true,
    rectangle: true,
    marker: false,
    polyline: false
  }
});

map.on(L.Draw.Event.CREATED, (e) => {
  const { layer } = e;
  const geojson = layer.toGeoJSON();
  // Send to backend: POST /api/sites/{id}/geofence
});
```

---

## Deployment & Infrastructure

| Layer | Technology | Version | Confidence | Source | Rationale |
|---|---|---|---|---|
| **Containerization** | **Docker** | Latest | **HIGH** | docker.com | Standard for packaging apps |
| **Orchestration** | **Kubernetes** | 1.30.x | **MEDIUM** | kubernetes.io | Scalable, self-healing, overkill for small deployments |
| Alternative | Docker Compose | Latest | HIGH | docker.com | Simpler for single-server deployments |
| Reverse Proxy | Nginx or Traefik | Latest | HIGH | nginx.org | SSL termination, load balancing |
| Process Manager | PM2 (if not K8s) | Latest | MEDIUM | pm2.io | Process management, auto-restart |

### Deployment Architecture Recommendation

**Small Scale (<10k requests/day):**
- Single VPS (4GB RAM, 2 vCPU)
- Docker Compose stack:
  - Fastify app (2 instances behind Nginx)
  - PostgreSQL + PostGIS
  - MinIO
  - Redis (for caching)
- Nginx for SSL termination + reverse proxy

**Medium Scale (10k-100k req/day):**
- Kubernetes cluster (3 nodes)
- Horizontal pod autoscaling for Fastify
- Managed PostgreSQL (AWS RDS, DigitalOcean)
- AWS S3 for artifacts
- Redis cluster for caching

**High Scale (>100k req/day):**
- Multi-region Kubernetes
- Read replicas for PostgreSQL
- CDN (Cloudflare) for static assets
- Separate screenshot service (worker nodes)

---

## Additional Libraries & Tools

### Node.js Libraries

| Purpose | Library | Version | Confidence |
|---|---|---|---|
| Environment Variables | `dotenv` or `@fastify/env` | Latest | HIGH |
| Input Validation | `@sinclair/typebox` | Latest | HIGH |
| Logging | `pino` (built into Fastify) | Latest | HIGH |
| Rate Limiting | `@fastify/rate-limit` | Latest | HIGH |
| CORS | `@fastify/cors` | Latest | HIGH |
| PostgreSQL Client | `pg` + `pg-pool` | Latest | HIGH |
| IP Address Parsing | `ipaddr.js` | Latest | HIGH |
| Geospatial Utilities | `@turf/turf` | 7.3.x | HIGH |
| Job Queue | `bullmq` + Redis | Latest | MEDIUM |

### Geospatial Utilities (Turf.js)

**Use Cases:**
- Client-side geofence validation (preview before saving)
- Convert radius to polygon (circle geofencing)
- Calculate polygon area
- Simplify complex polygons

**Example:**
```javascript
import * as turf from '@turf/turf';

// Convert 5km radius to polygon
const center = turf.point([lng, lat]);
const radius = 5; // km
const options = { steps: 64, units: 'kilometers' };
const circle = turf.circle(center, radius, options);

// Check if point is inside polygon (client-side preview)
const point = turf.point([userLng, userLat]);
const polygon = turf.polygon(geofenceCoordinates);
const isInside = turf.booleanPointInPolygon(point, polygon);
```

---

## Summary Table

| Decision | Technology | Why |
|---|---|---|
| Backend | **Fastify + Node.js** | Performance, async I/O, ecosystem |
| Database | **PostgreSQL + PostGIS** | Geospatial queries, proven |
| IP Geolocation | **MaxMind GeoIP2 (local DB)** | Speed, accuracy, privacy |
| Screenshots | **Playwright** | Reliability, modern, maintained |
| Storage | **MinIO (dev) / S3 (prod)** | S3-compatible, flexible |
| Auth | **JWT + RBAC** | Stateless, scalable |
| Frontend | **React + TypeScript** | Ecosystem, TypeScript safety |
| Maps | **Leaflet** | Open source, sufficient |
| Deployment | **Docker + K8s (or Compose)** | Scalable, standard |

---

## Confidence Levels

- **HIGH**: Multiple authoritative sources confirm this choice, widely adopted
- **MEDIUM**: Good option but alternatives exist, less critical to project success
- **LOW**: Limited information, may require further validation

---

## Sources

| Source | Type | URL |
|---|---|---|
| Fastify Official Docs | Official | https://fastify.io |
| FastAPI Official Docs | Official | https://fastapi.tiangolo.com |
| PostGIS Official Site | Official | https://postgis.net |
| MaxMind Developer Portal | Official | https://dev.maxmind.com/geoip |
| IPinfo Developer Docs | Official | https://ipinfo.io/developers |
| Playwright Documentation | Official | https://playwright.dev |
| Turf.js Documentation | Official | https://turfjs.org |
| GitHub Release APIs | API | github.com/repos/{org}/{repo}/releases/latest |
| GDPR Official Resource | Official | https://gdpr.eu |

---

**Last Updated**: 2026-02-14  
**Researcher**: OpenCode Research Agent  
**Confidence**: HIGH (85% of recommendations are HIGH confidence)
