# Staging Deployment Guide

This document outlines the staging deployment for Phase 1 MVP.

## Staging Environment Specifications

**Environment:** Staging  
**Purpose:** Pre-production testing and validation  
**URL:** http://staging.example.com (configure your domain)

### Infrastructure

- **Server:** Ubuntu 22.04 LTS
- **RAM:** 2GB minimum
- **Disk:** 20GB minimum
- **Docker:** 24.x
- **Docker Compose:** 2.x

## Deployment Steps

### 1. Server Preparation

```bash
# SSH into staging server
ssh user@staging.example.com

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Create deployment user
sudo useradd -m -s /bin/bash geoip
sudo usermod -aG docker geoip
sudo -u geoip bash
```

### 2. Clone Repository

```bash
cd ~
git clone https://github.com/your-org/geo-ip-webserver.git
cd geo-ip-webserver
```

### 3. Configure Environment

```bash
# Create production environment file
cat > .env << 'EOF'
POSTGRES_USER=geoip_staging
POSTGRES_PASSWORD=CHANGE_THIS_IN_PRODUCTION
POSTGRES_DB=geo_ip_webserver
EOF

# Backend environment
cat > packages/backend/.env << 'EOF'
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=geo_ip_webserver
DATABASE_USER=geoip_staging
DATABASE_PASSWORD=CHANGE_THIS_IN_PRODUCTION

GEOIP_COUNTRY_DB_PATH=./geoip/GeoLite2-Country.mmdb
GEOIP_ASN_DB_PATH=./geoip/GeoLite2-ASN.mmdb

LOG_RETENTION_DAYS=90
EOF

# Frontend environment  
cat > packages/frontend/.env.production << 'EOF'
VITE_API_URL=http://staging.example.com
EOF
```

**IMPORTANT:** Replace `CHANGE_THIS_IN_PRODUCTION` with a secure password:

```bash
openssl rand -base64 32
```

### 4. Download MaxMind Databases

```bash
cd packages/backend/geoip

# Download from MaxMind (requires free account)
# Visit: https://www.maxmind.com/en/geolite2/signup
# Get your license key, then:

LICENSE_KEY="your_license_key_here"

wget "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${LICENSE_KEY}&suffix=tar.gz" -O GeoLite2-Country.tar.gz
wget "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${LICENSE_KEY}&suffix=tar.gz" -O GeoLite2-ASN.tar.gz

tar -xzf GeoLite2-Country.tar.gz --strip-components=1 --wildcards '*.mmdb'
tar -xzf GeoLite2-ASN.tar.gz --strip-components=1 --wildcards '*.mmdb'

rm *.tar.gz
cd ../../..
```

### 5. Build Application

```bash
# Install dependencies
npm install

# Build backend
npm run build -w packages/backend

# Build frontend with production environment
npm run build -w packages/frontend
```

### 6. Deploy with Docker Compose

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### 7. Run Database Migrations

```bash
# Wait for PostgreSQL to be ready (check health)
docker-compose -f docker-compose.prod.yml exec postgres pg_isready -U geoip_staging

# Run migrations
docker-compose -f docker-compose.prod.yml exec backend npm run migrate:up
```

### 8. Verify Deployment

```bash
# Test backend health
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"...","services":{"database":true}}

# Test frontend
curl http://localhost:8080

# Should return HTML
```

### 9. Create Test Site

```bash
curl -X POST http://localhost:3000/api/sites \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "test-site",
    "name": "Test Site",
    "hostname": "test.staging.example.com",
    "access_mode": "open",
    "is_active": true
  }'

# Verify site was created
curl http://localhost:3000/api/sites
```

### 10. Configure Firewall (Optional but Recommended)

```bash
# Install UFW if not already installed
sudo apt install ufw -y

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## Post-Deployment Validation

### Checklist

- [ ] Backend is running and healthy
- [ ] Frontend loads in browser
- [ ] Can create a new site via UI
- [ ] Can view sites list
- [ ] Can edit site configuration
- [ ] IP validation works
- [ ] Access logs are being created
- [ ] Database is accessible
- [ ] All Docker containers are running
- [ ] Health endpoints respond correctly

### Automated Tests

```bash
# On your local machine, update playwright.config.ts baseURL
# Then run E2E tests against staging

cd packages/frontend
npx playwright test --config=playwright.config.staging.ts
```

Create `packages/frontend/playwright.config.staging.ts`:

```typescript
import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: 'http://staging.example.com',
  },
  webServer: undefined, // Don't start local server
});
```

## Monitoring Setup

### Application Logs

```bash
# View backend logs
docker-compose -f docker-compose.prod.yml logs -f backend

# View all logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Database Backups

```bash
# Create backup script
cat > ~/backup-database.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=~/backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose -f ~/geo-ip-webserver/docker-compose.prod.yml exec -T postgres \
  pg_dump -U geoip_staging geo_ip_webserver > $BACKUP_DIR/backup_$DATE.sql
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
EOF

chmod +x ~/backup-database.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * ~/backup-database.sh") | crontab -
```

### Health Monitoring

Create a simple monitoring script:

```bash
cat > ~/monitor-health.sh << 'EOF'
#!/bin/bash
HEALTH_URL="http://localhost:3000/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -ne 200 ]; then
  echo "ALERT: Backend health check failed. Status: $RESPONSE"
  # Add notification here (email, Slack, etc.)
fi
EOF

chmod +x ~/monitor-health.sh

# Add to crontab (every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * ~/monitor-health.sh") | crontab -
```

## Rollback Procedure

If deployment fails:

```bash
# Stop containers
docker-compose -f docker-compose.prod.yml down

# Checkout previous version
git checkout main~1

# Rebuild and redeploy
npm install
npm run build -w packages/backend
npm run build -w packages/frontend
docker-compose -f docker-compose.prod.yml up -d --build

# Restore database if needed
docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U geoip_staging geo_ip_webserver < ~/backups/backup_YYYYMMDD_HHMMSS.sql
```

## Known Issues and Limitations

### Phase 1 MVP Limitations

- No authentication/authorization implemented yet
- Single-server deployment only
- No CDN integration
- No advanced rate limiting
- No bot detection
- Basic monitoring only

### Planned Improvements (Future Phases)

- Phase 2: Multi-region deployment
- Phase 3: Advanced security features
- Phase 4: Analytics and reporting
- Phase 5: Performance optimizations

## Maintenance

### Updating Application

```bash
cd ~/geo-ip-webserver
git pull origin main
npm install
npm run build -w packages/backend
npm run build -w packages/frontend
docker-compose -f docker-compose.prod.yml up -d --build
```

### Updating MaxMind Databases

MaxMind databases should be updated weekly:

```bash
cat > ~/update-geoip.sh << 'EOF'
#!/bin/bash
cd ~/geo-ip-webserver/packages/backend/geoip
LICENSE_KEY="your_license_key_here"

wget -q "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${LICENSE_KEY}&suffix=tar.gz" -O GeoLite2-Country.tar.gz
wget -q "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${LICENSE_KEY}&suffix=tar.gz" -O GeoLite2-ASN.tar.gz

tar -xzf GeoLite2-Country.tar.gz --strip-components=1 --wildcards '*.mmdb' 2>/dev/null
tar -xzf GeoLite2-ASN.tar.gz --strip-components=1 --wildcards '*.mmdb' 2>/dev/null

rm *.tar.gz

docker-compose -f ~/geo-ip-webserver/docker-compose.prod.yml restart backend
EOF

chmod +x ~/update-geoip.sh

# Add to crontab (weekly on Sunday at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * 0 ~/update-geoip.sh") | crontab -
```

## Support Contacts

- **Technical Lead:** [Your Name]
- **DevOps:** [DevOps Contact]
- **On-Call:** [On-Call Schedule]

## Deployment History

| Date | Version | Deployed By | Notes |
|------|---------|-------------|-------|
| 2026-02-14 | 1.0.0-mvp | OpenCode | Initial Phase 1 MVP deployment |

---

**Deployment Status:** ✅ READY FOR STAGING  
**Last Updated:** 2026-02-14  
**Phase:** 1 (MVP - IP Access Control)
