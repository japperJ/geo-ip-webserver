/**
 * GPS-based access control middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { validateGPS, GPSCoordinates } from '../utils/validateGPS.js';
import { validateGPSWithIP } from '../utils/validateGPSWithIP.js';
import { GeofenceService } from '../services/GeofenceService.js';
import { Site } from '../models/Site.js';

export interface GPSAccessControlContext {
  site: Site;
  geoipService: any;
  geofenceService: GeofenceService;
}

/**
 * Extract GPS coordinates from request
 */
function extractGPSCoordinates(request: FastifyRequest): GPSCoordinates | null {
  const body = request.body as any;

  if (!body || typeof body !== 'object') {
    return null;
  }

  const { gps_lat, gps_lng, gps_accuracy } = body;

  if (
    typeof gps_lat !== 'number' ||
    typeof gps_lng !== 'number' ||
    isNaN(gps_lat) ||
    isNaN(gps_lng)
  ) {
    return null;
  }

  return {
    lat: gps_lat,
    lng: gps_lng,
    accuracy:
      typeof gps_accuracy === 'number' && !isNaN(gps_accuracy)
        ? gps_accuracy
        : undefined,
  };
}

/**
 * GPS access control middleware
 * Validates GPS coordinates and checks geofence
 */
export async function gpsAccessControl(
  request: FastifyRequest,
  reply: FastifyReply,
  context: GPSAccessControlContext
): Promise<void> {
  const { site, geoipService, geofenceService } = context;

  // Skip if access mode doesn't require GPS
  if (site.access_mode === 'disabled' || site.access_mode === 'ip_only') {
    return;
  }

  // Extract GPS coordinates from request
  const gpsCoords = extractGPSCoordinates(request);

  if (!gpsCoords) {
    return reply.status(403).send({
      error: 'GPS coordinates required',
      reason: 'gps_required',
      message: 'This site requires GPS location verification.',
    });
  }

  // Validate GPS coordinates
  const gpsValidation = validateGPS(gpsCoords, 100); // 100m accuracy threshold
  if (!gpsValidation.valid) {
    request.log.warn({ reason: gpsValidation.reason }, 'GPS validation failed');
    return reply.status(403).send({
      error: 'Invalid GPS coordinates',
      reason: 'gps_invalid',
      message: gpsValidation.reason,
    });
  }

  // Cross-validate GPS with IP geolocation (anti-spoofing)
  // If GeoIP service is unavailable, skip spoofing check (degraded mode)
  if (geoipService) {
    const ipGeo = await geoipService.lookup(
      (request as any).clientIP || request.ip
    );
    
    if (ipGeo?.location) {
      const gpsIpValidation = validateGPSWithIP(
        gpsCoords,
        {
          lat: ipGeo.location.latitude,
          lng: ipGeo.location.longitude,
        },
        500 // 500km max distance
      );

      if (!gpsIpValidation.valid) {
        request.log.warn(
          {
            gps: gpsCoords,
            ip: ipGeo.location,
            distance: gpsIpValidation.distance,
          },
          'GPS-IP cross-validation failed'
        );
        return reply.status(403).send({
          error: 'GPS validation failed',
          reason: 'gps_ip_mismatch',
          message: gpsIpValidation.reason,
        });
      }
    }
  } else {
    request.log.warn('GeoIP service unavailable - skipping GPS anti-spoofing check');
  }

  // Check geofence if configured
  if (site.geofence_type) {
    const geofenceResult = await geofenceService.checkGeofence(gpsCoords, {
      type: site.geofence_type,
      polygon: site.geofence_polygon || undefined,
      center: site.geofence_center || undefined,
      radius_km: site.geofence_radius_km || undefined,
    });

    if (!geofenceResult.allowed) {
      request.log.info(
        { coords: gpsCoords, reason: geofenceResult.reason },
        'GPS outside geofence'
      );
      return reply.status(403).send({
        error: 'Access denied',
        reason: 'outside_geofence',
        message: 'You are outside the allowed area.',
      });
    }
  }

  // GPS validation passed
  request.log.debug({ coords: gpsCoords }, 'GPS access control passed');
}
