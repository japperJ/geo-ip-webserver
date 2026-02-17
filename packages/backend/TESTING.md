# Backend Testing Guide

## Screenshot pipeline integration test

The screenshot integration gate is implemented in:

- `src/tests/integration/screenshotPipeline.test.ts`

Run it with:

- `npm run test:integration:screenshot -w packages/backend`

### Environment contract

Required environment variables:

- `AWS_S3_ENDPOINT`
- `AWS_S3_ACCESS_KEY_ID`
- `AWS_S3_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET`

Recommended (MinIO defaults in this repo):

- `AWS_S3_REGION=us-east-1`
- `AWS_S3_FORCE_PATH_STYLE=true`

Optional enforcement flag (recommended for CI integration gate):

- `REQUIRE_SCREENSHOT_INTEGRATION_ENV=true`

Behavior:

- If required S3 variables are missing, the suite is skipped with a visible warning and a pointer to this file.
- If `REQUIRE_SCREENSHOT_INTEGRATION_ENV=true`, missing required S3 variables fail fast.

### Local recipe (Docker + MinIO)

Use the repo root compose stack (ports match `docker-compose.yml`):

- PostgreSQL: `localhost:5434`
- Redis: `localhost:6380`
- MinIO S3 API: `http://localhost:9002`

1. Start infrastructure:
   - `docker compose up -d postgres redis minio createbuckets`
2. Run screenshot integration test with env:
   - `AWS_S3_ENDPOINT=http://localhost:9002`
   - `AWS_S3_ACCESS_KEY_ID=minioadmin`
   - `AWS_S3_SECRET_ACCESS_KEY=minioadmin123`
   - `AWS_S3_BUCKET=site-assets`
   - `AWS_S3_REGION=us-east-1`
   - `AWS_S3_FORCE_PATH_STYLE=true`
   - `REQUIRE_SCREENSHOT_INTEGRATION_ENV=true`

### Redis policy requirement for queue reliability

For integration/staging contexts that run BullMQ screenshot jobs, Redis must use:

- `maxmemory-policy noeviction`

Why:

- Eviction policies such as `allkeys-lru` can silently drop queue metadata/jobs under memory pressure.
- `noeviction` prefers explicit backpressure/errors instead of silent job loss.

Verify Redis policy:

- `redis-cli -h localhost -p 6380 CONFIG GET maxmemory-policy`
- Expected: `maxmemory-policy` then `noeviction`
