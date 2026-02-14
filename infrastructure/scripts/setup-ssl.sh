#!/bin/bash
# Setup Let's Encrypt SSL certificates

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Let's Encrypt SSL Setup ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root${NC}"
    exit 1
fi

# Check if domain is provided
if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: $0 <domain> [email]${NC}"
    echo "Example: $0 example.com admin@example.com"
    exit 1
fi

DOMAIN=$1
EMAIL=${2:-""}

echo -e "${YELLOW}Domain: $DOMAIN${NC}"
echo -e "${YELLOW}Email: ${EMAIL:-"(not provided)"}${NC}"

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing certbot...${NC}"
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Create webroot directory for ACME challenge
mkdir -p /var/www/certbot

# Obtain certificate
if [ -z "$EMAIL" ]; then
    certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --agree-tos --register-unsafely-without-email
else
    certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email
fi

# Update nginx configuration with domain
sed -i "s/your-domain.com/$DOMAIN/g" /etc/nginx/ssl.conf

# Test nginx configuration
nginx -t

# Reload nginx
systemctl reload nginx

echo -e "${GREEN}SSL certificate successfully obtained and configured!${NC}"
echo -e "${GREEN}Auto-renewal is configured via certbot timer${NC}"

# Check certbot timer status
systemctl status certbot.timer --no-pager

echo ""
echo -e "${GREEN}=== SSL Setup Complete ===${NC}"
echo -e "${YELLOW}Test your SSL configuration at: https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN${NC}"
