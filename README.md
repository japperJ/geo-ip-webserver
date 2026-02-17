# Geo-IP Webserver

Multi-site content delivery platform with geo-fencing, IP-based access control, VPN detection, and comprehensive access logging.

## Features

- **IP-based Access Control**: Configure IP allowlists and denylists with CIDR notation support
- **Country-based Filtering**: Allow or block requests based on country codes (ISO 3166-1 alpha-2)
- **VPN Detection**: Automatically detect and block VPN/proxy traffic using MaxMind GeoIP2 databases
- **Access Logging**: Comprehensive logging with IP anonymization for privacy compliance
- **Multi-Site Management**: Manage multiple sites with individual access control rules
- **Admin Dashboard**: Modern React-based UI for site configuration and log viewing

## Quick Start

### Prerequisites
- Node.js 22+
- Docker & Docker Compose
- Git
- MaxMind GeoLite2 databases (optional for GeoIP features)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd geo-ip-webserver
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Backend
   cp packages/backend/.env.example packages/backend/.env
   
   # Frontend
   cp packages/frontend/.env.example packages/frontend/.env
   ```

4. **Start infrastructure (PostgreSQL, Redis, MinIO)**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```
   
   This starts:
   - PostgreSQL 16 with PostGIS on port 5434
   - Redis on port 6380
   - MinIO (S3-compatible storage) on ports 9002-9003

5. **Run database migrations**
   ```bash
   npm run migrate:up -w packages/backend
   ```

6. **Download MaxMind databases (optional)**
   ```bash
   # If you have a MaxMind license key
   cd packages/backend/geoip
   # Download GeoLite2-Country.mmdb and GeoLite2-ASN.mmdb
   ```

7. **Start development servers**
   ```bash
   # Start backend (port 3000)
   npm run dev -w packages/backend
   
   # In another terminal, start frontend (port 5173)
   npm run dev -w packages/frontend
   ```

8. **Access the admin dashboard**
   ```
   http://localhost:5173
   ```

## Canonical Entrypoints + Smoke Verification (Phase G)

Operational smoke verification is now standardized. Canonical entrypoints are also tracked in `.planning/ENTRYPOINTS.md`.

### Entrypoint matrix

| Mode | Surface | Base URL | Purpose |
|---|---|---|---|
| Docker full stack (**canonical smoke mode**) | Proxy (frontend + API + docs) | `http://localhost:8080` | Browser-level smoke and proxy parity checks |
| Docker full stack (**canonical smoke mode**) | Direct backend | `http://localhost:3001` | Health/docs/auth HTTP smoke checks |
| Dev hot reload | Frontend | `http://localhost:5173` | Local Vite development |
| Dev hot reload | Backend | `http://localhost:3000` | Local Fastify development |

### URLs to validate

- Direct backend:
   - `http://localhost:3001/health`
   - `http://localhost:3001/documentation`
   - `http://localhost:3001/documentation/json`
- Proxy:
   - `http://localhost:8080/documentation`
   - `http://localhost:8080/documentation/json`

### Single smoke command

Run this after the docker full stack is up:

```bash
npm run smoke
```

What it runs:

1. HTTP smoke (`npm run smoke:http`): backend health/docs + proxy docs + auth sanity (`register/login/me/refresh`)
2. Browser smoke (`npm run smoke:e2e`): minimal Playwright smoke at proxy base URL

Expected success markers include:

- `✅ Phase G HTTP smoke PASSED`
- `✅ Playwright smoke PASSED`

If smoke fails:

1. Confirm services are up (`docker-compose ps`).
2. Check backend/frontend logs (`docker-compose logs backend frontend`).
3. Re-run `npm run smoke` and use the first `[FAIL]` message to identify the failing gate.

## Project Structure

```
geo-ip-webserver/
├── packages/
│   ├── backend/           # Fastify API server
│   │   ├── src/
│   │   │   ├── routes/    # API endpoints
│   │   │   ├── services/  # Business logic
│   │   │   ├── middleware/# Request processing
│   │   │   ├── models/    # TypeScript types
│   │   │   ├── utils/     # Helper functions
│   │   │   └── jobs/      # Cron jobs
│   │   ├── migrations/    # Database migrations
│   │   └── geoip/         # MaxMind databases
│   ├── frontend/          # React admin dashboard
│   │   ├── src/
│   │   │   ├── components/# React components
│   │   │   ├── pages/     # Page components
│   │   │   ├── lib/       # API client & utilities
│   │   │   └── e2e/       # Playwright tests
│   │   └── dist/          # Build output
│   └── workers/           # Background workers (future)
├── infrastructure/        # Docker & deployment
├── .planning/            # Project documentation
└── docker-compose.yml    # Local development stack
```

## Environment Variables

### Backend (`packages/backend/.env`)

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5434
DATABASE_NAME=geo_ip_webserver
DATABASE_USER=dev_user
DATABASE_PASSWORD=dev_password

# Test Database
TEST_DATABASE_NAME=geo_ip_webserver_test

# MaxMind GeoIP
GEOIP_COUNTRY_DB_PATH=./geoip/GeoLite2-Country.mmdb
GEOIP_ASN_DB_PATH=./geoip/GeoLite2-ASN.mmdb

# Log Retention
LOG_RETENTION_DAYS=90
```

### Frontend (`packages/frontend/.env`)

```env
VITE_API_URL=http://localhost:3000
```

## API Endpoints

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Sites and Access Control

- `GET /api/sites` - List accessible sites (paginated)
- `GET /api/sites/:id` - Get site by ID
- `POST /api/sites` - Create site (super admin)
- `PATCH /api/sites/:id` - Update site (site admin/super admin)
- `DELETE /api/sites/:id` - Delete site (super admin)
- `POST /api/sites/:id/validate-location` - Validate GPS location against site geofence

### Site Roles and Users

- `GET /api/sites/:id/roles` - List site role assignments
- `POST /api/sites/:id/roles` - Grant/update site role (super admin)
- `DELETE /api/sites/:id/roles/:userId` - Revoke site role (super admin)
- `GET /api/users` - List users (super admin)
- `PATCH /api/users/:id` - Update global role (super admin)
- `DELETE /api/users/:id` - Soft-delete user (super admin)

### Access Logs and Content

- `GET /api/access-logs` - List access logs (filterable, paginated)
- `GET /api/access-logs/:id` - Get log entry by ID
- `GET /api/sites/:siteId/access-logs/export` - Export site logs as CSV
- `GET /api/sites/:siteId/content` - List site content
- `POST /api/sites/:siteId/content/upload` - Upload content (site admin)
- `GET /api/sites/:siteId/content/download?key=...` - Generate short-lived download URL
- `DELETE /api/sites/:siteId/content/:key` - Delete content (site admin)

### Health and Readiness

- `GET /health` - Health check
- `GET /ready` - Readiness check

## Database Migrations

```bash
# Run all pending migrations
npm run migrate:up -w packages/backend

# Rollback last migration
npm run migrate:down -w packages/backend

# Create new migration
npm run migrate:create -w packages/backend -- migration_name
```

## Testing

### Backend Unit Tests
```bash
npm test -w packages/backend
```

Backend Vitest fail-fast defaults:
- `testTimeout`: `30000ms`
- `hookTimeout`: `30000ms`
- `teardownTimeout`: `15000ms`

### Frontend Unit Tests (Vitest)
```bash
npm test -w packages/frontend
```

Notes:
- `npm test -w packages/frontend` now runs in **non-watch** mode (`vitest run`) so CI/local scripts terminate reliably.
- Use watch mode explicitly when developing:

```bash
npm run test:watch -w packages/frontend
```

Frontend Vitest fail-fast defaults:
- `testTimeout`: `15000ms`
- `hookTimeout`: `15000ms`
- `teardownTimeout`: `10000ms`

### Frontend E2E Tests
```bash
# Run tests headless
npm run test:e2e -w packages/frontend

# Run tests with UI
npm run test:e2e:ui -w packages/frontend
```

Playwright timeout defaults:
- Per test `timeout`: `30000ms`
- Suite `globalTimeout`: `600000ms` (10 minutes)
- Web server startup timeout: `60000ms`

Smoke timeout controls:
- `SMOKE_HTTP_TIMEOUT_MS` (default `10000`) — per-request timeout in `npm run smoke:http`
- `SMOKE_E2E_TIMEOUT_MS` (default `300000`) — overall timeout guard for `npm run smoke:e2e`

## Deployment

### Docker Deployment (Recommended)

The application includes complete Docker support for easy production deployment.

#### Production Deployment

1. **Configure environment variables**
   ```bash
   # Edit docker-compose.yml and update:
   # - JWT_SECRET and COOKIE_SECRET (must be 32+ characters)
   # - CORS_ORIGIN to match your domain
   # - Database credentials (change from dev defaults)
   ```

2. **Build and start all services**
   ```bash
   docker-compose build
   docker-compose up -d
   ```

   This starts:
   - **Frontend** (Nginx) on port **8080**
   - **Backend API** on port **3001**
   - PostgreSQL 16 with PostGIS on port 5434
   - Redis on port 6380
   - MinIO (S3-compatible storage) on ports 9002-9003

3. **Run database migrations**
   ```bash
   docker exec geo-ip-backend sh -c "cd packages/backend && npx node-pg-migrate up"
   ```

4. **Check service health**
   ```bash
   docker-compose ps
   curl http://localhost:3001/health
   ```

5. **View logs**
   ```bash
   docker-compose logs -f backend
   docker-compose logs -f frontend
   ```

#### Development with Docker Infrastructure

For local development with hot-reload, use the dev compose file:

```bash
# Start only infrastructure (PostgreSQL, Redis, MinIO)
docker-compose -f docker-compose.dev.yml up -d

# Run backend locally with hot-reload
npm run dev -w packages/backend

# Run frontend locally with hot-reload
npm run dev -w packages/frontend
```

#### Docker Architecture

- **Backend**: Multi-stage build with Node 20 Alpine, includes dumb-init for proper signal handling
- **Frontend**: Multi-stage build with Vite compilation, served by Nginx with reverse proxy to backend
- **Nginx**: Configured to proxy `/api/*` requests to backend, handles SPA routing, includes security headers
- **Health Checks**: All services have health checks for orchestration reliability

### Manual Production Build

If not using Docker, you can build manually:

```bash
# Build backend
npm run build -w packages/backend

# Build frontend
npm run build -w packages/frontend
```

Then deploy the built files using your preferred hosting method.

### Nginx Configuration (Manual Deployment)

```nginx
server {
    listen 80;
    server_name admin.example.com;

    location / {
        root /var/www/geo-ip-webserver/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Architecture

### Current (Phase 5 Complete)

- Multi-tenant site management with RBAC (`super_admin`, site `admin`/`viewer`)
- IP-based access controls (allowlist/denylist, country filters, VPN/proxy blocking)
- GPS geofencing (polygon/radius with validation path)
- Access logging with IP anonymization and CSV export
- Screenshot artifact integration for blocked requests
- GDPR data rights endpoints (consent, export, deletion)
- Production hardening: security headers, rate limiting, metrics, health/readiness checks

## Development Guidelines

### Code Style

- ESLint configuration enforced
- TypeScript strict mode enabled
- Use async/await over promises
- Prefer parameterized queries for SQL

### Git Workflow

1. Create feature branch from `main`
2. Implement feature with tests
3. Run tests locally
4. Commit with descriptive message
5. Create pull request
6. Merge after review

### Commit Message Format

```
feat: add site deletion endpoint
fix: correct IP validation for IPv6
docs: update deployment guide
test: add E2E tests for access logs
```

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps

# View PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Frontend Build Errors

```bash
# Clear node_modules and reinstall
rm -rf packages/frontend/node_modules
npm install -w packages/frontend

# Clear vite cache
rm -rf packages/frontend/node_modules/.vite
```

### MaxMind Database Errors

If you see "GeoIP database not found" warnings:

1. Download MaxMind databases (requires account)
2. Place in `packages/backend/geoip/`
3. Restart backend server

## Support

For issues and questions:
- Check `.planning/` directory for project documentation
- Review test files for usage examples
- Check logs for error details

## License

Proprietary
