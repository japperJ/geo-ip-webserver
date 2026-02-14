# Backend Dockerfile
FROM node:20-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/

# Install all dependencies
RUN npm ci --workspace=@geo-ip-webserver/backend

# Copy backend source code
COPY packages/backend ./packages/backend

# Build TypeScript
RUN npm run build --workspace=@geo-ip-webserver/backend

# Production stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/

# Install production dependencies only
RUN npm ci --workspace=@geo-ip-webserver/backend --omit=dev

# Copy built files from build stage
COPY --from=base /app/packages/backend/dist ./packages/backend/dist
COPY --from=base /app/packages/backend/migrations ./packages/backend/migrations

# Create directory for GeoIP databases (optional)
RUN mkdir -p /app/packages/backend/data

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "packages/backend/dist/index.js"]
