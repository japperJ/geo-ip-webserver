# Geo-IP Webserver

Multi-site content delivery platform with geo-fencing, IP geolocation, and site-specific routing.

## Quick Start

### Prerequisites
- Node.js 22+
- Docker & Docker Compose
- Git

### Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Start infrastructure:
   ```bash
   docker-compose up -d
   ```

4. Run migrations:
   ```bash
   npm run migrate:up -w packages/backend
   ```

5. Start development servers:
   ```bash
   npm run dev
   ```

## Project Structure

- `packages/backend` - Fastify API server
- `packages/frontend` - React + Vite admin dashboard
- `packages/workers` - Background workers
- `infrastructure/` - Docker and deployment configs
- `.planning/` - Project planning and documentation

## Documentation

See [docs/](./docs/) for detailed documentation.

## License

Proprietary
