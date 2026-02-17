# Production Deployment Guide

## Overview

This guide covers deploying the Geo-IP Webserver to production with full security hardening, monitoring, and operational readiness.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [SSL/HTTPS Configuration](#sslhttps-configuration)
4. [Application Deployment](#application-deployment)
5. [Monitoring Setup](#monitoring-setup)
6. [Backups](#backups)
7. [Operational Procedures](#operational-procedures)
8. [Security Checklist](#security-checklist)

---

## Prerequisites

### System Requirements

- **OS:** Ubuntu 22.04 LTS or similar
- **CPU:** 4+ cores (8+ recommended for production)
- **RAM:** 8GB minimum (16GB+ recommended)
- **Disk:** 100GB+ SSD
- **Network:** Static IP, domain name configured

### Software Requirements

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker & Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Nginx
sudo apt install -y nginx

# Install certbot for Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx

# Install PostgreSQL client tools (for backups)
sudo apt install -y postgresql-client-16

# Install AWS CLI (for S3 backups)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

---

## Initial Setup

### 1. Clone Repository

```bash
cd /opt
sudo git clone https://github.com/yourusername/geo-ip-webserver.git
cd geo-ip-webserver
```

### 2. Create Environment File

```bash
cp .env.example .env
nano .env
```

Configure the following variables:

```env
# Database
POSTGRES_USER=geoip
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=geoip

# Application Secrets
JWT_SECRET=<64-char-random-string>
COOKIE_SECRET=<64-char-random-string>

# MinIO S3
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<strong-random-password>
S3_BUCKET=screenshots

# CORS
CORS_ORIGIN=https://yourdomain.com

# Monitoring
GRAFANA_USER=admin
GRAFANA_PASSWORD=<strong-random-password>
GRAFANA_URL=https://grafana.yourdomain.com

# Error Tracking (optional)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project

# Backup
S3_BACKUP_BUCKET=geoip-backups
```

**Generate secure secrets:**

```bash
# JWT Secret
openssl rand -base64 48

# Cookie Secret
openssl rand -base64 48
```

### 3. Create Application User

```bash
sudo useradd -r -s /bin/false geoip
sudo chown -R geoip:geoip /opt/geo-ip-webserver
```

---

## SSL/HTTPS Configuration

### 1. Setup DNS

Point your domain to your server's IP:

```
A     yourdomain.com        → 123.456.789.0
A     www.yourdomain.com    → 123.456.789.0
CNAME grafana.yourdomain.com → yourdomain.com
```

### 2. Obtain SSL Certificate

```bash
cd /opt/geo-ip-webserver
sudo bash infrastructure/scripts/setup-ssl.sh yourdomain.com admin@yourdomain.com
```

This will:
- Install certbot
- Obtain Let's Encrypt certificate
- Configure Nginx with SSL
- Setup auto-renewal

### 3. Verify SSL

Test your SSL configuration:

```bash
# Test SSL Labs rating (should be A+)
curl -s "https://api.ssllabs.com/api/v3/analyze?host=yourdomain.com&publish=off"

# Test certificate
echo | openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null | openssl x509 -noout -dates

# Verify HSTS header
curl -I https://yourdomain.com | grep -i strict-transport
```

---

## Application Deployment

### 1. Build Application

```bash
cd /opt/geo-ip-webserver

# Build backend
cd packages/backend
npm install --production
npm run build

# Build frontend
cd ../frontend
npm install
npm run build

# Download MaxMind databases (requires account)
cd ../backend/data
wget "https://download.maxmind.com/app/geoip_download?...&suffix=tar.gz" -O GeoLite2-City.tar.gz
tar -xzf GeoLite2-City.tar.gz
```

### 2. Deploy with Docker Compose

```bash
cd /opt/geo-ip-webserver

# Start full stack with monitoring
docker-compose -f docker-compose.monitoring.yml up -d

# Check logs
docker-compose logs -f backend

# Verify all services healthy
docker-compose ps
```

### 3. Run Database Migrations

```bash
docker-compose exec backend npm run migrate:up
```

### 3.1 Verify Redis queue durability policy

For BullMQ queue reliability (screenshot pipeline), Redis should use `maxmemory-policy noeviction`.

- Avoid `allkeys-*`/`volatile-*` eviction modes for queue-critical environments.
- `noeviction` makes pressure explicit instead of silently dropping queue metadata/jobs.

Verify policy:

```bash
docker-compose -f docker-compose.monitoring.yml exec redis redis-cli CONFIG GET maxmemory-policy
# expected output includes: maxmemory-policy / noeviction
```

### 4. Create Super Admin User

```bash
# Via API
curl -X POST https://yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "strong-password-here"
  }'
```

### 5. Deploy with Systemd (Alternative)

Copy systemd service files:

```bash
sudo cp infrastructure/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable geoip-webserver geoip-worker
sudo systemctl start geoip-webserver geoip-worker

# Check status
sudo systemctl status geoip-webserver
sudo journalctl -u geoip-webserver -f
```

---

## Monitoring Setup

### 1. Access Grafana

Navigate to: `https://grafana.yourdomain.com:3001`

Login: `admin` / `<GRAFANA_PASSWORD>`

### 2. Import Dashboards

Grafana dashboards are pre-configured in `infrastructure/grafana/dashboards/`

Key metrics to monitor:
- **Request Rate:** Requests per second
- **Latency:** P50, P95, P99 response times
- **Error Rate:** 5xx errors per minute
- **Cache Hit Rate:** Should be >95%
- **Database Connections:** Monitor pool usage
- **System Metrics:** CPU, memory, disk

### 3. Configure Alerts

Edit `infrastructure/prometheus/alerts.yml` to configure alerting thresholds.

Setup Alertmanager for notifications (Slack, email, PagerDuty):

```yaml
# alertmanager.yml
route:
  receiver: 'slack'
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
        channel: '#alerts'
```

### 4. Sentry Error Tracking

If using Sentry, errors are automatically captured and reported with full context.

Access: `https://sentry.io/organizations/your-org/projects/`

---

## Backups

### 1. Automated Database Backups

Setup cron job:

```bash
sudo crontab -e
```

Add:

```cron
# Daily PostgreSQL backup at 2 AM
0 2 * * * /opt/geo-ip-webserver/infrastructure/scripts/backup-database.sh >> /var/log/geoip-backup.log 2>&1
```

Configure backup script:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=geoip
export DB_USER=geoip
export DB_PASSWORD=<password>
export BACKUP_DIR=/var/backups/postgres
export S3_BUCKET=geoip-backups
export RETENTION_DAYS=30
```

### 2. Test Backup Restore

```bash
# Download latest backup
aws s3 cp s3://geoip-backups/postgres/backup_geoip_20260214.sql.gz .

# Restore to test database
gunzip -c backup_geoip_20260214.sql.gz | psql -h localhost -U geoip testdb

# Verify data
psql -h localhost -U geoip testdb -c "SELECT COUNT(*) FROM sites;"
```

### 3. Backup MinIO/S3 Screenshots

MinIO data is in Docker volume. For AWS S3, backups are not needed (already replicated).

---

## Operational Procedures

### Health Checks

```bash
# Backend health
curl https://yourdomain.com/health

# Readiness check
curl https://yourdomain.com/ready

# Prometheus metrics
curl https://yourdomain.com/metrics
```

### Scaling

**Horizontal Scaling (Multiple Instances):**

```bash
docker-compose -f docker-compose.monitoring.yml up -d --scale backend=3
```

Redis-based rate limiting and cache invalidation support multiple instances.

**Vertical Scaling (Resource Limits):**

Edit `docker-compose.monitoring.yml`:

```yaml
backend:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 4G
      reservations:
        cpus: '1'
        memory: 2G
```

### Log Rotation

Configure logrotate:

```bash
sudo nano /etc/logrotate.d/geoip
```

```
/var/log/geoip/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 geoip geoip
    sharedscripts
    postrotate
        systemctl reload geoip-webserver > /dev/null 2>&1 || true
    endscript
}
```

### Updating Application

```bash
cd /opt/geo-ip-webserver
git pull
npm run build
docker-compose -f docker-compose.monitoring.yml restart backend
```

---

## Security Checklist

### Pre-Deployment

- [ ] Strong passwords for all services (Postgres, MinIO, Grafana)
- [ ] JWT and Cookie secrets generated with `openssl rand`
- [ ] `.env` file permissions set to 600
- [ ] Firewall configured (only 80, 443, 22 open)
- [ ] SSH key authentication enabled, password auth disabled
- [ ] Fail2ban installed and configured
- [ ] SSL certificate obtained and auto-renewal configured
- [ ] Security headers verified (HSTS, CSP, X-Frame-Options)
- [ ] Rate limiting enabled (Nginx + application)
- [ ] CORS configured correctly
- [ ] Database uses strong password, not exposed publicly

### Post-Deployment

- [ ] SSL Labs test: A+ rating
- [ ] Security audit: `npm audit` shows no high/critical issues
- [ ] Prometheus alerting configured and tested
- [ ] Backups running and tested restore
- [ ] Log retention configured
- [ ] Monitoring dashboards accessible
- [ ] Health checks returning 200 OK
- [ ] Error tracking (Sentry) receiving events
- [ ] GDPR compliance reviewed
- [ ] Privacy policy published
- [ ] Legal review completed (if required)

### Ongoing

- [ ] Review access logs weekly
- [ ] Check Grafana dashboards daily
- [ ] Update dependencies monthly (`npm update`)
- [ ] Rotate secrets every 90 days
- [ ] Review Prometheus alerts
- [ ] Test backup restore quarterly
- [ ] Review MaxMind database updates

---

## Performance Benchmarks

**Expected Performance:**

- **Site Resolution:** <1ms (p95) with cache hit
- **IP Access Control:** <5ms (p95)
- **GPS Geofencing:** <10ms (p95)
- **Cache Hit Rate:** >95%
- **Screenshot Capture:** <5s (async, non-blocking)
- **Throughput:** 1000+ req/s (single instance)

**Load Testing:**

```bash
# Install k6
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Run load test
k6 run infrastructure/load-tests/site-resolution.js
```

---

## Troubleshooting

### Backend Not Starting

```bash
# Check logs
docker-compose logs backend

# Common issues:
# - Database not ready: Wait for postgres healthy
# - Redis connection failed: Check REDIS_URL
# - Missing GeoIP databases: Download from MaxMind
```

### High Latency

```bash
# Check cache hit rate
curl https://yourdomain.com/metrics | grep cache_hit_rate

# If <95%, warm cache:
docker-compose exec backend wget -qO- http://localhost:3000/admin/warm-cache
```

### SSL Certificate Renewal Failed

```bash
# Check certbot timer
sudo systemctl status certbot.timer

# Manual renewal
sudo certbot renew --dry-run
```

---

## Support

- **Documentation:** https://github.com/yourusername/geo-ip-webserver/wiki
- **Issues:** https://github.com/yourusername/geo-ip-webserver/issues
- **Monitoring:** https://grafana.yourdomain.com:3001

---

**Status:** Production Ready ✅  
**Last Updated:** 2026-02-14  
**Version:** 1.0.0
