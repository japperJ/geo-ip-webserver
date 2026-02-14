import { FastifyRequest, FastifyReply } from 'fastify';
import { getClientIP } from '../utils/getClientIP.js';
import { matchCIDR } from '../utils/matchCIDR.js';
import { Site } from '../models/Site.js';

// Extend FastifyRequest to include site and geoip
declare module 'fastify' {
  interface FastifyRequest {
    site?: Site;
  }
}

/**
 * IP-based access control middleware
 * Enforces IP allowlist/denylist, country filtering, and VPN detection
 * 
 * Prerequisites:
 * - request.site must be attached by siteResolution middleware
 * - GeoIP service must be initialized via fastify.geoip
 */
export async function ipAccessControl(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const site = request.site;

  // Skip if no site or access control disabled
  if (!site || site.access_mode === 'disabled') {
    return;
  }

  // Skip if not IP-based mode
  if (site.access_mode !== 'ip_only' && site.access_mode !== 'ip_and_geo') {
    return;
  }

  // Extract client IP
  const clientIP = getClientIP(request);
  if (!clientIP) {
    request.log.error('Unable to determine client IP');
    return reply.code(403).send({
      error: 'Forbidden',
      reason: 'ip_extraction_failed',
      message: 'Unable to determine your IP address',
    });
  }

  // 1. Check IP denylist (highest priority)
  if (site.ip_denylist && site.ip_denylist.length > 0) {
    if (matchCIDR(clientIP, site.ip_denylist)) {
      request.log.info({ clientIP, reason: 'ip_denylist' }, 'Access denied');
      return reply.code(403).send({
        error: 'Forbidden',
        reason: 'ip_denylist',
        message: 'Your IP address is blocked',
      });
    }
  }

  // 2. Check IP allowlist (if configured)
  if (site.ip_allowlist && site.ip_allowlist.length > 0) {
    if (!matchCIDR(clientIP, site.ip_allowlist)) {
      request.log.info({ clientIP, reason: 'ip_not_in_allowlist' }, 'Access denied');
      return reply.code(403).send({
        error: 'Forbidden',
        reason: 'ip_not_in_allowlist',
        message: 'Your IP address is not allowed',
      });
    }
  }

  // 3. Lookup GeoIP for country filtering and VPN detection
  const geoData = request.server.geoip.lookup(clientIP);

  // 4. Check country denylist
  if (site.country_denylist && site.country_denylist.length > 0) {
    const country = geoData?.countryCode;
    if (country && site.country_denylist.includes(country)) {
      request.log.info({ clientIP, country, reason: 'country_blocked' }, 'Access denied');
      return reply.code(403).send({
        error: 'Forbidden',
        reason: 'country_blocked',
        message: `Access from ${country} is not allowed`,
        country,
      });
    }
  }

  // 5. Check country allowlist
  if (site.country_allowlist && site.country_allowlist.length > 0) {
    const country = geoData?.countryCode;
    if (!country || !site.country_allowlist.includes(country)) {
      request.log.info({ clientIP, country, reason: 'country_not_allowed' }, 'Access denied');
      return reply.code(403).send({
        error: 'Forbidden',
        reason: 'country_not_allowed',
        message: 'Access from your country is not allowed',
        country: country || 'unknown',
      });
    }
  }

  // 6. VPN/Proxy detection (if enabled)
  if (site.block_vpn_proxy) {
    const anonCheck = request.server.geoip.isAnonymous(clientIP);
    
    if (anonCheck.isVpn || anonCheck.isProxy || anonCheck.isHosting || anonCheck.isTor) {
      request.log.info({ clientIP, anonCheck, reason: 'vpn_proxy_detected' }, 'Access denied');
      return reply.code(403).send({
        error: 'Forbidden',
        reason: 'vpn_proxy_detected',
        message: 'VPN, proxy, or hosting provider IPs are not allowed',
        details: anonCheck,
      });
    }
  }

  // All checks passed - continue to route handler
  request.log.debug({ clientIP }, 'IP access control passed');
}
