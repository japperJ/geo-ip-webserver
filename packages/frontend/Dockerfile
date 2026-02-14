# Frontend Dockerfile
FROM node:20-alpine AS base

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY packages/frontend/package*.json ./packages/frontend/

# Install all dependencies
RUN npm ci --workspace=@geo-ip-webserver/frontend

# Copy frontend source code
COPY packages/frontend ./packages/frontend

# Build the frontend
RUN npm run build --workspace=@geo-ip-webserver/frontend

# Production stage with nginx
FROM nginx:alpine AS production

# Copy nginx configuration
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=base /app/packages/frontend/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
