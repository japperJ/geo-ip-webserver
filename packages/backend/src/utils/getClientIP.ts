import { FastifyRequest } from 'fastify';
import { isValid } from 'ipaddr.js';

/**
 * Extract real client IP from request
 * Handles X-Forwarded-For, X-Real-IP headers
 * 
 * SECURITY: Only use with trustProxy enabled in Fastify
 * and when behind a trusted reverse proxy (Nginx, Cloudflare, etc.)
 */
export function getClientIP(request: FastifyRequest): string | null {
  // 1. Check X-Forwarded-For (standard for proxied requests)
  const xForwardedFor = request.headers['x-forwarded-for'];
  if (xForwardedFor) {
    // X-Forwarded-For can be comma-separated: "client, proxy1, proxy2"
    // Leftmost IP is the original client
    const ips = Array.isArray(xForwardedFor)
      ? xForwardedFor[0].split(',')
      : xForwardedFor.split(',');
    
    const clientIP = ips[0].trim();
    if (isValid(clientIP)) {
      return clientIP;
    }
  }

  // 2. Check X-Real-IP (set by Nginx proxy_pass)
  const xRealIP = request.headers['x-real-ip'];
  if (typeof xRealIP === 'string' && isValid(xRealIP)) {
    return xRealIP;
  }

  // 3. Fallback to socket remote address
  const socketIP = request.socket.remoteAddress;
  if (socketIP && isValid(socketIP)) {
    return socketIP;
  }

  return null;
}
