# Deployment Guide

This guide covers deploying the Geo-IP Webserver to production environments.

## Prerequisites

- Ubuntu 22.04 LTS (or similar Linux distribution)
- Docker & Docker Compose installed
- Domain name with DNS configured
- SSL certificate (Let's Encrypt recommended)
- At least 2GB RAM, 20GB disk space
- MaxMind GeoLite2 license key (free account)

## Deployment Options

### Option 1: Docker Compose (Recommended)

This is the simplest deployment method for single-server deployments.

#### 1. Prepare the Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Create deployment user
sudo useradd -m -s /bin/bash geoip
sudo usermod -aG docker geoip
```

#### 2. Clone Repository

```bash
sudo -u geoip bash
cd ~
git clone <repository-url> geo-ip-webserver
cd geo-ip-webserver
```

#### 3. Configure Environment

```bash
# Backend environment
cat > packages/backend/.env << EOF
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=geo_ip_webserver
DATABASE_USER=geoip_user
DATABASE_PASSWORD=$(openssl rand -base64 32)

GEOIP_COUNTRY_DB_PATH=./geoip/GeoLite2-Country.mmdb
GEOIP_ASN_DB_PATH=./geoip/GeoLite2-ASN.mmdb

LOG_RETENTION_DAYS=90
EOF

# Frontend environment
cat > packages/frontend/.env << EOF
VITE_API_URL=https://api.yourdomain.com
EOF

# Docker Compose environment
cat > .env << EOF
POSTGRES_USER=geoip_user
POSTGRES_PASSWORD=$(grep DATABASE_PASSWORD packages/backend/.env | cut -d= -f2)
POSTGRES_DB=geo_ip_webserver
EOF
```

#### 4. Download MaxMind Databases

```bash
# Register for free account at https://www.maxmind.com/en/geolite2/signup
# Get your license key

cd packages/backend/geoip

# Download databases
wget "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=YOUR_LICENSE_KEY&suffix=tar.gz" -O GeoLite2-Country.tar.gz
wget "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=YOUR_LICENSE_KEY&suffix=tar.gz" -O GeoLite2-ASN.tar.gz

# Extract
tar -xzf GeoLite2-Country.tar.gz --strip-components=1 --wildcards '*.mmdb'
tar -xzf GeoLite2-ASN.tar.gz --strip-components=1 --wildcards '*.mmdb'

# Cleanup
rm *.tar.gz
cd ../../..
```

#### 5. Build and Start Services

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

#### 6. Run Database Migrations

```bash
docker-compose -f docker-compose.prod.yml exec backend npm run migrate:up
```

#### 7. Create First Admin Site

```bash
# Using curl
curl -X POST http://localhost:3000/api/sites \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "admin",
    "name": "Admin Dashboard",
    "hostname": "admin.yourdomain.com",
    "access_mode": "open",
    "is_active": true
  }'
```

### Option 2: Nginx Reverse Proxy

#### 1. Install Nginx

```bash
sudo apt install nginx -y
```

#### 2. Configure Nginx for Backend API

```bash
sudo nano /etc/nginx/sites-available/geoip-api
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
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

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

#### 3. Configure Nginx for Frontend

```bash
sudo nano /etc/nginx/sites-available/geoip-admin
```

```nginx
server {
    listen 80;
    server_name admin.yourdomain.com;

    root /home/geoip/geo-ip-webserver/packages/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

#### 4. Enable Sites and Restart Nginx

```bash
sudo ln -s /etc/nginx/sites-available/geoip-api /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/geoip-admin /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

#### 5. Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificates
sudo certbot --nginx -d api.yourdomain.com -d admin.yourdomain.com

# Certbot will automatically configure HTTPS and set up renewal
```

### Option 3: Systemd Services (Without Docker)

#### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs -y
```

#### 2. Install PostgreSQL

```bash
sudo apt install postgresql postgresql-contrib postgis -y

# Create database and user
sudo -u postgres psql << EOF
CREATE USER geoip_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE geo_ip_webserver OWNER geoip_user;
\c geo_ip_webserver
CREATE EXTENSION postgis;
GRANT ALL PRIVILEGES ON DATABASE geo_ip_webserver TO geoip_user;
EOF
```

#### 3. Build Application

```bash
cd ~/geo-ip-webserver

# Install dependencies
npm install

# Build backend
npm run build -w packages/backend

# Build frontend
npm run build -w packages/frontend
```

#### 4. Create Systemd Service for Backend

```bash
sudo nano /etc/systemd/system/geoip-backend.service
```

```ini
[Unit]
Description=Geo-IP Webserver Backend
After=network.target postgresql.service

[Service]
Type=simple
User=geoip
WorkingDirectory=/home/geoip/geo-ip-webserver/packages/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 5. Enable and Start Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable backend service
sudo systemctl enable geoip-backend

# Start backend service
sudo systemctl start geoip-backend

# Check status
sudo systemctl status geoip-backend

# View logs
sudo journalctl -u geoip-backend -f
```

## Production Checklist

### Security

- [ ] Change all default passwords
- [ ] Enable firewall (UFW or iptables)
- [ ] Configure fail2ban for SSH protection
- [ ] Enable SSL/TLS (HTTPS)
- [ ] Restrict database access to localhost
- [ ] Set up regular security updates
- [ ] Configure Content Security Policy headers
- [ ] Enable rate limiting

### Monitoring

- [ ] Set up log rotation (logrotate)
- [ ] Configure monitoring (Prometheus/Grafana)
- [ ] Set up uptime monitoring
- [ ] Configure alerting (email/Slack)
- [ ] Monitor disk space
- [ ] Monitor database performance

### Backups

- [ ] Configure automated database backups
- [ ] Set up offsite backup storage
- [ ] Test backup restoration
- [ ] Document backup procedures

### Performance

- [ ] Enable gzip compression in Nginx
- [ ] Configure CDN for static assets
- [ ] Set up database connection pooling
- [ ] Configure caching headers
- [ ] Enable HTTP/2 in Nginx

## Maintenance

### Updating the Application

```bash
cd ~/geo-ip-webserver

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Build
npm run build -w packages/backend
npm run build -w packages/frontend

# Run migrations
npm run migrate:up -w packages/backend

# Restart services
docker-compose -f docker-compose.prod.yml restart
# OR
sudo systemctl restart geoip-backend
sudo systemctl reload nginx
```

### Database Backups

```bash
# Backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U geoip_user geo_ip_webserver > backup_$(date +%Y%m%d).sql

# Restore
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U geoip_user geo_ip_webserver < backup_20260214.sql
```

### Log Rotation

Create `/etc/logrotate.d/geoip`:

```
/home/geoip/geo-ip-webserver/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 geoip geoip
    sharedscripts
    postrotate
        systemctl reload geoip-backend
    endscript
}
```

## Troubleshooting

### Backend Won't Start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs backend
# OR
sudo journalctl -u geoip-backend -n 100

# Common issues:
# - Database not ready: Wait and retry
# - Port already in use: Check with `sudo lsof -i :3000`
# - Environment variables: Verify .env file
```

### Database Connection Issues

```bash
# Test database connection
docker-compose -f docker-compose.prod.yml exec postgres psql -U geoip_user -d geo_ip_webserver -c "SELECT 1;"

# Check if PostgreSQL is running
docker-compose -f docker-compose.prod.yml ps postgres
```

### Frontend Not Loading

```bash
# Check if files are built
ls -la packages/frontend/dist/

# Verify Nginx configuration
sudo nginx -t

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

## Performance Tuning

### PostgreSQL

Edit `/etc/postgresql/14/main/postgresql.conf`:

```conf
# Memory
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 16MB

# Connections
max_connections = 100

# WAL
wal_buffers = 8MB
checkpoint_completion_target = 0.9
```

### Node.js Backend

Set environment variables:

```bash
NODE_ENV=production
UV_THREADPOOL_SIZE=64
```

## Support

For deployment issues:
- Check application logs
- Review Nginx error logs
- Verify environment variables
- Ensure all services are running
- Check firewall rules
