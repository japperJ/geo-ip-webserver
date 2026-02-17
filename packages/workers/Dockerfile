# Worker Dockerfile for Screenshot Service
FROM node:22-alpine

# Install Playwright dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Playwright to use system Chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/workers/package*.json ./packages/workers/

# Install dependencies
RUN npm ci --workspace=@geo-ip-webserver/workers

# Copy worker source
COPY packages/workers ./packages/workers

# Build TypeScript
RUN npm run build --workspace=@geo-ip-webserver/workers

# Switch to worker directory
WORKDIR /app/packages/workers

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

CMD ["node", "dist/screenshotWorker.js"]
