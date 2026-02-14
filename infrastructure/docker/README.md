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
```bash
docker-compose up -d
```

### View logs
```bash
docker-compose logs -f [service_name]
```

### Stop all services
```bash
docker-compose down
```

### Reset all data
```bash
docker-compose down -v
```

### Connect to PostgreSQL
```bash
docker exec -it geo-ip-postgres psql -U dev_user -d geo_ip_webserver
```

### Connect to Redis
```bash
docker exec -it geo-ip-redis redis-cli
```

## Health Checks

All services include health checks. Check status:
```bash
docker-compose ps
```
