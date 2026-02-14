import { FastifyRequest } from 'fastify';
import * as ipaddr from 'ipaddr.js';

/**
 * Validate if a string is a valid IP address
 */
function isValidIP(ip: string): boolean {
  try {
    ipaddr.parse(ip);
    return true;
  } catch {
    return false;
  }
}

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
    if (isValidIP(clientIP)) {
      return clientIP;
    }
  }

  // 2. Check X-Real-IP (set by Nginx proxy_pass)
  const xRealIP = request.headers['x-real-ip'];
  if (typeof xRealIP === 'string' && isValidIP(xRealIP)) {
    return xRealIP;
  }

  // 3. Fallback to socket remote address
  const socketIP = request.socket.remoteAddress;
  if (socketIP && isValidIP(socketIP)) {
    return socketIP;
  }

  return null;
}
