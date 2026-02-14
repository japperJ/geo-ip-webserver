# Phase 3 Deployment Guide

## Quick Start

### 1. Environment Variables

Add to `packages/backend/.env`:

```bash
# Auth & Security (CHANGE IN PRODUCTION!)
JWT_SECRET=change-this-jwt-secret-in-production-min-32-chars
COOKIE_SECRET=change-this-cookie-secret-in-production-min-32-chars

# Redis (required for caching)
REDIS_URL=redis://localhost:6380
```

### 2. Run Migrations

The auth migration creates:
- `users` table
- `user_site_roles` table  
- `refresh_tokens` table

Already applied via `run-auth-migration.mjs` script.

### 3. Start Server

```bash
npm run dev -w packages/backend
```

Server will:
- Connect to PostgreSQL and Redis
- Warm site cache (top 100 sites)
- Subscribe to cache invalidation channel
- Listen on http://localhost:3000

## Testing

### 1. Create Super Admin (First User)

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123"
  }'
```

Response:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "global_role": "super_admin"
  },
  "message": "First user created as super admin"
}
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123"
  }' \
  --cookie-jar cookies.txt
```

Response:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

Note: Refresh token is set in HttpOnly cookie (`cookies.txt`).

### 3. Access Protected Route

```bash
export TOKEN="<access_token_from_login>"

curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Create a Site (Super Admin)

```bash
curl -X POST http://localhost:3000/api/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "test-site",
    "name": "Test Site",
    "hostname": "test.example.com",
    "access_mode": "disabled"
  }'
```

### 5. Register Regular User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

Response:
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "global_role": "user"
  }
}
```

### 6. Grant Site Role (Super Admin)

```bash
export SITE_ID="<site_id>"
export USER_ID="<user_id>"

curl -X POST "http://localhost:3000/api/sites/$SITE_ID/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$USER_ID'",
    "role": "admin"
  }'
```

Roles: `admin` (edit site) or `viewer` (read-only)

### 7. List Site Roles

```bash
curl "http://localhost:3000/api/sites/$SITE_ID/roles" \
  -H "Authorization: Bearer $TOKEN"
```

### 8. Refresh Access Token

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  --cookie cookies.txt
```

Response:
```json
{
  "success": true,
  "accessToken": "new-token..."
}
```

### 9. Logout

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  --cookie cookies.txt
```

Revokes refresh token and clears cookie.

### 10. Cache Metrics

```bash
curl http://localhost:3000/metrics
```

Response:
```json
{
  "cache": {
    "memoryHits": 150,
    "redisHits": 20,
    "dbHits": 5,
    "totalRequests": 175,
    "hitRate": 97.14,
    "memorySize": 3
  }
}
```

## RBAC Roles

### Global Roles (users.global_role)

1. **super_admin**
   - Access ALL sites
   - Create/delete sites
   - Grant/revoke site roles
   - First user automatically becomes super_admin

2. **user**
   - Access only assigned sites
   - Cannot create sites
   - Cannot grant roles

### Site Roles (user_site_roles.role)

1. **admin**
   - View site settings
   - Edit site settings
   - View access logs
   - View site roles

2. **viewer**
   - View site settings (read-only)
   - View access logs
   - Cannot edit anything

## API Endpoints

### Authentication (`/api/auth/`)

| Method | Endpoint   | Auth Required | Description                |
|--------|-----------|---------------|----------------------------|
| POST   | /register | No            | Create user account        |
| POST   | /login    | No            | Login, get tokens          |
| POST   | /refresh  | Cookie        | Refresh access token       |
| POST   | /logout   | Cookie        | Revoke refresh token       |
| GET    | /me       | Bearer        | Get current user           |

### Sites (`/api/sites/`)

| Method | Endpoint        | Role Required    | Description              |
|--------|-----------------|------------------|--------------------------|
| POST   | /               | super_admin      | Create site              |
| GET    | /               | Any auth user    | List accessible sites    |
| GET    | /:id            | Site access      | Get site details         |
| PATCH  | /:id            | Site admin       | Update site settings     |
| DELETE | /:id            | super_admin      | Delete site              |

### Site Roles (`/api/sites/:id/roles`)

| Method | Endpoint       | Role Required    | Description            |
|--------|----------------|------------------|------------------------|
| POST   | /              | super_admin      | Grant site role        |
| GET    | /              | Site access      | List site roles        |
| DELETE | /:userId       | super_admin      | Revoke site role       |

## Caching Architecture

### Lookup Flow

```
Request → Memory Cache (LRU)
           ↓ Miss
        Redis Cache
           ↓ Miss
        PostgreSQL
           ↓
        Populate all caches
```

### Cache Layers

1. **Memory (LRU)**
   - Max: 1000 sites
   - TTL: 60 seconds
   - Per-instance

2. **Redis**
   - TTL: 300 seconds (5 minutes)
   - Shared across instances
   - Key: `site:hostname:<hostname>`

3. **Database**
   - Source of truth
   - Only queried on cache miss

### Invalidation

When site updated:
1. Clear memory cache (local)
2. Clear Redis cache
3. Publish to `cache:invalidate:site` channel
4. All instances receive event → clear memory cache

## Security

### Passwords
- Bcrypt hashing (12 rounds)
- Minimum 8 characters
- Validated on registration

### Tokens
- **Access Token:** JWT, 15-minute expiry
- **Refresh Token:** UUID, 7-day expiry, database-stored
- HttpOnly cookies (sameSite: strict)
- Revocable via logout

### SQL Injection
- All queries use parameterized statements
- No string concatenation

### RBAC
- Enforced via middleware on every route
- JWT contains userId, role, sites map
- Super admin automatically has access to all sites

## Production Deployment

### Required Changes

1. **Secrets** (CRITICAL!)
   ```bash
   # Generate secure secrets (min 32 chars)
   JWT_SECRET=$(openssl rand -hex 32)
   COOKIE_SECRET=$(openssl rand -hex 32)
   ```

2. **Environment**
   ```bash
   NODE_ENV=production
   CORS_ORIGIN=https://yourdomain.com
   ```

3. **Redis**
   - Use managed Redis (AWS ElastiCache, Redis Cloud)
   - Enable persistence (AOF + RDB)
   - Set maxmemory policy: allkeys-lru

4. **PostgreSQL**
   - Use connection pooling
   - Enable SSL: `DATABASE_URL=postgresql://...?sslmode=require`

5. **HTTPS**
   - Cookies require `secure: true` in production
   - Use reverse proxy (Nginx, Caddy) with Let's Encrypt

### Scaling

**Horizontal Scaling:**
- Multiple backend instances
- Redis pub/sub ensures cache consistency
- Shared PostgreSQL + Redis

**Load Balancing:**
- Sticky sessions recommended (for cookies)
- Or use JWT-only (no cookies)

## Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected"
}
```

### Cache Performance

Monitor `hitRate` in `/metrics`:
- **Good:** >95%
- **Warning:** 90-95%
- **Bad:** <90%

Low hit rate → Increase memory cache size or Redis TTL.

## Troubleshooting

### "Invalid or expired token"
- Access token expired (15 min) → Refresh
- Refresh token expired (7 days) → Re-login

### "You do not have access to this site"
- User not assigned to site
- Super admin needed to grant role

### Cache hit rate low
- Check Redis connection: `redis-cli ping`
- Increase `MEMORY_CACHE_MAX` in CacheService.ts
- Increase Redis TTL

### "Email already registered"
- User exists, use different email
- Or login with existing account

## Next Steps

- **Frontend:** Build React UI for user management
- **Phase 4:** Screenshots, audit logs, GDPR
- **Phase 5:** Production hardening, rate limiting, monitoring

---

**Phase 3 deployed successfully!** 🎉
