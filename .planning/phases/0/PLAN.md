# Phase 0: Foundation & Architecture Setup - Implementation Plan

**Duration**: 1-2 weeks  
**Risk Level**: LOW  
**Dependencies**: None

This plan provides production-ready, copy-paste instructions for setting up the complete development environment and project architecture for the geo-fenced multi-site webserver.

---

## Task DEV-001: Initialize Git Repository with Monorepo Structure

### Objective
Create a git repository with npm workspace-based monorepo structure supporting backend, frontend, and worker packages.

### Prerequisites
- Node.js 22+ installed
- Git installed
- Terminal access

### Steps

#### 1. Initialize git repository
```bash
git init
git branch -M main
```

#### 2. Create root package.json
Create `package.json` in the project root:

```json
{
  "name": "geo-ip-webserver",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/backend",
    "packages/frontend",
    "packages/workers"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev -w packages/backend\" \"npm run dev -w packages/frontend\"",
    "build": "npm run build -w packages/backend && npm run build -w packages/frontend",
    "test": "npm run test --workspaces",
    "lint": "npm run lint --workspaces",
    "clean": "npm run clean --workspaces && rm -rf node_modules"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  },
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=10.0.0"
  }
}
```

#### 3. Create directory structure
```bash
mkdir -p packages/backend
mkdir -p packages/frontend
mkdir -p packages/workers
mkdir -p infrastructure/docker
mkdir -p .planning/phases/{0,1,2,3,4,5}
mkdir -p docs
```

#### 4. Create root .gitignore
Create `.gitignore` in the project root:

```gitignore
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Environment variables
.env
.env.local
.env.*.local
*.env

# Build outputs
dist/
build/
*.tsbuildinfo

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store

# Testing
coverage/
.nyc_output/

# Docker
*.log
docker-compose.override.yml

# Database
*.db
*.sqlite
pgdata/

# GeoIP databases (download separately)
GeoLite2-City.mmdb
GeoLite2-Country.mmdb

# OS
Thumbs.db
```

#### 5. Create initial README
Create `README.md` in the project root:

```markdown
# Geo-IP Webserver

Multi-site content delivery platform with geo-fencing, IP geolocation, and site-specific routing.

## Quick Start

### Prerequisites
- Node.js 22+
- Docker & Docker Compose
- Git

### Development Setup

1. Clone the repository
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Start infrastructure:
   \`\`\`bash
   docker-compose up -d
   \`\`\`

4. Run migrations:
   \`\`\`bash
   npm run migrate:up -w packages/backend
   \`\`\`

5. Start development servers:
   \`\`\`bash
   npm run dev
   \`\`\`

## Project Structure

- `packages/backend` - Fastify API server
- `packages/frontend` - React + Vite admin dashboard
- `packages/workers` - Background workers
- `infrastructure/` - Docker and deployment configs
- `.planning/` - Project planning and documentation

## Documentation

See [docs/](./docs/) for detailed documentation.

## License

Proprietary
```

#### 6. Install root dependencies
```bash
npm install
```

#### 7. Create initial commit
```bash
git add .
git commit -m "chore: initialize monorepo structure"
```

### Verification
```bash
# Verify workspace structure
npm ls --workspaces

# Verify git repository
git log --oneline
git status
```

### Time Estimate
30 minutes

### Success Criteria
- ✅ Git repository initialized with main branch
- ✅ Root package.json with workspaces configured
- ✅ Directory structure created
- ✅ .gitignore configured
- ✅ Initial commit created
- ✅ `npm ls --workspaces` shows 3 workspaces (will be empty until next tasks)

---

## Task DEV-002: Create Docker Compose Stack

### Objective
Setup Docker Compose stack with PostgreSQL (PostGIS), Redis, and MinIO for local development.

### Prerequisites
- DEV-001 completed
- Docker and Docker Compose installed

### Steps

#### 1. Create docker-compose.yml
Create `infrastructure/docker/docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgis/postgis:16-3.4
    container_name: geo-ip-postgres
    environment:
      POSTGRES_DB: geo_ip_webserver
      POSTGRES_USER: dev_user
      POSTGRES_PASSWORD: dev_password
      POSTGRES_INITDB_ARGS: "-E UTF8 --locale=en_US.UTF-8"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev_user -d geo_ip_webserver"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - geo-ip-network

  redis:
    image: redis:7-alpine
    container_name: geo-ip-redis
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - geo-ip-network

  minio:
    image: minio/minio:latest
    container_name: geo-ip-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
    networks:
      - geo-ip-network

  # MinIO bucket initialization
  createbuckets:
    image: minio/mc:latest
    container_name: geo-ip-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      /usr/bin/mc alias set myminio http://minio:9000 minioadmin minioadmin123;
      /usr/bin/mc mb myminio/site-assets --ignore-existing;
      /usr/bin/mc anonymous set download myminio/site-assets;
      exit 0;
      "
    networks:
      - geo-ip-network

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  minio_data:
    driver: local

networks:
  geo-ip-network:
    driver: bridge
```

#### 2. Create PostgreSQL init script
Create `infrastructure/docker/init-scripts/01-init-extensions.sql`:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Verify extensions
SELECT 
    extname AS "Extension",
    extversion AS "Version"
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'postgis')
ORDER BY extname;

-- Set timezone
ALTER DATABASE geo_ip_webserver SET timezone TO 'UTC';
```

#### 3. Create environment template
Create `infrastructure/docker/.env.example`:

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=geo_ip_webserver
POSTGRES_USER=dev_user
POSTGRES_PASSWORD=dev_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_BUCKET=site-assets

# Application
NODE_ENV=development
LOG_LEVEL=debug
```

#### 4. Create symlink for docker-compose in root
```bash
# Windows (run as Administrator or with developer mode enabled)
mklink docker-compose.yml infrastructure\docker\docker-compose.yml

# Or just copy the file
copy infrastructure\docker\docker-compose.yml docker-compose.yml
```

#### 5. Start the stack
```bash
cd infrastructure/docker
docker-compose up -d
```

#### 6. Create documentation
Create `infrastructure/docker/README.md`:

```markdown
# Docker Infrastructure

## Services

### PostgreSQL (PostGIS)
- **Image**: postgis/postgis:16-3.4
- **Port**: 5432
- **Database**: geo_ip_webserver
- **Extensions**: PostGIS, uuid-ossp

### Redis
- **Image**: redis:7-alpine
- **Port**: 6379
- **Max Memory**: 256MB (LRU eviction)

### MinIO
- **Image**: minio/minio:latest
- **API Port**: 9000
- **Console Port**: 9001
- **Console URL**: http://localhost:9001
- **Credentials**: minioadmin / minioadmin123

## Usage

### Start all services
\`\`\`bash
docker-compose up -d
\`\`\`

### View logs
\`\`\`bash
docker-compose logs -f [service_name]
\`\`\`

### Stop all services
\`\`\`bash
docker-compose down
\`\`\`

### Reset all data
\`\`\`bash
docker-compose down -v
\`\`\`

### Connect to PostgreSQL
\`\`\`bash
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver
\`\`\`

### Connect to Redis
\`\`\`bash
docker exec -it geo-ip-redis redis-cli
\`\`\`

## Health Checks

All services include health checks. Check status:
\`\`\`bash
docker-compose ps
\`\`\`
```

### Verification
```bash
# Check all containers are running
docker-compose ps

# Verify PostgreSQL with PostGIS
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver -c "SELECT PostGIS_Version();"

# Verify Redis
docker exec -it geo-ip-redis redis-cli ping

# Verify MinIO (should return XML)
curl http://localhost:9000

# Check MinIO console
# Open http://localhost:9001 in browser
```

### Time Estimate
45 minutes

### Success Criteria
- ✅ All 4 containers running (postgres, redis, minio, createbuckets exits 0)
- ✅ PostgreSQL PostGIS extension enabled
- ✅ Redis responds to PING
- ✅ MinIO console accessible at http://localhost:9001
- ✅ MinIO bucket 'site-assets' created
- ✅ All healthchecks passing

---

## Task DEV-003: Setup Backend Project (Fastify)

### Objective
Create Fastify backend service with TypeScript, environment validation, logging, and database connectivity.

### Prerequisites
- DEV-001 completed
- DEV-002 completed (Docker stack running)

### Steps

#### 1. Create backend package.json
Create `packages/backend/package.json`:

```json
{
  "name": "@geo-ip-webserver/backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file=.env src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src --ext .ts",
    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down",
    "migrate:create": "node-pg-migrate create"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@fastify/env": "^4.3.0",
    "@fastify/postgres": "^5.2.2",
    "@fastify/redis": "^6.1.1",
    "@fastify/static": "^7.0.0",
    "@sinclair/typebox": "^0.32.15",
    "fastify": "^4.26.0",
    "maxmind": "^4.3.11",
    "node-pg-migrate": "^7.0.2",
    "pg": "^8.11.3",
    "pino": "^8.19.0",
    "pino-pretty": "^10.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.19",
    "@types/pg": "^8.11.0",
    "@typescript-eslint/eslint-plugin": "^7.0.1",
    "@typescript-eslint/parser": "^7.0.1",
    "eslint": "^8.56.0",
    "tsx": "^4.7.1",
    "typescript": "^5.3.3",
    "vitest": "^1.2.2"
  }
}
```

#### 2. Create TypeScript configuration
Create `packages/backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "rootDir": "./src",
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 3. Create ESLint configuration
Create `packages/backend/.eslintrc.json`:

```json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "error"
  },
  "env": {
    "node": true,
    "es2022": true
  }
}
```

#### 4. Create environment configuration
Create `packages/backend/.env.example`:

```env
# Server
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://dev_user:dev_password@localhost:5432/geo_ip_webserver

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# GeoIP
GEOIP_CITY_DB_PATH=./data/GeoLite2-City.mmdb
GEOIP_COUNTRY_DB_PATH=./data/GeoLite2-Country.mmdb

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=site-assets
```

#### 5. Create application entry point
Create `packages/backend/src/index.ts`:

```typescript
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyEnv from '@fastify/env';
import fastifyPostgres from '@fastify/postgres';
import fastifyRedis from '@fastify/redis';
import fastifyCors from '@fastify/cors';

const envSchema = {
  type: 'object',
  required: ['DATABASE_URL', 'REDIS_HOST'],
  properties: {
    NODE_ENV: {
      type: 'string',
      default: 'development'
    },
    HOST: {
      type: 'string',
      default: '0.0.0.0'
    },
    PORT: {
      type: 'integer',
      default: 3000
    },
    LOG_LEVEL: {
      type: 'string',
      default: 'info'
    },
    DATABASE_URL: {
      type: 'string'
    },
    REDIS_HOST: {
      type: 'string'
    },
    REDIS_PORT: {
      type: 'integer',
      default: 6379
    }
  }
};

async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' 
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined
    }
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Register environment validation
  await server.register(fastifyEnv, {
    schema: envSchema,
    dotenv: true
  });

  // Register CORS
  await server.register(fastifyCors, {
    origin: true,
    credentials: true
  });

  // Register PostgreSQL
  await server.register(fastifyPostgres, {
    connectionString: server.config.DATABASE_URL
  });

  // Register Redis
  await server.register(fastifyRedis, {
    host: server.config.REDIS_HOST,
    port: server.config.REDIS_PORT,
    closeClient: true
  });

  // Health check route
  server.get('/health', async () => {
    const dbCheck = await server.pg.query('SELECT 1 as ok');
    const redisCheck = await server.redis.ping();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbCheck.rows[0].ok === 1 ? 'connected' : 'disconnected',
      redis: redisCheck === 'PONG' ? 'connected' : 'disconnected'
    };
  });

  // Root route
  server.get('/', async () => {
    return { 
      name: 'Geo-IP Webserver API',
      version: '1.0.0',
      environment: server.config.NODE_ENV
    };
  });

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    
    const address = await server.listen({
      port: server.config.PORT,
      host: server.config.HOST
    });
    
    server.log.info(`Server listening on ${address}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
```

#### 6. Create package-specific .gitignore
Create `packages/backend/.gitignore`:

```gitignore
# Build output
dist/

# Environment
.env

# GeoIP databases
data/
*.mmdb

# Coverage
coverage/
```

#### 7. Install backend dependencies
```bash
npm install -w packages/backend
```

### Verification
```bash
# Start backend in dev mode
npm run dev -w packages/backend

# In another terminal, test endpoints:
curl http://localhost:3000/
curl http://localhost:3000/health

# Verify database connection (should show "connected")
# Verify Redis connection (should show "connected")
```

### Time Estimate
1 hour

### Success Criteria
- ✅ Backend package.json created with all dependencies
- ✅ TypeScript configuration complete
- ✅ Server starts without errors
- ✅ Health endpoint returns 200 with database and Redis status
- ✅ Environment validation working
- ✅ Structured logging configured

---

## Task DEV-004: Setup Frontend Project (React + Vite)

### Objective
Create React frontend with Vite, TypeScript, TailwindCSS, and React Router for the admin dashboard.

### Prerequisites
- DEV-001 completed

### Steps

#### 1. Create frontend using Vite
```bash
cd packages
npm create vite@latest frontend -- --template react-ts
cd ..
```

#### 2. Update frontend package.json
Edit `packages/frontend/package.json` to add name scope and additional dependencies:

```json
{
  "name": "@geo-ip-webserver/frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "@tanstack/react-query": "^5.20.0",
    "axios": "^1.6.7"
  },
  "devDependencies": {
    "@types/react": "^18.2.56",
    "@types/react-dom": "^18.2.19",
    "@typescript-eslint/eslint-plugin": "^6.21.0",
    "@typescript-eslint/parser": "^6.21.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.2.2",
    "vite": "^5.1.0",
    "vitest": "^1.2.2"
  }
}
```

#### 3. Install frontend dependencies
```bash
npm install -w packages/frontend
```

#### 4. Setup TailwindCSS
```bash
cd packages/frontend
npx tailwindcss init -p
cd ../..
```

#### 5. Configure Tailwind
Edit `packages/frontend/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

#### 6. Update index.css with Tailwind directives
Edit `packages/frontend/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

#### 7. Create basic App component
Edit `packages/frontend/src/App.tsx`:

```typescript
import { useState } from 'react';

function App() {
  const [status, setStatus] = useState<string>('');

  const checkHealth = async () => {
    try {
      const response = await fetch('http://localhost:3000/health');
      const data = await response.json();
      setStatus(JSON.stringify(data, null, 2));
    } catch (error) {
      setStatus(`Error: ${error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">Geo-IP Webserver Admin</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
          <h2 className="text-2xl font-semibold mb-4">Backend Status</h2>
          
          <button
            onClick={checkHealth}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Check Backend Health
          </button>
          
          {status && (
            <pre className="mt-4 bg-gray-900 p-4 rounded overflow-x-auto">
              {status}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
```

#### 8. Create environment configuration
Create `packages/frontend/.env.example`:

```env
VITE_API_URL=http://localhost:3000
```

Create `packages/frontend/.env`:

```env
VITE_API_URL=http://localhost:3000
```

#### 9. Update Vite config for proxy
Edit `packages/frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
```

#### 10. Create package-specific .gitignore
Create `packages/frontend/.gitignore`:

```gitignore
# Build output
dist/

# Environment
.env.local
.env.*.local

# Logs
*.log
```

### Verification
```bash
# Start frontend in dev mode (backend should already be running)
npm run dev -w packages/frontend

# Open browser to http://localhost:5173
# Click "Check Backend Health" button
# Should display JSON response from backend with database and Redis status
```

### Time Estimate
45 minutes

### Success Criteria
- ✅ Frontend package created with Vite + React + TypeScript
- ✅ TailwindCSS configured and working
- ✅ Development server runs on port 5173
- ✅ Can connect to backend via proxy
- ✅ Health check button successfully fetches backend status
- ✅ No TypeScript errors

---

## Task DEV-005: Create Sites Table with PostGIS Columns

### Objective
Create database schema for sites table with PostGIS support for geofencing, IP/country lists, and access control.

### Prerequisites
- DEV-002 completed (PostgreSQL running)
- DEV-003 completed (backend setup)

### Steps

#### 1. Configure node-pg-migrate
Create `packages/backend/.migrations.json`:

```json
{
  "schema": "public",
  "directory": "migrations",
  "migrations-table": "pgmigrations",
  "database-url-var": "DATABASE_URL",
  "migration-file-language": "sql",
  "ignore-pattern": "\\..*",
  "create-schema": false,
  "create-migration-schema": false,
  "check-order": true
}
```

#### 2. Create migrations directory
```bash
mkdir packages/backend/migrations
```

#### 3. Create initial migration
```bash
cd packages/backend
npm run migrate:create -- sites-table
cd ../..
```

#### 4. Edit the migration file
Find the created file in `packages/backend/migrations/` (will be named like `1234567890_sites-table.sql`) and replace its contents:

```sql
-- Migration: sites-table
-- Created at: [timestamp]

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- Enable required extensions (already enabled via init script, but ensure)
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- SITES TABLE with PostGIS columns
-- ============================================================================
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
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT sites_slug_not_empty CHECK (LENGTH(TRIM(slug)) > 0),
    CONSTRAINT sites_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT sites_access_mode_valid CHECK (access_mode IN ('disabled', 'allowlist', 'denylist', 'geofence')),
    CONSTRAINT sites_geofence_type_valid CHECK (geofence_type IS NULL OR geofence_type IN ('polygon', 'radius'))
);

-- CRITICAL: GIST spatial index for performance
CREATE INDEX idx_sites_hostname ON sites(hostname);
CREATE INDEX idx_sites_enabled ON sites(enabled);
CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_polygon);

COMMENT ON TABLE sites IS 'Multi-site configuration with geo-fencing and access control';
COMMENT ON COLUMN sites.slug IS 'URL-friendly unique identifier';
COMMENT ON COLUMN sites.hostname IS 'Primary hostname for this site (e.g., example.com)';
COMMENT ON COLUMN sites.access_mode IS 'Access control mode: disabled, allowlist, denylist, geofence';
COMMENT ON COLUMN sites.geofence_type IS 'Type of geofence: polygon or radius';
COMMENT ON COLUMN sites.geofence_polygon IS 'PostGIS geography polygon (WGS84) for polygon-based geofencing';
COMMENT ON COLUMN sites.geofence_center IS 'Center point for radius-based geofencing';
COMMENT ON COLUMN sites.geofence_radius_km IS 'Radius in kilometers for radius-based geofencing';

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
-- DROP FUNCTION IF EXISTS update_updated_at_column();
-- DROP TABLE IF EXISTS sites;
```

#### 5. Run the migration
```bash
npm run migrate:up -w packages/backend
```

#### 6. Create seed data script
Create `packages/backend/scripts/seed-dev-data.sql`:

```sql
-- Development seed data

-- Insert example sites
INSERT INTO sites (slug, hostname, name, access_mode, enabled) VALUES
    ('global-site', 'example.com', 'Global Site', 'disabled', true),
    ('eu-site', 'eu.example.com', 'EU Site', 'geofence', true),
    ('apac-site', 'apac.example.com', 'APAC Site', 'geofence', true)
ON CONFLICT (slug) DO NOTHING;

-- Insert example site with polygon geofence (North America)
INSERT INTO sites (slug, hostname, name, access_mode, geofence_type, geofence_polygon, enabled)
VALUES (
    'na-geofence',
    'na.example.com',
    'North America Geofenced Site',
    'geofence',
    'polygon',
    ST_GeogFromText('POLYGON((-125 50, -125 25, -65 25, -65 50, -125 50))'),
    true
)
ON CONFLICT (slug) DO NOTHING;

-- Insert example site with radius geofence (New York)
INSERT INTO sites (slug, hostname, name, access_mode, geofence_type, geofence_center, geofence_radius_km, enabled)
VALUES (
    'nyc-radius',
    'nyc.example.com',
    'NYC Radius Geofenced Site',
    'geofence',
    'radius',
    ST_GeogFromText('POINT(-74.0060 40.7128)'),
    50.0,
    true
)
ON CONFLICT (slug) DO NOTHING;
```

#### 7. Apply seed data
```bash
docker exec -i geo-ip-postgres psql -U dev_user -d geo_ip_webserver < packages/backend/scripts/seed-dev-data.sql
```

### Verification
```bash
# Connect to PostgreSQL
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver

# Verify tables exist
\dt

# Verify sites
SELECT id, slug, hostname, name, access_mode, enabled FROM sites;

# Verify PostGIS columns
SELECT slug, geofence_type, ST_AsText(geofence_polygon::geometry) as polygon, ST_AsText(geofence_center::geometry) as center, geofence_radius_km FROM sites WHERE geofence_type IS NOT NULL;

# Exit psql
\q
```

### Time Estimate
1 hour

### Success Criteria
- ✅ Migration system configured
- ✅ Sites table migration runs successfully
- ✅ Sites table created with all columns from ROADMAP schema
- ✅ PostGIS GIST index created on geofence_polygon
- ✅ UUID primary keys using gen_random_uuid()
- ✅ Seed data loaded successfully
- ✅ Constraints enforced (access_mode, geofence_type, etc.)

---

## Task DEV-006: Create Access Logs Table with Partitioning

### Objective
Create access_logs table with time-based partitioning and PostGIS support for tracking access requests, geolocation data, and screenshot URLs.

### Prerequisites
- DEV-005 completed (sites table created)

### Steps

#### 1. Create access logs migration
```bash
cd packages/backend
npm run migrate:create -- access-logs-table
cd ../..
```

#### 2. Edit the new migration file
Find the created file in `packages/backend/migrations/` and replace its contents:

```sql
-- Migration: access-logs-table
-- Created at: [timestamp]

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- ============================================================================
-- ACCESS LOGS TABLE (PARTITIONED BY MONTH)
-- ============================================================================
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

COMMENT ON TABLE access_logs IS 'HTTP access logs with geolocation data and screenshot URLs (partitioned by month)';
COMMENT ON COLUMN access_logs.allowed IS 'Whether access was allowed based on geofencing/rules';
COMMENT ON COLUMN access_logs.reason IS 'Reason for allow/deny decision';
COMMENT ON COLUMN access_logs.ip_lat IS 'Latitude from IP geolocation (MaxMind)';
COMMENT ON COLUMN access_logs.ip_lng IS 'Longitude from IP geolocation (MaxMind)';
COMMENT ON COLUMN access_logs.gps_lat IS 'Latitude from client GPS/browser';
COMMENT ON COLUMN access_logs.gps_lng IS 'Longitude from client GPS/browser';
COMMENT ON COLUMN access_logs.gps_accuracy IS 'GPS accuracy in meters';
COMMENT ON COLUMN access_logs.screenshot_url IS 'URL to screenshot stored in MinIO';

-- Create first partition for February 2026
CREATE TABLE access_logs_2026_02 PARTITION OF access_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Create indexes on the partition
CREATE INDEX idx_access_logs_2026_02_site ON access_logs_2026_02(site_id, timestamp DESC);
CREATE INDEX idx_access_logs_2026_02_allowed ON access_logs_2026_02(allowed);

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP TABLE IF EXISTS access_logs_2026_02;
-- DROP TABLE IF EXISTS access_logs;
```

#### 3. Run the migration
```bash
npm run migrate:up -w packages/backend
```

#### 4. Create geospatial query functions migration
```bash
cd packages/backend
npm run migrate:create -- geospatial-functions
cd ../..
```

#### 5. Edit the geospatial functions migration
Find the created file and replace its contents:

```sql
-- Migration: geospatial-functions
-- Created at: [timestamp]

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- ============================================================================
-- FUNCTION: Check if point is within site's geofence polygon
-- ============================================================================
CREATE OR REPLACE FUNCTION is_point_in_geofence(
    p_site_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
    result BOOLEAN;
BEGIN
    SELECT ST_Within(
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
        geofence_polygon
    )
    INTO result
    FROM sites
    WHERE id = p_site_id
      AND geofence_type = 'polygon'
      AND geofence_polygon IS NOT NULL;
    
    RETURN COALESCE(result, false);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_point_in_geofence IS 
'Check if a lat/lng point is within a site''s polygon geofence using ST_Within. Returns false if site has no polygon geofence.';

-- ============================================================================
-- FUNCTION: Check if point is within site's radius geofence
-- ============================================================================
CREATE OR REPLACE FUNCTION is_point_in_radius(
    p_site_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
    distance_meters NUMERIC;
    radius_meters NUMERIC;
BEGIN
    SELECT 
        ST_Distance(
            geofence_center,
            ST_GeogFromText(format('POINT(%s %s)', p_longitude, p_latitude))
        ),
        geofence_radius_km * 1000
    INTO distance_meters, radius_meters
    FROM sites
    WHERE id = p_site_id
      AND geofence_type = 'radius'
      AND geofence_center IS NOT NULL
      AND geofence_radius_km IS NOT NULL;
    
    RETURN distance_meters <= radius_meters;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_point_in_radius IS 
'Check if a lat/lng point is within a site''s radius geofence. Returns false if site has no radius geofence.';

-- ============================================================================
-- FUNCTION: Auto-create next month partition for access_logs
-- ============================================================================
CREATE OR REPLACE FUNCTION create_next_month_partition()
RETURNS void AS $$
DECLARE
    next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
    end_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '2 months');
    partition_name TEXT := 'access_logs_' || TO_CHAR(next_month, 'YYYY_MM');
BEGIN
    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF access_logs
             FOR VALUES FROM (%L) TO (%L)',
            partition_name, next_month, end_month
        );
        
        -- Create indexes on the new partition
        EXECUTE format(
            'CREATE INDEX idx_%I_site ON %I(site_id, timestamp DESC)',
            partition_name, partition_name
        );
        EXECUTE format(
            'CREATE INDEX idx_%I_allowed ON %I(allowed)',
            partition_name, partition_name
        );
        
        RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_next_month_partition IS 
'Manually create the next month partition for access_logs table with indexes';

-- ============================================================================
-- VIEW: Recent access logs with site details
-- ============================================================================
CREATE OR REPLACE VIEW v_recent_access_logs AS
SELECT 
    al.id,
    al.timestamp,
    al.ip_address,
    al.url,
    al.allowed,
    al.reason,
    al.ip_country,
    al.ip_city,
    al.ip_lat,
    al.ip_lng,
    al.gps_lat,
    al.gps_lng,
    al.gps_accuracy,
    al.screenshot_url,
    s.slug AS site_slug,
    s.hostname AS site_hostname,
    s.name AS site_name
FROM access_logs al
JOIN sites s ON al.site_id = s.id
WHERE al.timestamp > NOW() - INTERVAL '7 days'
ORDER BY al.timestamp DESC;

COMMENT ON VIEW v_recent_access_logs IS 
'Recent access logs (last 7 days) with joined site details';

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP VIEW IF EXISTS v_recent_access_logs;
-- DROP FUNCTION IF EXISTS create_next_month_partition();
-- DROP FUNCTION IF EXISTS is_point_in_radius(UUID, NUMERIC, NUMERIC);
-- DROP FUNCTION IF EXISTS is_point_in_geofence(UUID, NUMERIC, NUMERIC);
```

#### 6. Run the migration
```bash
npm run migrate:up -w packages/backend
```

#### 7. Create test script for geospatial functions with ST_Within verification
Create `packages/backend/scripts/test-geospatial.sql`:

```sql
-- Test geospatial functions

-- Test 1: Find site with polygon geofence
SELECT id, slug, name, geofence_type FROM sites WHERE geofence_type = 'polygon' LIMIT 1;

-- Test 2: Check if New York (40.7128°N, 74.0060°W) is in North America geofence
SELECT 
    slug,
    is_point_in_geofence(id, 40.7128, -74.0060) as is_in_geofence
FROM sites 
WHERE slug = 'na-geofence';

-- Test 3: Check if point outside North America geofence (London: 51.5074°N, 0.1278°W)
SELECT 
    slug,
    is_point_in_geofence(id, 51.5074, -0.1278) as is_in_geofence
FROM sites 
WHERE slug = 'na-geofence';

-- Test 4: Check radius geofence (point near NYC)
SELECT 
    slug,
    is_point_in_radius(id, 40.7589, -73.9851) as is_in_radius
FROM sites 
WHERE slug = 'nyc-radius';

-- Test 5: Check radius geofence (point far from NYC - Los Angeles)
SELECT 
    slug,
    is_point_in_radius(id, 34.0522, -118.2437) as is_in_radius
FROM sites 
WHERE slug = 'nyc-radius';

-- Test 6: Verify partitions exist
SELECT tablename FROM pg_tables WHERE tablename LIKE 'access_logs_%' ORDER BY tablename;

-- Test 7: CRITICAL - ST_Within performance test with EXPLAIN ANALYZE
-- This verifies the GIST index is being used for <1ms queries
EXPLAIN ANALYZE
SELECT ST_Within(
    ST_SetSRID(ST_MakePoint(-74.0060 + (random() * 0.1), 40.7128 + (random() * 0.1)), 4326)::geography,
    geofence_polygon
) as is_within
FROM sites
WHERE geofence_type = 'polygon'
  AND geofence_polygon IS NOT NULL
LIMIT 100;

-- Test 8: Performance test - 1000 geofence checks
EXPLAIN ANALYZE
SELECT is_point_in_geofence(
    (SELECT id FROM sites WHERE slug = 'na-geofence'),
    40.0 + (random() * 10),
    -100.0 + (random() * 30)
)
FROM generate_series(1, 1000);
```

#### 8. Run geospatial tests
```bash
docker exec -i geo-ip-postgres psql -U dev_user -d geo_ip_webserver < packages/backend/scripts/test-geospatial.sql
```

### Verification
```bash
# Verify access_logs table structure
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver -c "\d access_logs"

# Verify partitions exist
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver -c "SELECT tablename FROM pg_tables WHERE tablename LIKE 'access_logs_%';"

# Verify functions exist
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver -c "\df is_point_in_geofence"
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver -c "\df is_point_in_radius"

# Run full test suite with ST_Within verification
docker exec -i geo-ip-postgres psql -U dev_user -d geo_ip_webserver < packages/backend/scripts/test-geospatial.sql

# Verify GIST index usage (look for "Index Scan" in EXPLAIN ANALYZE output)
# Execution time should be <1ms per query
```

### Time Estimate
1.5 hours

### Success Criteria
- ✅ access_logs table created with exact ROADMAP schema
- ✅ All columns present: allowed, reason, url, ip_country, ip_city, ip_lat, ip_lng, gps_lat, gps_lng, gps_accuracy, screenshot_url
- ✅ Partitioned by timestamp (RANGE partitioning)
- ✅ February 2026 partition created
- ✅ Indexes on site_id and allowed columns
- ✅ is_point_in_geofence() function uses ST_Within
- ✅ is_point_in_radius() function created
- ✅ EXPLICIT ST_Within verification test with EXPLAIN ANALYZE shows <1ms performance
- ✅ GIST index confirmed in use (Index Scan in query plan)
- ✅ View v_recent_access_logs created

---

## Task DEV-007: Setup Database Migration System

### Objective
Verify and document the database migration system setup with node-pg-migrate.

### Prerequisites
- DEV-005 completed (migration system configured and first migration run)

### Steps

#### 1. Verify migration configuration
```bash
# Verify .migrations.json exists
cat packages/backend/.migrations.json

# Verify migrations directory exists
ls -la packages/backend/migrations
```

#### 2. Create migration management documentation
Create `packages/backend/migrations/README.md`:

```markdown
# Database Migrations

This directory contains SQL migrations managed by `node-pg-migrate`.

## Commands

### Create a new migration
\`\`\`bash
npm run migrate:create -- migration-name
\`\`\`

### Run all pending migrations
\`\`\`bash
npm run migrate:up
\`\`\`

### Rollback last migration
\`\`\`bash
npm run migrate:down
\`\`\`

### Check migration status
\`\`\`bash
npm run migrate:up -- --dry-run
\`\`\`

## Migration Naming Convention

- Use descriptive names: \`create-users-table\`, \`add-email-index\`
- Use kebab-case
- Be specific about what changes

## Migration Best Practices

1. **Always include DOWN migration** - Comment it out at the bottom of the file
2. **Test rollbacks** - Ensure DOWN migration works correctly
3. **Atomic changes** - One logical change per migration
4. **Add comments** - Explain WHY, not just WHAT
5. **Add indexes** - Include all necessary indexes in the migration
6. **Use constraints** - Enforce data integrity at database level

## Current Migrations

1. **sites-table** - Creates sites table with PostGIS geofencing columns
2. **access-logs-table** - Creates partitioned access_logs table
3. **geospatial-functions** - Creates ST_Within and radius checking functions
\`\`\`

#### 3. Test migration rollback capability
```bash
# Test down migration (dry run)
cd packages/backend
npm run migrate:down -- --dry-run
cd ../..
```

#### 4. Verify migration table
```bash
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver -c "SELECT * FROM pgmigrations ORDER BY run_on DESC;"
```

### Verification
```bash
# Verify all migrations are tracked
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver -c "SELECT id, name, run_on FROM pgmigrations ORDER BY run_on;"

# Verify migration commands work
cd packages/backend
npm run migrate:up -- --dry-run
cd ../..

# Verify migrations directory structure
tree packages/backend/migrations
```

### Time Estimate
30 minutes

### Success Criteria
- ✅ Migration system fully configured and documented
- ✅ node-pg-migrate commands working (create, up, down)
- ✅ pgmigrations table tracking all applied migrations
- ✅ Migration README.md created with best practices
- ✅ All existing migrations (3) recorded in pgmigrations table
- ✅ Dry-run capability verified

---
## Task DEV-008: Configure CI/CD Pipeline

### Objective
Setup GitHub Actions workflow for automated testing, linting, and building.

### Prerequisites
- DEV-001 through DEV-007 completed

### Steps

#### 1. Create GitHub Actions workflow directory
```bash
mkdir -p .github/workflows
```

#### 2. Create main CI workflow
Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  NODE_VERSION: '22'

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint backend
        run: npm run lint -w packages/backend
      
      - name: Lint frontend
        run: npm run lint -w packages/frontend

  test-backend:
    name: Test Backend
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: geo_ip_webserver_test
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
          --health-timeout 3s
          --health-retries 5
        ports:
          - 6379:6379
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run backend tests
        run: npm run test -w packages/backend
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/geo_ip_webserver_test
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          NODE_ENV: test

  test-frontend:
    name: Test Frontend
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run frontend tests
        run: npm run test -w packages/frontend

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, test-backend, test-frontend]
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build backend
        run: npm run build -w packages/backend
      
      - name: Build frontend
        run: npm run build -w packages/frontend
      
      - name: Upload backend build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: backend-dist
          path: packages/backend/dist
          retention-days: 7
      
      - name: Upload frontend build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: frontend-dist
          path: packages/frontend/dist
          retention-days: 7

  type-check:
    name: TypeScript Type Check
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check backend
        run: npx tsc --noEmit -w packages/backend
      
      - name: Type check frontend
        run: npx tsc --noEmit -w packages/frontend
```

#### 3. Create dependency review workflow
Create `.github/workflows/dependency-review.yml`:

```yaml
name: Dependency Review

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  dependency-review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Dependency Review
        uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high
```

#### 4. Create CodeQL security scanning workflow
Create `.github/workflows/codeql.yml`:

```yaml
name: CodeQL Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1' # Weekly on Monday

permissions:
  security-events: write
  actions: read
  contents: read

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    
    strategy:
      fail-fast: false
      matrix:
        language: ['javascript-typescript']
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
      
      - name: Autobuild
        uses: github/codeql-action/autobuild@v3
      
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
```

#### 5. Create pull request template
Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Description
<!-- Describe your changes in detail -->

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)

## Related Issues
<!-- Link to related issues: Fixes #123, Closes #456 -->

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
- [ ] Dependent changes merged

## Screenshots (if applicable)
<!-- Add screenshots for UI changes -->

## Additional Notes
<!-- Any additional information -->
```

#### 6. Create issue templates
Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
## Task DEV-009: Download MaxMind GeoLite2 Databases

### Objective
Download and integrate MaxMind GeoIP2 databases for IP geolocation with LRU caching.

### Prerequisites
- DEV-003 completed (backend setup)

### Steps

#### 1. Download MaxMind GeoLite2 databases
**Note**: You need to create a free MaxMind account at https://www.maxmind.com/en/geolite2/signup

After signing up:
1. Login to your MaxMind account
2. Navigate to "Download Files" under GeoIP2 / GeoLite2
3. Download:
   - GeoLite2 City (MMDB format)
   - GeoLite2 Country (MMDB format)

#### 2. Create data directory and move databases
```bash
mkdir -p packages/backend/data
# Move downloaded .mmdb files to packages/backend/data/
# Files should be:
#   - packages/backend/data/GeoLite2-City.mmdb
#   - packages/backend/data/GeoLite2-Country.mmdb
```

#### 3. Create GeoIP service
Create `packages/backend/src/services/geoip.ts`:

```typescript
import maxmind, { CityResponse, CountryResponse, Reader } from 'maxmind';
import { FastifyBaseLogger } from 'fastify';

interface GeoIPLocation {
  country?: string;
  countryCode?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  postalCode?: string;
}

interface CacheEntry {
  data: GeoIPLocation;
  timestamp: number;
}

export class GeoIPService {
  private cityReader: Reader<CityResponse> | null = null;
  private countryReader: Reader<CountryResponse> | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour in ms
  private readonly MAX_CACHE_SIZE = 10000; // LRU cache size
  private logger: FastifyBaseLogger;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;
  }

  async initialize(cityDbPath: string, countryDbPath: string): Promise<void> {
    try {
      this.cityReader = await maxmind.open<CityResponse>(cityDbPath);
      this.countryReader = await maxmind.open<CountryResponse>(countryDbPath);
      this.logger.info('GeoIP databases loaded successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to load GeoIP databases');
      throw error;
    }
  }

  lookup(ip: string): GeoIPLocation | null {
    // Check cache first
    const cached = this.cache.get(ip);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.data;
    }

    // Perform lookup
    const location = this.performLookup(ip);
    
    // Cache result (LRU eviction)
    if (location) {
      this.cacheResult(ip, location);
    }

    return location;
  }

  private performLookup(ip: string): GeoIPLocation | null {
    try {
      const cityData = this.cityReader?.get(ip);
      
      if (!cityData) {
        // Fallback to country lookup
        const countryData = this.countryReader?.get(ip);
        if (!countryData) {
          return null;
        }

        return {
          country: countryData.country?.names?.en,
          countryCode: countryData.country?.iso_code
        };
      }

      return {
        country: cityData.country?.names?.en,
        countryCode: cityData.country?.iso_code,
        city: cityData.city?.names?.en,
        latitude: cityData.location?.latitude,
        longitude: cityData.location?.longitude,
        timezone: cityData.location?.time_zone,
        postalCode: cityData.postal?.code
      };
    } catch (error) {
      this.logger.error({ error, ip }, 'GeoIP lookup failed');
      return null;
    }
  }

  private cacheResult(ip: string, location: GeoIPLocation): void {
    // LRU eviction: remove oldest entry if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(ip, {
      data: location,
      timestamp: Date.now()
    });
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttl: this.CACHE_TTL
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.info('GeoIP cache cleared');
  }
}
```

#### 4. Create GeoIP Fastify plugin
Create `packages/backend/src/plugins/geoip.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { GeoIPService } from '../services/geoip.js';

declare module 'fastify' {
  interface FastifyInstance {
    geoip: GeoIPService;
  }
}

const geoipPlugin: FastifyPluginAsync = async (fastify) => {
  const geoip = new GeoIPService(fastify.log);
  
  const cityDbPath = process.env.GEOIP_CITY_DB_PATH || './data/GeoLite2-City.mmdb';
  const countryDbPath = process.env.GEOIP_COUNTRY_DB_PATH || './data/GeoLite2-Country.mmdb';
  
  await geoip.initialize(cityDbPath, countryDbPath);
  
  fastify.decorate('geoip', geoip);
};

export default fp(geoipPlugin, {
  name: 'geoip'
});
```

#### 5. Install fastify-plugin
```bash
npm install -w packages/backend fastify-plugin
```

#### 6. Update backend index.ts to use GeoIP plugin
Edit `packages/backend/src/index.ts` to add the GeoIP plugin (add after other plugin registrations):

```typescript
import geoipPlugin from './plugins/geoip.js';

// ... existing code ...

async function buildServer() {
  // ... existing code ...
  
  // Register GeoIP plugin
  await server.register(geoipPlugin);
  
  // ... existing routes ...
  
  // Add GeoIP test route
  server.get('/geoip/:ip', async (request, reply) => {
    const { ip } = request.params as { ip: string };
    const location = server.geoip.lookup(ip);
    
    if (!location) {
      return reply.code(404).send({ error: 'Location not found for IP' });
    }
    
    return location;
  });
  
  // Add GeoIP stats route
  server.get('/geoip/stats', async () => {
    return server.geoip.getCacheStats();
  });
  
  return server;
}
```

#### 7. Update TypeScript config to add fastify-plugin types
```bash
npm install -w packages/backend -D @types/maxmind
```

### Verification
```bash
# Start backend
npm run dev -w packages/backend

# Test GeoIP lookup with known IPs:

# Test 1: Google DNS (should return US location)
curl http://localhost:3000/geoip/8.8.8.8

# Test 2: Cloudflare DNS (should return US/AU location)
curl http://localhost:3000/geoip/1.1.1.1

# Test 3: Your own IP (check https://ipinfo.io to find your IP first)
curl http://localhost:3000/geoip/YOUR_IP_HERE

# Test 4: Check cache stats
curl http://localhost:3000/geoip/stats

# Test 5: Verify caching (second request should be faster)
time curl http://localhost:3000/geoip/8.8.8.8
time curl http://localhost:3000/geoip/8.8.8.8
```

### Time Estimate
1 hour

### Success Criteria
- ✅ MaxMind GeoLite2 databases downloaded and placed in `packages/backend/data/`
- ✅ GeoIPService created with LRU caching
- ✅ Fastify plugin registered
- ✅ GeoIP lookup endpoint `/geoip/:ip` works
- ✅ Returns country, city, latitude, longitude for known IPs
- ✅ Cache stats endpoint works
- ✅ Subsequent lookups use cache (faster response)
- ✅ No TypeScript errors

---
name: Bug Report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description
<!-- A clear description of the bug -->

## Steps to Reproduce
1. 
2. 
3. 

## Expected Behavior
<!-- What should happen -->

## Actual Behavior
<!-- What actually happens -->

## Environment
- OS: 
- Node version: 
- Browser (if applicable): 

## Screenshots
<!-- If applicable -->

## Additional Context
<!-- Any other relevant information -->
```

Create `.github/ISSUE_TEMPLATE/feature_request.md`:

```markdown
---
name: Feature Request
about: Suggest an idea for this project
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

## Feature Description
<!-- Clear description of the feature -->

## Problem Statement
<!-- What problem does this solve? -->

## Proposed Solution
<!-- How should this work? -->

## Alternatives Considered
<!-- Other approaches you've considered -->

## Additional Context
<!-- Any other relevant information -->
```

### Verification
```bash
# Verify workflow files are valid YAML
# (You can use https://www.yamllint.com/ or install yamllint)

# Commit the workflow files
git add .github/
git commit -m "ci: add GitHub Actions workflows"

# Push to GitHub (if you have a remote repository)
# git push origin main

# Workflows will run automatically on push
```

### Time Estimate
1 hour

### Success Criteria
- ✅ CI workflow created with lint, test, build jobs
- ✅ Dependency review workflow created
- ✅ CodeQL security scanning configured
- ✅ PR template created
- ✅ Issue templates created
- ✅ All YAML files are valid
- ✅ Workflows committed to repository
- ✅ (If pushed) Workflows run successfully on GitHub

---

## Phase 0 Completion Checklist

Before proceeding to Phase 1, ensure all tasks are complete:

- [ ] DEV-001: Git repository with monorepo structure initialized
- [ ] DEV-002: Docker Compose stack running (PostgreSQL, Redis, MinIO)
- [ ] DEV-003: Backend project setup with Fastify
- [ ] DEV-004: Frontend project setup with React + Vite
- [ ] DEV-005: Sites table created with PostGIS columns
- [ ] DEV-006: Access logs table created with partitioning and ST_Within functions
- [ ] DEV-007: Database migration system setup and documented
- [ ] DEV-008: CI/CD pipeline configured with GitHub Actions
- [ ] DEV-009: MaxMind GeoLite2 databases downloaded and integrated

### Verification Commands

Run these commands to verify Phase 0 completion:

```bash
# 1. Verify monorepo structure
npm ls --workspaces

# 2. Verify Docker services
docker-compose ps

# 3. Verify backend health
curl http://localhost:3000/health

# 4. Verify frontend
curl http://localhost:5173

# 5. Verify database schema
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver -c "\dt"

# 6. Verify PostGIS
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver -c "SELECT PostGIS_Version();"

# 7. Verify GeoIP
curl http://localhost:3000/geoip/8.8.8.8

# 8. Verify tests pass
npm test

# 9. Verify build succeeds
npm run build
```

All commands should complete successfully before moving to Phase 1.

---

## Next Steps

Once Phase 0 is complete, proceed to:
- **Phase 1**: Multi-Site Management - See `.planning/phases/1/PLAN.md`

Refer to `.planning/ROADMAP.md` for the complete project roadmap.
