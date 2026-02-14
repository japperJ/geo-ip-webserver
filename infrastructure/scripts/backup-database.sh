#!/bin/bash
# Automated PostgreSQL backup script

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-geoip}"
DB_USER="${DB_USER:-postgres}"
S3_BUCKET="${S3_BUCKET:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql.gz"

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== PostgreSQL Backup ===${NC}"
echo "Database: $DB_NAME"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Perform backup
echo -e "${YELLOW}Creating backup...${NC}"
PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    --verbose \
    | gzip > "$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}Backup created successfully: $BACKUP_FILE ($BACKUP_SIZE)${NC}"
else
    echo -e "${RED}Backup failed!${NC}"
    exit 1
fi

# Upload to S3 if configured
if [ -n "$S3_BUCKET" ]; then
    echo -e "${YELLOW}Uploading to S3: $S3_BUCKET${NC}"
    aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/postgres/" --storage-class STANDARD_IA
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}S3 upload successful${NC}"
    else
        echo -e "${RED}S3 upload failed!${NC}"
    fi
fi

# Delete old backups
echo -e "${YELLOW}Cleaning up old backups (older than $RETENTION_DAYS days)...${NC}"
find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

# Count remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f | wc -l)
echo -e "${GREEN}Backup complete! Total backups: $BACKUP_COUNT${NC}"

# Delete old S3 backups if configured
if [ -n "$S3_BUCKET" ]; then
    echo -e "${YELLOW}Cleaning up old S3 backups...${NC}"
    CUTOFF_DATE=$(date -d "$RETENTION_DAYS days ago" +%Y%m%d)
    aws s3 ls "s3://$S3_BUCKET/postgres/" | while read -r line; do
        FILE_DATE=$(echo "$line" | awk '{print $4}' | grep -oP 'backup_[^_]+_\K[0-9]{8}')
        if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" -lt "$CUTOFF_DATE" ]; then
            FILE_NAME=$(echo "$line" | awk '{print $4}')
            echo "Deleting old S3 backup: $FILE_NAME"
            aws s3 rm "s3://$S3_BUCKET/postgres/$FILE_NAME"
        fi
    done
fi

echo ""
echo -e "${GREEN}=== Backup Complete ===${NC}"
