# Canonical Entrypoints (Phase G)

Phase G establishes explicit, stable entrypoints so smoke checks and local verification are deterministic.

## Entrypoint matrix

| Mode | Surface | Base URL | Notes |
|---|---|---|---|
| Docker full stack (canonical for smoke) | Proxy (frontend + API + docs via nginx) | `http://localhost:8080` | Preferred user-facing entrypoint for operational smoke. |
| Docker full stack (canonical for smoke) | Direct backend | `http://localhost:3001` | Used by smoke for direct backend health/docs/auth checks. |
| Dev hot reload | Frontend | `http://localhost:5173` | Vite frontend. |
| Dev hot reload | Backend | `http://localhost:3000` | Fastify backend. |

## Endpoint expectations

### Direct backend

- `GET http://localhost:3001/health` -> 200
- `GET http://localhost:3001/documentation` -> 200
- `GET http://localhost:3001/documentation/json` -> 200
- Auth sanity endpoints:
  - `POST http://localhost:3001/api/auth/register`
  - `POST http://localhost:3001/api/auth/login`
  - `GET http://localhost:3001/api/auth/me`
  - `POST http://localhost:3001/api/auth/refresh`

### Proxy

- `GET http://localhost:8080/documentation` -> 200
- `GET http://localhost:8080/documentation/json` -> 200

## Smoke defaults

The root smoke command defaults to the canonical docker full-stack entrypoints:

- `BACKEND_BASE_URL=http://localhost:3001`
- `PROXY_BASE_URL=http://localhost:8080`
- `PLAYWRIGHT_BASE_URL=http://localhost:8080`
