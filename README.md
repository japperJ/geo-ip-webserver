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

4. **Start infrastructure**
   ```bash
   docker-compose up -d
   ```
   
   This starts:
   - PostgreSQL 16 with PostGIS on port 5434
   - (Future: Caddy reverse proxy)

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

### Sites

- `GET /api/sites` - List all sites (paginated)
- `GET /api/sites/:id` - Get site by ID
- `POST /api/sites` - Create new site
- `PATCH /api/sites/:id` - Update site
- `DELETE /api/sites/:id` - Delete site

### Access Logs

- `GET /api/access-logs` - List access logs (filterable, paginated)
- `GET /api/access-logs/:id` - Get log entry by ID

### Health

- `GET /health` - Health check endpoint

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

### Frontend E2E Tests
```bash
# Run tests headless
npm run test:e2e -w packages/frontend

# Run tests with UI
npm run test:e2e:ui -w packages/frontend
```

## Deployment

### Production Build

```bash
# Build backend
npm run build -w packages/backend

# Build frontend
npm run build -w packages/frontend
```

### Docker Deployment

1. **Configure production environment**
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

2. **Build and start services**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Run migrations**
   ```bash
   docker-compose -f docker-compose.prod.yml exec backend npm run migrate:up
   ```

### Nginx Configuration

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

### Phase 1: MVP (Current)

- IP-based access control
- Country-based filtering
- VPN detection
- Access logging with IP anonymization
- Admin UI for site management
- Cron jobs for log retention

### Future Phases

- Multi-region deployment
- Advanced rate limiting
- Screenshot capture
- Bot detection
- CAPTCHA integration
- Advanced analytics

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
