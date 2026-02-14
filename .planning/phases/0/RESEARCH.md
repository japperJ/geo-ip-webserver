# Phase 0 Implementation Research: Foundation & Architecture Setup

**Version:** 1.0  
**Date:** 2026-02-14  
**Status:** Research Complete  
**Phase Duration:** 1-2 weeks  
**Phase Goals:** Development environment, project structure, database schema, CI/CD, MaxMind setup

---

## Table of Contents

1. [Monorepo Structure](#1-monorepo-structure)
2. [Docker Compose Stack](#2-docker-compose-stack)
3. [Database Schema & PostGIS](#3-database-schema--postgis)
4. [Fastify Backend Setup](#4-fastify-backend-setup)
5. [React Frontend Setup](#5-react-frontend-setup)
6. [MaxMind GeoIP2 Integration](#6-maxmind-geoip2-integration)
7. [CI/CD Pipeline](#7-cicd-pipeline)
8. [Setup Order & Dependencies](#8-setup-order--dependencies)

---

## 1. Monorepo Structure

### Best Practices for Node.js + React Monorepo

**Recommended Structure:**
```
geo-ip-webserver/
├── package.json                 # Root package.json with workspaces
├── tsconfig.base.json           # Shared TypeScript config
├── .eslintrc.js                 # Shared ESLint config
├── .prettierrc                  # Shared Prettier config
├── .gitignore
├── .env.example
├── docker-compose.yml
├── packages/
│   ├── backend/                 # Fastify API server
│   │   ├── package.json
│   │   ├── tsconfig.json        # Extends tsconfig.base.json
│   │   ├── src/
│   │   │   ├── index.ts         # Server entry point
│   │   │   ├── app.ts           # Fastify app setup
│   │   │   ├── routes/          # API routes
│   │   │   ├── services/        # Business logic
│   │   │   ├── middleware/      # Access control, auth
│   │   │   ├── models/          # TypeScript types
│   │   │   ├── utils/           # Helpers
│   │   │   └── config/          # Configuration loader
│   │   ├── migrations/          # Database migrations
│   │   └── tests/               # Unit & integration tests
│   │
│   ├── frontend/                # React + Vite SPA
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── main.tsx         # React entry point
│   │   │   ├── App.tsx
│   │   │   ├── pages/           # Route pages
│   │   │   ├── components/      # Reusable components
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── lib/             # API client, utils
│   │   │   └── styles/          # Tailwind/CSS
│   │   └── tests/               # Component tests
│   │
│   └── workers/                 # BullMQ screenshot worker
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts         # Worker entry point
│       │   ├── jobs/            # Job handlers
│       │   └── services/        # Playwright service
│       └── tests/
│
├── infrastructure/              # Deployment configs
│   ├── docker/
│   │   ├── backend.Dockerfile
│   │   ├── frontend.Dockerfile
│   │   └── worker.Dockerfile
│   └── k8s/                     # Kubernetes manifests (future)
│
└── .planning/                   # Project planning docs
    ├── ROADMAP.md
    ├── REQUIREMENTS.md
    └── phases/
        └── 0/
            └── RESEARCH.md      # This document
```

### Package Manager Choice

**Recommended: npm workspaces** (Node.js 18+ built-in)

**Why npm workspaces:**
- ✅ Built into Node.js 18+, no extra tooling needed
- ✅ Simple, well-documented, industry standard
- ✅ Works seamlessly with Docker (no special setup)
- ✅ Hoisting works correctly for shared dependencies

**Alternatives:**
- **pnpm:** Faster installs, stricter dependency resolution (good for large monorepos)
- **yarn workspaces:** Similar to npm, but declining ecosystem support

**Root package.json:**
```json
{
  "name": "geo-ip-webserver",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "concurrently \"npm:dev:*\"",
    "dev:backend": "npm run dev --workspace=backend",
    "dev:frontend": "npm run dev --workspace=frontend",
    "dev:worker": "npm run dev --workspace=workers",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "eslint packages/*/src --ext .ts,.tsx",
    "format": "prettier --write \"packages/*/src/**/*.{ts,tsx}\"",
    "migrate": "npm run migrate --workspace=backend"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "concurrently": "^8.2.2",
    "eslint": "^8.57.0",
    "prettier": "^3.2.5",
    "typescript": "^5.3.3"
  }
}
```

### Shared TypeScript Configuration

**tsconfig.base.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": false,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Backend tsconfig.json:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Frontend tsconfig.json:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["vite/client"],
    "isolatedModules": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Script Coordination

**Running all services in development:**
```bash
# Root level - runs all dev servers concurrently
npm run dev

# Individual services
npm run dev:backend   # Fastify on port 3000
npm run dev:frontend  # Vite on port 5173
npm run dev:worker    # BullMQ worker (background process)
```

**Build for production:**
```bash
npm run build  # Builds all workspaces
```

### References
- [npm workspaces documentation](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html)

---

## 2. Docker Compose Stack

### PostgreSQL 16 + PostGIS 3.6 Configuration

**Official Image:** `postgis/postgis:16-3.4` (PostGIS 3.6 not released yet, use 3.4)

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  # PostgreSQL + PostGIS
  postgres:
    image: postgis/postgis:16-3.4
    container_name: geo-webserver-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: geo_webserver
      POSTGRES_USER: geo_admin
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme123}
      # Enable PostGIS extension on startup
      POSTGRES_INITDB_ARGS: "-E UTF8"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infrastructure/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U geo_admin -d geo_webserver"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - geo_network

  # Redis 7.x (Cache + BullMQ)
  redis:
    image: redis:7-alpine
    container_name: geo-webserver-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redispass123}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - geo_network

  # MinIO (S3-compatible storage)
  minio:
    image: minio/minio:latest
    container_name: geo-webserver-minio
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin123}
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"  # S3 API
      - "9001:9001"  # Web Console
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
    networks:
      - geo_network

  # Fastify Backend
  backend:
    build:
      context: .
      dockerfile: infrastructure/docker/backend.Dockerfile
    container_name: geo-webserver-backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: development
      PORT: 3000
      DATABASE_URL: postgresql://geo_admin:${DB_PASSWORD:-changeme123}@postgres:5432/geo_webserver
      REDIS_URL: redis://:${REDIS_PASSWORD:-redispass123}@redis:6379
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-minioadmin123}
      JWT_SECRET: ${JWT_SECRET:-dev-secret-change-in-production}
    ports:
      - "3000:3000"
    volumes:
      - ./packages/backend:/app/packages/backend
      - /app/packages/backend/node_modules  # Prevent overwrite
      - ./data/maxmind:/app/data/maxmind:ro  # MaxMind databases
    networks:
      - geo_network

  # React Frontend (Vite dev server)
  frontend:
    build:
      context: .
      dockerfile: infrastructure/docker/frontend.Dockerfile
    container_name: geo-webserver-frontend
    restart: unless-stopped
    environment:
      VITE_API_URL: http://localhost:3000
    ports:
      - "5173:5173"
    volumes:
      - ./packages/frontend:/app/packages/frontend
      - /app/packages/frontend/node_modules
    networks:
      - geo_network

  # Screenshot Worker (BullMQ)
  worker:
    build:
      context: .
      dockerfile: infrastructure/docker/worker.Dockerfile
    container_name: geo-webserver-worker
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    environment:
      NODE_ENV: development
      REDIS_URL: redis://:${REDIS_PASSWORD:-redispass123}@redis:6379
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-minioadmin123}
    volumes:
      - ./packages/workers:/app/packages/workers
      - /app/packages/workers/node_modules
    networks:
      - geo_network

networks:
  geo_network:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### PostGIS Initialization Script

**infrastructure/postgres/init.sql:**
```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify PostGIS installation
SELECT PostGIS_version();

-- Create default spatial reference system (SRID 4326 = WGS 84, GPS standard)
-- This is usually included, but good to verify
SELECT * FROM spatial_ref_sys WHERE srid = 4326;

-- Set timezone to UTC
SET timezone = 'UTC';
```

### Health Checks and Startup Order

**Critical Points:**
1. **depends_on with conditions:** Ensures services wait for dependencies to be healthy
2. **Health check intervals:** Balance between quick detection and resource usage
3. **Restart policies:** `unless-stopped` ensures services auto-restart on failure

**Startup sequence:**
```
1. postgres, redis, minio (parallel, independent)
   ↓ (wait for health checks)
2. backend, worker (depends on postgres, redis, minio)
   ↓
3. frontend (independent, but communicates with backend)
```

### Service Networking

**Why bridge network:**
- Services can communicate by service name (e.g., `postgres:5432`)
- Isolated from host network (security)
- Port mapping for external access (host → container)

**Example backend connection:**
```typescript
// Backend connects to postgres by service name
const DATABASE_URL = 'postgresql://geo_admin:password@postgres:5432/geo_webserver';
```

### Volume Management

**Named volumes vs. bind mounts:**
- **Named volumes** (postgres_data, redis_data): Managed by Docker, better performance, persistent
- **Bind mounts** (./packages/backend): Hot-reload during development, sync with host filesystem

**Data persistence:**
```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect geo-ip-webserver_postgres_data

# Backup volume
docker run --rm -v geo-ip-webserver_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data

# Restore volume
docker run --rm -v geo-ip-webserver_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_backup.tar.gz -C /
```

### Environment Variables

**.env file (development):**
```bash
# Database
DB_PASSWORD=dev_password_change_me

# Redis
REDIS_PASSWORD=dev_redis_pass

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minio_dev_pass_123

# JWT
JWT_SECRET=dev_jwt_secret_at_least_32_chars_long_change_in_prod

# MaxMind (optional, for API key)
MAXMIND_LICENSE_KEY=your_license_key_here
```

**.env.example (committed to Git):**
```bash
# Database
DB_PASSWORD=changeme

# Redis
REDIS_PASSWORD=changeme

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=changeme

# JWT
JWT_SECRET=changeme

# MaxMind
MAXMIND_LICENSE_KEY=your_key_here
```

### Running the Stack

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend

# Stop all services
docker compose down

# Stop and remove volumes (WARNING: data loss)
docker compose down -v

# Restart a single service
docker compose restart backend

# Rebuild service after code changes
docker compose up -d --build backend
```

### References
- [Docker Compose documentation](https://docs.docker.com/compose/)
- [PostGIS Docker image](https://registry.hub.docker.com/r/postgis/postgis/)
- [Redis Docker image](https://hub.docker.com/_/redis)
- [MinIO Docker image](https://min.io/docs/minio/container/index.html)

---

## 3. Database Schema & PostGIS

### PostGIS Extension Setup

**Verification after initialization:**
```sql
-- Check PostGIS version
SELECT PostGIS_full_version();

-- Expected output: POSTGIS="3.4.x" [...]

-- List installed spatial reference systems
SELECT srid, auth_name, srtext 
FROM spatial_ref_sys 
WHERE srid IN (4326, 3857);
-- 4326 = WGS 84 (GPS standard, lat/lng)
-- 3857 = Web Mercator (used by web maps like Leaflet)
```

### Initial Migration Structure

**Migration tooling: node-pg-migrate**

**Install:**
```bash
cd packages/backend
npm install node-pg-migrate pg
```

**package.json scripts:**
```json
{
  "scripts": {
    "migrate": "node-pg-migrate",
    "migrate:create": "node-pg-migrate create",
    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down"
  }
}
```

**Configuration (.node-pg-migrate.json):**
```json
{
  "databaseUrl": "postgresql://geo_admin:password@localhost:5432/geo_webserver",
  "migrationsTable": "pgmigrations",
  "dir": "migrations",
  "direction": "up",
  "schema": "public",
  "decamelize": true,
  "createSchema": true
}
```

### Migration 001: Sites Table

**migrations/1709500000000_create-sites-table.ts:**
```typescript
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Enable UUID extension
  pgm.createExtension('uuid-ossp', { ifNotExists: true });

  // Create sites table
  pgm.createTable('sites', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    slug: {
      type: 'varchar(100)',
      notNull: true,
      unique: true,
    },
    hostname: {
      type: 'varchar(255)',
      unique: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    access_mode: {
      type: 'varchar(20)',
      notNull: true,
      default: 'disabled',
      check: "access_mode IN ('disabled', 'ip_only', 'geo_only', 'ip_and_geo')",
    },
    
    // IP-based access control
    ip_allowlist: {
      type: 'inet[]',
    },
    ip_denylist: {
      type: 'inet[]',
    },
    ip_country_allowlist: {
      type: 'varchar(2)[]',
    },
    ip_country_denylist: {
      type: 'varchar(2)[]',
    },
    block_vpn_proxy: {
      type: 'boolean',
      default: false,
    },
    
    // GPS-based access control (PostGIS columns)
    geofence_type: {
      type: 'varchar(20)',
      check: "geofence_type IS NULL OR geofence_type IN ('polygon', 'radius')",
    },
    // GEOGRAPHY stores lat/lng in degrees, automatically uses SRID 4326
    geofence_polygon: {
      type: 'geography(POLYGON, 4326)',
    },
    geofence_center: {
      type: 'geography(POINT, 4326)',
    },
    geofence_radius_meters: {
      type: 'integer',
      check: 'geofence_radius_meters IS NULL OR geofence_radius_meters > 0',
    },
    
    // Metadata
    enabled: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create indexes
  pgm.createIndex('sites', 'hostname', { unique: true, where: 'hostname IS NOT NULL' });
  pgm.createIndex('sites', 'slug', { unique: true });
  pgm.createIndex('sites', 'enabled');
  
  // CRITICAL: GIST spatial index for geofence queries
  // Without this, ST_Within queries are 100x slower (100ms vs 1ms)
  pgm.sql(`
    CREATE INDEX idx_sites_geofence_polygon 
    ON sites 
    USING GIST(geofence_polygon)
    WHERE geofence_polygon IS NOT NULL;
  `);
  
  pgm.sql(`
    CREATE INDEX idx_sites_geofence_center 
    ON sites 
    USING GIST(geofence_center)
    WHERE geofence_center IS NOT NULL;
  `);

  // Add trigger to update updated_at on row change
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  pgm.sql(`
    CREATE TRIGGER update_sites_updated_at 
    BEFORE UPDATE ON sites 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('sites', { cascade: true });
  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;');
}
```

### Migration 002: Access Logs Table with Partitioning

**migrations/1709500001000_create-access-logs-table.ts:**
```typescript
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create partitioned table
  pgm.sql(`
    CREATE TABLE access_logs (
      id uuid DEFAULT uuid_generate_v4(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      timestamp timestamptz NOT NULL DEFAULT NOW(),
      
      -- Client info
      ip_address inet NOT NULL,
      user_agent text,
      url text,
      
      -- Decision
      allowed boolean NOT NULL,
      reason varchar(100),
      
      -- IP geolocation (MaxMind)
      ip_country varchar(2),
      ip_region varchar(100),
      ip_city varchar(100),
      ip_latitude numeric(10, 6),
      ip_longitude numeric(10, 6),
      
      -- GPS data
      gps_latitude numeric(10, 6),
      gps_longitude numeric(10, 6),
      gps_accuracy_meters numeric(10, 2),
      
      -- Artifact reference
      screenshot_url text,
      
      -- User reference (if authenticated)
      user_id uuid,
      
      PRIMARY KEY (id, timestamp)
    ) PARTITION BY RANGE (timestamp);
  `);

  // Create first partition (current month)
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextYear = nextMonth.getFullYear();
  const nextMonthStr = String(nextMonth.getMonth() + 1).padStart(2, '0');

  pgm.sql(`
    CREATE TABLE access_logs_${currentYear}_${currentMonth} PARTITION OF access_logs
    FOR VALUES FROM ('${currentYear}-${currentMonth}-01') TO ('${nextYear}-${nextMonthStr}-01');
  `);

  // Create indexes on partition
  pgm.sql(`
    CREATE INDEX idx_access_logs_${currentYear}_${currentMonth}_site_timestamp 
    ON access_logs_${currentYear}_${currentMonth}(site_id, timestamp DESC);
  `);

  pgm.sql(`
    CREATE INDEX idx_access_logs_${currentYear}_${currentMonth}_allowed 
    ON access_logs_${currentYear}_${currentMonth}(allowed);
  `);

  pgm.sql(`
    CREATE INDEX idx_access_logs_${currentYear}_${currentMonth}_ip 
    ON access_logs_${currentYear}_${currentMonth}(ip_address);
  `);

  // Function to auto-create next month's partition
  pgm.sql(`
    CREATE OR REPLACE FUNCTION create_next_partition()
    RETURNS void AS $$
    DECLARE
      next_month_start date;
      next_month_end date;
      partition_name text;
    BEGIN
      next_month_start := date_trunc('month', NOW() + interval '1 month');
      next_month_end := date_trunc('month', NOW() + interval '2 months');
      partition_name := 'access_logs_' || to_char(next_month_start, 'YYYY_MM');
      
      -- Check if partition already exists
      IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
      ) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF access_logs FOR VALUES FROM (%L) TO (%L)',
          partition_name,
          next_month_start,
          next_month_end
        );
        
        -- Create indexes on new partition
        EXECUTE format('CREATE INDEX %I ON %I(site_id, timestamp DESC)', 
          'idx_' || partition_name || '_site_timestamp', partition_name);
        EXECUTE format('CREATE INDEX %I ON %I(allowed)', 
          'idx_' || partition_name || '_allowed', partition_name);
        EXECUTE format('CREATE INDEX %I ON %I(ip_address)', 
          'idx_' || partition_name || '_ip', partition_name);
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('access_logs', { cascade: true });
  pgm.sql('DROP FUNCTION IF EXISTS create_next_partition CASCADE;');
}
```

### UUID vs Serial IDs

**Recommendation: Use UUIDs**

**Pros:**
- ✅ Globally unique (no collisions across databases/instances)
- ✅ Non-sequential (harder to guess, better for security)
- ✅ Distributed ID generation (no DB roundtrip needed)
- ✅ Easier database merging/replication

**Cons:**
- ❌ Larger storage (16 bytes vs 4 bytes for integer)
- ❌ Slightly slower indexing (marginal, <5% difference)

**Implementation:**
```typescript
// Using uuid-ossp extension
id: {
  type: 'uuid',
  default: pgm.func('uuid_generate_v4()'),
}

// Or generate in application (recommended for distributed systems)
import { randomUUID } from 'crypto';
const siteId = randomUUID();
```

### Spatial Indexes (GIST) Setup

**Why GIST is critical:**
```sql
-- WITHOUT GIST index (table scan)
EXPLAIN ANALYZE SELECT * FROM sites 
WHERE ST_Within(ST_MakePoint(-122.4194, 37.7749)::geography, geofence_polygon);
-- Planning Time: 0.1ms
-- Execution Time: 120.5ms (with 10,000 sites)

-- WITH GIST index
EXPLAIN ANALYZE SELECT * FROM sites 
WHERE ST_Within(ST_MakePoint(-122.4194, 37.7749)::geography, geofence_polygon);
-- Planning Time: 0.2ms
-- Execution Time: 0.8ms (with 10,000 sites)
-- Index Scan using idx_sites_geofence_polygon
```

**GIST index creation:**
```sql
CREATE INDEX idx_sites_geofence_polygon 
ON sites 
USING GIST(geofence_polygon)
WHERE geofence_polygon IS NOT NULL;
```

**Gotcha:** Always use `WHERE column IS NOT NULL` for partial indexes on nullable columns (saves storage and improves performance)

### Testing PostGIS Queries

**Insert test site:**
```sql
INSERT INTO sites (slug, name, access_mode, geofence_type, geofence_polygon)
VALUES (
  'test-site',
  'Test Site',
  'geo_only',
  'polygon',
  ST_GeogFromText('POLYGON((
    -122.5 37.7, 
    -122.5 37.8, 
    -122.4 37.8, 
    -122.4 37.7, 
    -122.5 37.7
  ))')
);
```

**Test point inside geofence:**
```sql
-- Point inside: -122.45, 37.75
SELECT 
  id, 
  name,
  ST_Within(
    ST_MakePoint(-122.45, 37.75)::geography,
    geofence_polygon
  ) AS is_inside
FROM sites 
WHERE slug = 'test-site';
-- Expected: is_inside = true
```

**Test point outside geofence:**
```sql
-- Point outside: -122.3, 37.75
SELECT 
  id, 
  name,
  ST_Within(
    ST_MakePoint(-122.3, 37.75)::geography,
    geofence_polygon
  ) AS is_inside
FROM sites 
WHERE slug = 'test-site';
-- Expected: is_inside = false
```

### References
- [PostGIS documentation](https://postgis.net/documentation/)
- [PostGIS ST_Within](https://postgis.net/docs/ST_Within.html)
- [node-pg-migrate documentation](https://salsita.github.io/node-pg-migrate/)
- [PostgreSQL GIST indexes](https://www.postgresql.org/docs/current/gist.html)

---

## 4. Fastify Backend Setup

### Project Structure

```
packages/backend/
├── package.json
├── tsconfig.json
├── .env
├── src/
│   ├── index.ts              # Entry point, starts server
│   ├── app.ts                # Fastify app setup, plugins
│   ├── config/
│   │   └── env.ts            # Environment variables with validation
│   ├── routes/
│   │   ├── index.ts          # Route registration
│   │   ├── health.ts         # Health check endpoint
│   │   └── sites.ts          # Site CRUD endpoints (Phase 1)
│   ├── services/
│   │   ├── db.ts             # Database connection pool
│   │   ├── SiteService.ts    # Site business logic
│   │   └── GeoIPService.ts   # MaxMind integration (Phase 1)
│   ├── middleware/
│   │   ├── siteResolution.ts # Resolve site by hostname (Phase 3)
│   │   └── errorHandler.ts   # Global error handler
│   ├── models/
│   │   └── Site.ts           # TypeScript types for Site
│   └── utils/
│       ├── logger.ts         # Pino logger setup
│       └── validation.ts     # Custom validation functions
├── migrations/               # Database migrations
└── tests/
    ├── unit/
    └── integration/
```

### TypeScript Configuration for Node.js 22

**packages/backend/tsconfig.json:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"],
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Essential Dependencies

**package.json:**
```json
{
  "name": "backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down",
    "test": "vitest",
    "test:watch": "vitest --watch"
  },
  "dependencies": {
    "fastify": "^4.26.0",
    "@fastify/jwt": "^8.0.0",
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "@fastify/postgres": "^5.2.2",
    "@fastify/env": "^4.3.0",
    "@fastify/rate-limit": "^9.1.0",
    "pg": "^8.11.3",
    "ioredis": "^5.3.2",
    "lru-cache": "^10.2.0",
    "maxmind": "^4.3.11",
    "bcrypt": "^5.1.1",
    "zod": "^3.22.4",
    "pino": "^8.19.0",
    "pino-pretty": "^10.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.16",
    "@types/pg": "^8.11.0",
    "@types/bcrypt": "^5.0.2",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.2",
    "node-pg-migrate": "^7.0.0"
  }
}
```

### Fastify App Setup

**src/app.ts:**
```typescript
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import postgres from '@fastify/postgres';
import env from '@fastify/env';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
    trustProxy: true, // CRITICAL: Required for X-Forwarded-For behind Nginx
  });

  // Register plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  await app.register(postgres, {
    connectionString: config.DATABASE_URL,
    ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: config.REDIS_URL, // Use Redis for multi-instance sync
  });

  // Register routes
  await registerRoutes(app);

  // Global error handler
  app.setErrorHandler(errorHandler);

  return app;
}
```

**src/index.ts:**
```typescript
import { buildApp } from './app.js';
import { config } from './config/env.js';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      port: config.PORT,
      host: '0.0.0.0', // Required for Docker
    });

    app.log.info(`Server listening on port ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, closing server...`);
      await app.close();
      process.exit(0);
    });
  });
}

start();
```

### Environment Variable Management

**src/config/env.ts:**
```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  
  // Database
  DATABASE_URL: z.string().url(),
  
  // Redis
  REDIS_URL: z.string().url(),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  
  // MaxMind
  MAXMIND_DB_PATH: z.string().default('/app/data/maxmind'),
  
  // S3/MinIO
  MINIO_ENDPOINT: z.string(),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string().default('screenshots'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // CORS
  CORS_ORIGIN: z.string().optional(),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
```

**.env (development):**
```bash
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://geo_admin:dev_password@localhost:5432/geo_webserver
REDIS_URL=redis://:dev_redis_pass@localhost:6379

JWT_SECRET=dev_jwt_secret_at_least_32_characters_long_change_in_production
JWT_EXPIRES_IN=15m

MAXMIND_DB_PATH=/app/data/maxmind

MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=screenshots

LOG_LEVEL=debug

CORS_ORIGIN=http://localhost:5173
```

### Logging Setup (Pino)

**Why Pino:**
- ✅ Fastest JSON logger for Node.js (~10x faster than Winston)
- ✅ Low overhead (minimal CPU and memory impact)
- ✅ Built-in support in Fastify
- ✅ Structured logging (JSON output for aggregation)

**Usage in code:**
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

export async function createSite(request: FastifyRequest, reply: FastifyReply) {
  request.log.info({ body: request.body }, 'Creating new site');
  
  try {
    const site = await SiteService.create(request.body);
    request.log.info({ siteId: site.id }, 'Site created successfully');
    return reply.code(201).send(site);
  } catch (error) {
    request.log.error({ error }, 'Failed to create site');
    throw error;
  }
}
```

**Log output (development with pino-pretty):**
```
[14:32:15.234] INFO: Creating new site
    body: { slug: "my-site", name: "My Site" }
[14:32:15.456] INFO: Site created successfully
    siteId: "a1b2c3d4-e5f6-7890-abcd-1234567890ab"
```

### Plugin Architecture

**Example: Site resolution middleware (Phase 3):**
```typescript
// src/middleware/siteResolution.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { SiteCache } from '../services/SiteCache.js';

const siteResolutionPlugin: FastifyPluginAsync = async (fastify) => {
  const siteCache = new SiteCache(fastify.redis);

  fastify.decorateRequest('site', null);

  fastify.addHook('onRequest', async (request, reply) => {
    const hostname = request.hostname;
    
    if (!hostname) {
      return reply.code(400).send({ error: 'Missing Host header' });
    }

    const site = await siteCache.get(hostname);
    
    if (!site) {
      return reply.code(404).send({ error: 'Site not found' });
    }

    request.site = site;
  });
};

export default fp(siteResolutionPlugin);
```

### References
- [Fastify documentation](https://fastify.dev/)
- [Fastify plugins](https://fastify.dev/docs/latest/Reference/Plugins/)
- [Pino logger](https://getpino.io/)
- [Zod validation](https://zod.dev/)

---

## 5. React Frontend Setup

### Vite Configuration

**packages/frontend/vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  
  server: {
    port: 5173,
    host: true, // Required for Docker
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'map-vendor': ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
});
```

### TypeScript Strict Mode Configuration

**packages/frontend/tsconfig.json:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    
    /* Paths */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Essential Libraries

**package.json:**
```json
{
  "name": "frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "lint": "eslint src --ext ts,tsx"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "@tanstack/react-query": "^5.20.0",
    "axios": "^1.6.7",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "leaflet-draw": "^1.0.4",
    "@turf/turf": "^6.5.0",
    "zod": "^3.22.4",
    "zustand": "^4.5.0",
    "date-fns": "^3.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.55",
    "@types/react-dom": "^18.2.19",
    "@types/leaflet": "^1.9.8",
    "@types/leaflet-draw": "^1.0.11",
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.1.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.2",
    "@testing-library/react": "^14.2.1",
    "@testing-library/jest-dom": "^6.4.2",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1"
  }
}
```

### Tailwind CSS Setup

**tailwind.config.js:**
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
}
```

**src/index.css:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Leaflet CSS (required) */
@import 'leaflet/dist/leaflet.css';
@import 'leaflet-draw/dist/leaflet.draw.css';

:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}
```

### React Query Setup

**src/lib/queryClient.ts:**
```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

**src/main.tsx:**
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './lib/queryClient';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

### API Client Setup (Axios)

**src/lib/api.ts:**
```typescript
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include cookies (refresh token)
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle 401 (token refresh)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Attempt token refresh
        const { data } = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true,
        });
        
        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
```

### Environment Variable Handling

**.env.development:**
```bash
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=Geo Webserver Admin
```

**.env.production:**
```bash
VITE_API_URL=https://api.example.com
VITE_APP_NAME=Geo Webserver Admin
```

**Usage in code:**
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
const appName = import.meta.env.VITE_APP_NAME;
```

**Type safety for env variables:**

**src/vite-env.d.ts:**
```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### Project Structure

```
packages/frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── .env.development
├── .env.production
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component, routes
│   ├── vite-env.d.ts         # Type definitions for Vite
│   ├── index.css             # Global styles, Tailwind imports
│   ├── pages/                # Route pages
│   │   ├── Dashboard.tsx
│   │   ├── SiteList.tsx
│   │   ├── SiteEditor.tsx
│   │   ├── AccessLogs.tsx
│   │   └── Login.tsx
│   ├── components/           # Reusable components
│   │   ├── ui/              # Base UI components (buttons, inputs)
│   │   ├── SiteForm.tsx
│   │   ├── GeofenceMap.tsx
│   │   └── LogsTable.tsx
│   ├── hooks/               # Custom React hooks
│   │   ├── useSites.ts
│   │   ├── useLogs.ts
│   │   └── useAuth.ts
│   ├── lib/                 # Libraries, utilities
│   │   ├── api.ts           # Axios instance
│   │   ├── queryClient.ts   # React Query client
│   │   └── utils.ts         # Helper functions
│   └── types/               # TypeScript types
│       ├── Site.ts
│       ├── AccessLog.ts
│       └── User.ts
└── tests/
    └── setup.ts
```

### References
- [Vite documentation](https://vitejs.dev/)
- [React documentation](https://react.dev/)
- [TanStack Query (React Query)](https://tanstack.com/query/latest)
- [Tailwind CSS](https://tailwindcss.com/)

---

## 6. MaxMind GeoIP2 Integration

### Download Location for Databases

**GeoLite2 (Free):**
1. Sign up for free MaxMind account: https://www.maxmind.com/en/geolite2/signup
2. Generate license key in account portal
3. Download databases:
   - **GeoLite2-City.mmdb** - City-level IP geolocation
   - **GeoLite2-Country.mmdb** - Country-level IP geolocation
   - **GeoLite2-ASN.mmdb** - ISP/ASN information

**GeoIP2 Anonymous IP (Paid, trial available):**
- **GeoIP2-Anonymous-IP.mmdb** - VPN/proxy/Tor detection
- Cost: ~$35/month or $350/year
- Free 7-day trial available

### License Key Setup

**Option 1: Manual download (development):**
```bash
# Create data directory
mkdir -p data/maxmind

# Download using curl (requires license key)
curl -u "999999:YOUR_LICENSE_KEY" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&suffix=tar.gz" \
  -o GeoLite2-City.tar.gz

# Extract
tar -xzf GeoLite2-City.tar.gz
mv GeoLite2-City_*/GeoLite2-City.mmdb data/maxmind/

# Repeat for other databases
```

**Option 2: geoipupdate tool (production, automated):**

**Install geoipupdate:**
```bash
# Ubuntu/Debian
sudo add-apt-repository ppa:maxmind/ppa
sudo apt update
sudo apt install geoipupdate

# macOS
brew install geoipupdate
```

**Configure geoipupdate:**

**/etc/GeoIP.conf:**
```ini
AccountID YOUR_ACCOUNT_ID
LicenseKey YOUR_LICENSE_KEY
EditionIDs GeoLite2-City GeoLite2-Country GeoLite2-ASN GeoIP2-Anonymous-IP
DatabaseDirectory /app/data/maxmind
```

**Run update:**
```bash
geoipupdate -v
```

**Automate with cron (weekly updates):**
```bash
# Add to crontab
0 2 * * 2 /usr/bin/geoipupdate -v
```

### Database Update Strategy

**Weekly automated updates (recommended):**
```bash
# Backend package.json script
{
  "scripts": {
    "maxmind:update": "geoipupdate -v"
  }
}
```

**Update frequency:**
- **GeoLite2:** Updated every Tuesday
- **GeoIP2:** Updated daily (paid version)

**Monitoring database age:**
```typescript
import fs from 'fs/promises';
import path from 'path';

async function checkDatabaseAge(dbPath: string): Promise<number> {
  const stats = await fs.stat(dbPath);
  const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
  
  if (ageInDays > 14) {
    console.warn(`MaxMind database is ${Math.floor(ageInDays)} days old. Consider updating.`);
  }
  
  return ageInDays;
}
```

### Node.js Library Integration (@maxmind/geoip2-node)

**Install:**
```bash
npm install @maxmind/geoip2-node
```

**Service implementation:**

**src/services/GeoIPService.ts:**
```typescript
import { Reader } from '@maxmind/geoip2-node';
import { LRUCache } from 'lru-cache';
import path from 'path';
import { config } from '../config/env.js';

interface GeoLocation {
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

interface AnonIPInfo {
  isVPN: boolean;
  isProxy: boolean;
  isHosting: boolean;
  isTor: boolean;
}

export class GeoIPService {
  private cityReader: Reader;
  private anonReader: Reader | null = null;
  private cache: LRUCache<string, GeoLocation | AnonIPInfo>;

  constructor() {
    // Load MMDB files on initialization
    const cityDbPath = path.join(config.MAXMIND_DB_PATH, 'GeoLite2-City.mmdb');
    const anonDbPath = path.join(config.MAXMIND_DB_PATH, 'GeoIP2-Anonymous-IP.mmdb');

    this.cityReader = Reader.open(cityDbPath);
    
    // Anonymous IP DB is optional (paid)
    try {
      this.anonReader = Reader.open(anonDbPath);
    } catch (error) {
      console.warn('GeoIP2-Anonymous-IP database not found. VPN detection disabled.');
    }

    // LRU cache: 10,000 entries, 5 minute TTL
    this.cache = new LRUCache({
      max: 10000,
      ttl: 5 * 60 * 1000,
      updateAgeOnGet: true,
    });
  }

  async lookupIP(ip: string): Promise<GeoLocation> {
    const cacheKey = `geo:${ip}`;
    const cached = this.cache.get(cacheKey) as GeoLocation | undefined;
    
    if (cached) {
      return cached;
    }

    try {
      const response = this.cityReader.city(ip);
      
      const location: GeoLocation = {
        country: response.country?.isoCode || null,
        region: response.subdivisions?.[0]?.name || null,
        city: response.city?.name || null,
        latitude: response.location?.latitude || null,
        longitude: response.location?.longitude || null,
        accuracy: response.location?.accuracyRadius || null,
      };

      this.cache.set(cacheKey, location);
      return location;
    } catch (error) {
      console.error(`Failed to lookup IP ${ip}:`, error);
      return {
        country: null,
        region: null,
        city: null,
        latitude: null,
        longitude: null,
        accuracy: null,
      };
    }
  }

  async checkAnonymousIP(ip: string): Promise<AnonIPInfo> {
    if (!this.anonReader) {
      return { isVPN: false, isProxy: false, isHosting: false, isTor: false };
    }

    const cacheKey = `anon:${ip}`;
    const cached = this.cache.get(cacheKey) as AnonIPInfo | undefined;
    
    if (cached) {
      return cached;
    }

    try {
      const response = this.anonReader.anonymousIP(ip);
      
      const info: AnonIPInfo = {
        isVPN: response.isVpn || false,
        isProxy: response.isPublicProxy || false,
        isHosting: response.isHostingProvider || false,
        isTor: response.isTorExitNode || false,
      };

      this.cache.set(cacheKey, info);
      return info;
    } catch (error) {
      console.error(`Failed to check anonymous IP ${ip}:`, error);
      return { isVPN: false, isProxy: false, isHosting: false, isTor: false };
    }
  }

  // Cleanup on server shutdown
  close(): void {
    this.cityReader.close();
    if (this.anonReader) {
      this.anonReader.close();
    }
  }
}

// Singleton instance
export const geoIPService = new GeoIPService();
```

### Caching Strategy

**Why LRU cache is critical:**
- MaxMind lookups are fast (<1ms) but still add up at scale
- Same IPs often make multiple requests (users browsing site)
- Cache hit rate typically 80-90% in production

**Cache configuration:**
```typescript
const cache = new LRUCache<string, GeoLocation>({
  max: 10000,           // Max 10k entries (~1MB memory)
  ttl: 5 * 60 * 1000,   // 5 minute TTL (balance freshness vs hit rate)
  updateAgeOnGet: true, // Reset TTL on cache hit (keep popular IPs cached)
});
```

**Performance comparison:**
```
Without cache:
- 1000 requests with 100 unique IPs → 1000 MMDB lookups (1ms each) = 1000ms total

With cache (90% hit rate):
- 1000 requests with 100 unique IPs → 100 MMDB lookups (1ms) + 900 cache hits (0.01ms) = 109ms total
- 9x faster
```

### Testing Integration

**Test script:**
```typescript
// tests/integration/geoip.test.ts
import { describe, it, expect } from 'vitest';
import { geoIPService } from '../../src/services/GeoIPService.js';

describe('GeoIPService', () => {
  it('should lookup IP geolocation', async () => {
    const result = await geoIPService.lookupIP('8.8.8.8'); // Google DNS
    
    expect(result.country).toBe('US');
    expect(result.latitude).toBeCloseTo(37.7, 0);
    expect(result.longitude).toBeCloseTo(-122.4, 0);
  });

  it('should detect VPN (example: NordVPN IP)', async () => {
    const result = await geoIPService.checkAnonymousIP('185.92.223.1');
    
    expect(result.isVPN).toBe(true);
  });

  it('should cache repeated lookups', async () => {
    const ip = '1.1.1.1';
    
    const start1 = performance.now();
    await geoIPService.lookupIP(ip);
    const duration1 = performance.now() - start1;
    
    const start2 = performance.now();
    await geoIPService.lookupIP(ip); // Should hit cache
    const duration2 = performance.now() - start2;
    
    expect(duration2).toBeLessThan(duration1 / 10); // Cache should be 10x+ faster
  });
});
```

### .gitignore Configuration

**IMPORTANT: Do not commit MMDB files to Git**

**.gitignore:**
```
# MaxMind databases (large binary files, license-restricted)
data/maxmind/*.mmdb
*.mmdb

# But keep directory structure
!data/maxmind/.gitkeep
```

**data/maxmind/.gitkeep:**
```
# This file ensures the directory exists in Git
```

**README.md instructions:**
```markdown
## MaxMind Setup

1. Sign up for free account: https://www.maxmind.com/en/geolite2/signup
2. Generate license key
3. Download databases to `data/maxmind/`:
   - GeoLite2-City.mmdb
   - GeoLite2-Country.mmdb
   - GeoIP2-Anonymous-IP.mmdb (optional, paid)
4. Update license key in `.env`:
   ```
   MAXMIND_LICENSE_KEY=your_key_here
   ```
```

### References
- [MaxMind GeoIP2 documentation](https://dev.maxmind.com/geoip/docs)
- [@maxmind/geoip2-node npm package](https://www.npmjs.com/package/@maxmind/geoip2-node)
- [geoipupdate tool](https://github.com/maxmind/geoipupdate)

---

## 7. CI/CD Pipeline

### GitHub Actions Workflow Structure

**Recommended workflow stages:**
1. **Lint:** ESLint + Prettier checks
2. **Type Check:** TypeScript compilation
3. **Test:** Unit + Integration tests
4. **Build:** Docker images
5. **Push:** Docker registry
6. **Deploy:** (Optional) Deploy to staging/production

**.github/workflows/ci.yml:**
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  lint:
    name: Lint & Format Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint
        run: npm run lint
      
      - name: Check formatting
        run: npm run format -- --check

  typecheck:
    name: TypeScript Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check backend
        run: npm run typecheck --workspace=backend
      
      - name: Type check frontend
        run: npm run typecheck --workspace=frontend
      
      - name: Type check workers
        run: npm run typecheck --workspace=workers

  test:
    name: Test
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: geo_webserver_test
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run migrations
        run: npm run migrate --workspace=backend
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/geo_webserver_test
      
      - name: Run backend tests
        run: npm run test --workspace=backend
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/geo_webserver_test
          REDIS_URL: redis://localhost:6379
      
      - name: Run frontend tests
        run: npm run test --workspace=frontend
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()
        with:
          files: ./packages/backend/coverage/coverage-final.json,./packages/frontend/coverage/coverage-final.json

  build:
    name: Build Docker Images
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    permissions:
      contents: read
      packages: write
    
    strategy:
      matrix:
        service: [backend, frontend, workers]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-${{ matrix.service }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix={{branch}}-
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./infrastructure/docker/${{ matrix.service }}.Dockerfile
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [build]
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    environment:
      name: staging
      url: https://staging.example.com
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to staging server
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/geo-webserver
            docker compose pull
            docker compose up -d
            docker compose exec -T backend npm run migrate
```

### Testing Strategy

**Unit Tests:**
- **Backend:** Service layer logic, utility functions
- **Frontend:** Component logic, custom hooks
- **Coverage target:** >80%

**Integration Tests:**
- **Backend:** API endpoints, database operations, middleware pipeline
- **Frontend:** Component interactions, API integration

**E2E Tests (Future - Phase 5):**
- **Tool:** Playwright
- **Scenarios:** Full user flows (create site → configure → view logs)

**Example test structure:**

**packages/backend/tests/unit/utils/anonymizeIP.test.ts:**
```typescript
import { describe, it, expect } from 'vitest';
import { anonymizeIP } from '../../../src/utils/anonymizeIP.js';

describe('anonymizeIP', () => {
  it('should anonymize IPv4 address', () => {
    expect(anonymizeIP('192.168.1.100')).toBe('192.168.1.0');
  });

  it('should anonymize IPv6 address', () => {
    expect(anonymizeIP('2001:0db8:85a3::8a2e:0370:7334')).toBe('2001:db8:85a3::');
  });

  it('should handle localhost IPv4', () => {
    expect(anonymizeIP('127.0.0.1')).toBe('127.0.0.0');
  });
});
```

**packages/backend/tests/integration/routes/sites.test.ts:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { FastifyInstance } from 'fastify';

describe('POST /api/sites', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a new site', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sites',
      payload: {
        slug: 'test-site',
        name: 'Test Site',
        hostname: 'test.example.com',
        access_mode: 'disabled',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      slug: 'test-site',
      name: 'Test Site',
      hostname: 'test.example.com',
    });
  });

  it('should reject duplicate slug', async () => {
    // Create first site
    await app.inject({
      method: 'POST',
      url: '/api/sites',
      payload: {
        slug: 'duplicate',
        name: 'First Site',
      },
    });

    // Attempt to create second site with same slug
    const response = await app.inject({
      method: 'POST',
      url: '/api/sites',
      payload: {
        slug: 'duplicate',
        name: 'Second Site',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain('already exists');
  });
});
```

### Linting and Type Checking

**.eslintrc.js:**
```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./packages/*/tsconfig.json'],
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
  },
};
```

**.prettierrc:**
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

### Docker Build and Push

**Backend Dockerfile:**

**infrastructure/docker/backend.Dockerfile:**
```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy backend package files
COPY packages/backend/package*.json ./packages/backend/
COPY packages/backend/tsconfig.json ./packages/backend/

# Install dependencies
RUN npm ci --workspace=backend

# Copy source code
COPY packages/backend ./packages/backend

# Build
RUN npm run build --workspace=backend

# Production image
FROM node:22-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
RUN npm ci --workspace=backend --omit=dev

# Copy built files
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY packages/backend/migrations ./packages/backend/migrations

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run
CMD ["node", "packages/backend/dist/index.js"]
```

### Deployment Considerations

**Environment-specific configs:**

**.env.staging:**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@staging-db:5432/geo_webserver
REDIS_URL=redis://:pass@staging-redis:6379
JWT_SECRET=staging_secret_32_characters_min
CORS_ORIGIN=https://staging.example.com
```

**.env.production:**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/geo_webserver
REDIS_URL=redis://:pass@prod-redis:6379
JWT_SECRET=production_secret_from_secrets_manager
CORS_ORIGIN=https://app.example.com
```

**Secrets management:**
- Use GitHub Secrets for sensitive values (SSH keys, API keys)
- Use environment-specific secrets (staging vs production)
- Never commit secrets to Git

### References
- [GitHub Actions documentation](https://docs.github.com/en/actions)
- [Docker build-push-action](https://github.com/docker/build-push-action)
- [Vitest documentation](https://vitest.dev/)

---

## 8. Setup Order & Dependencies

### Recommended Setup Sequence

**Week 1: Days 1-3 - Project Foundation**

1. **Initialize Git repository**
   ```bash
   git init
   git remote add origin <repository-url>
   ```

2. **Create monorepo structure**
   ```bash
   mkdir -p packages/{backend,frontend,workers}
   mkdir -p infrastructure/{docker,postgres}
   mkdir -p data/maxmind
   mkdir -p .planning/phases/0
   ```

3. **Setup root package.json with workspaces**
   - Copy root package.json from Section 1
   - Run `npm install`

4. **Initialize packages**
   ```bash
   cd packages/backend && npm init -y
   cd ../frontend && npm init -y
   cd ../workers && npm init -y
   ```

5. **Install dependencies for each package**
   - Backend: Fastify, pg, maxmind, etc.
   - Frontend: React, Vite, TanStack Query, etc.
   - Workers: BullMQ, Playwright

6. **Setup shared TypeScript configs**
   - tsconfig.base.json (root)
   - tsconfig.json (per package, extends base)

7. **Configure ESLint and Prettier**
   - .eslintrc.js (root)
   - .prettierrc (root)

**Week 1: Days 4-5 - Docker Compose Stack**

8. **Create Docker Compose file**
   - Copy docker-compose.yml from Section 2
   - Create .env file with development credentials

9. **Create PostgreSQL init script**
   - infrastructure/postgres/init.sql
   - Enable PostGIS extension

10. **Create Dockerfiles**
    - infrastructure/docker/backend.Dockerfile
    - infrastructure/docker/frontend.Dockerfile
    - infrastructure/docker/worker.Dockerfile

11. **Start Docker Compose stack**
    ```bash
    docker compose up -d
    docker compose logs -f
    ```

12. **Verify services health**
    ```bash
    docker compose ps  # All services should show "healthy"
    ```

**Week 2: Days 1-2 - Database Schema**

13. **Setup migration tooling**
    - Install node-pg-migrate in backend package
    - Configure .node-pg-migrate.json
    - Add npm scripts (migrate, migrate:create, etc.)

14. **Create migration 001: sites table**
    - Run `npm run migrate:create -- create-sites-table`
    - Implement up/down migrations
    - Include PostGIS columns and GIST indexes

15. **Run migration**
    ```bash
    npm run migrate --workspace=backend
    ```

16. **Create migration 002: access_logs table**
    - Create partitioned table
    - Create first partition (current month)
    - Add partition creation function

17. **Test PostGIS queries**
    - Connect to database: `docker compose exec postgres psql -U geo_admin -d geo_webserver`
    - Run test queries from Section 3

**Week 2: Days 3-4 - Backend & Frontend Basics**

18. **Setup backend app**
    - src/app.ts (Fastify app setup)
    - src/index.ts (server entry point)
    - src/config/env.ts (environment variables with Zod validation)

19. **Create health check endpoint**
    - src/routes/health.ts
    - Test: `curl http://localhost:3000/health`

20. **Setup frontend app**
    - src/main.tsx (React entry point)
    - src/App.tsx (root component)
    - Configure Vite proxy to backend

21. **Test full stack**
    - Start backend: `npm run dev --workspace=backend`
    - Start frontend: `npm run dev --workspace=frontend`
    - Open http://localhost:5173
    - Verify frontend can call backend API

**Week 2: Day 5 - MaxMind & CI/CD**

22. **Download MaxMind databases**
    - Sign up for free account
    - Download GeoLite2-City.mmdb to data/maxmind/
    - Download GeoLite2-Country.mmdb

23. **Implement GeoIPService**
    - src/services/GeoIPService.ts
    - Test with known IPs (8.8.8.8, 1.1.1.1)

24. **Setup GitHub Actions**
    - .github/workflows/ci.yml
    - Configure lint, typecheck, test, build stages
    - Push to GitHub and verify workflow runs

25. **Add .gitignore**
    ```
    node_modules/
    dist/
    .env
    *.mmdb
    coverage/
    ```

### Dependency Graph

```
Project Setup
├── Week 1
│   ├── Days 1-3: Foundation
│   │   ├── Git repo
│   │   ├── Monorepo structure
│   │   ├── Root package.json (workspaces)
│   │   ├── Package initialization (backend, frontend, workers)
│   │   ├── Dependency installation
│   │   └── TypeScript/ESLint config
│   │
│   └── Days 4-5: Docker
│       ├── docker-compose.yml
│       ├── .env file
│       ├── PostgreSQL init script
│       ├── Dockerfiles
│       └── Start services (postgres, redis, minio)
│
└── Week 2
    ├── Days 1-2: Database
    │   ├── Migration tooling setup
    │   ├── Migration 001 (sites table) → DEPENDS ON: PostgreSQL running
    │   ├── Migration 002 (access_logs) → DEPENDS ON: Migration 001
    │   └── PostGIS test queries → DEPENDS ON: Migrations complete
    │
    ├── Days 3-4: Backend + Frontend
    │   ├── Backend app setup → DEPENDS ON: Database ready
    │   ├── Health check endpoint → DEPENDS ON: Backend app
    │   ├── Frontend app setup → INDEPENDENT
    │   └── Full stack test → DEPENDS ON: Backend + Frontend running
    │
    └── Day 5: MaxMind + CI/CD
        ├── MaxMind download → INDEPENDENT
        ├── GeoIPService → DEPENDS ON: MaxMind databases
        ├── GitHub Actions → DEPENDS ON: Code in repo
        └── .gitignore → INDEPENDENT
```

### Critical Path

**Must complete in order:**
1. Docker Compose stack → Database migrations → Backend app → Frontend integration
2. Parallel work possible: Frontend UI (independent), MaxMind setup (independent)

### Common Gotchas

1. **PostgreSQL not ready when migrations run**
   - Solution: Use `depends_on` with health checks in docker-compose.yml
   - Verify with: `docker compose ps` (status should be "healthy")

2. **TypeScript path aliases not resolving**
   - Solution: Ensure tsconfig.json `paths` match package structure
   - Use `tsx` for development (handles path resolution automatically)

3. **MMDB files not found**
   - Solution: Check volume mount in docker-compose.yml
   - Verify path: `docker compose exec backend ls /app/data/maxmind`

4. **CORS errors in frontend**
   - Solution: Configure @fastify/cors with correct origin
   - Set `CORS_ORIGIN=http://localhost:5173` in backend .env

5. **PostGIS extension not enabled**
   - Solution: Verify init.sql runs on first startup
   - Manual fix: `docker compose exec postgres psql -U geo_admin -d geo_webserver -c "CREATE EXTENSION postgis;"`

6. **Docker volumes persisting old data**
   - Solution: `docker compose down -v` (WARNING: deletes all data)
   - Safer: Delete specific volume: `docker volume rm geo-ip-webserver_postgres_data`

### Verification Checklist

After completing setup, verify:

- [ ] All Docker services running and healthy (`docker compose ps`)
- [ ] Database migrations applied successfully (`SELECT * FROM pgmigrations;`)
- [ ] PostGIS installed (`SELECT PostGIS_version();`)
- [ ] Backend health check returns 200 (`curl http://localhost:3000/health`)
- [ ] Frontend loads and displays (`http://localhost:5173`)
- [ ] Frontend can call backend API (check browser network tab)
- [ ] MaxMind databases loaded (check backend logs on startup)
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] Tests pass (`npm run test`)
- [ ] Linting passes (`npm run lint`)
- [ ] GitHub Actions workflow runs successfully (push to GitHub)

### Next Steps (Phase 1)

Once Phase 0 setup is complete:

1. **DEV-001 to DEV-009 tasks marked complete** ✅
2. **Begin Phase 1 (MVP - IP Access Control)**
   - MVP-001: Create Site model and service layer
   - MVP-002: Implement Site CRUD API routes
   - MVP-003: Add Fastify schema validation
   - ... (see ROADMAP.md Phase 1 tasks)

---

## References & Resources

### Official Documentation
- [Fastify](https://fastify.dev/)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [PostGIS](https://postgis.net/documentation/)
- [MaxMind GeoIP2](https://dev.maxmind.com/geoip/docs)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Docker Compose](https://docs.docker.com/compose/)
- [GitHub Actions](https://docs.github.com/en/actions)

### npm Packages
- [@fastify/jwt](https://github.com/fastify/fastify-jwt)
- [@fastify/cors](https://github.com/fastify/fastify-cors)
- [@fastify/helmet](https://github.com/fastify/fastify-helmet)
- [@fastify/postgres](https://github.com/fastify/fastify-postgres)
- [@tanstack/react-query](https://tanstack.com/query/latest)
- [node-pg-migrate](https://salsita.github.io/node-pg-migrate/)
- [lru-cache](https://github.com/isaacs/node-lru-cache)
- [@maxmind/geoip2-node](https://github.com/maxmind/GeoIP2-node)

### Planning Documents
- [ROADMAP.md](../../ROADMAP.md) - Phase 0 tasks and success criteria
- [REQUIREMENTS.md](../../REQUIREMENTS.md) - Requirement specifications
- [SUMMARY.md](../research/SUMMARY.md) - Technology stack decisions

---

**Research Complete:** 2026-02-14  
**Phase Duration Estimate:** 1-2 weeks  
**Ready to Begin Implementation:** ✅ YES
