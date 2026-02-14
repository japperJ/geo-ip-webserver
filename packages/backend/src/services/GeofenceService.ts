/**
 * Geofence validation service using PostGIS
 */

import { FastifyInstance } from 'fastify';
import { GPSCoordinates } from '../utils/validateGPS.js';
import type { Polygon, Point } from 'geojson';

export interface GeofenceCheckResult {
  allowed: boolean;
  reason?: string;
  distance?: number;
}

export interface GeofenceConfig {
  type: 'polygon' | 'radius';
  polygon?: Polygon;
  center?: Point;
  radius_km?: number;
}

/**
 * GeofenceService - PostGIS-based geofence validation
 */
export class GeofenceService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Check if GPS coordinates are within a polygon geofence
   * Uses PostGIS ST_Within with accuracy buffering
   */
  async checkPolygonGeofence(
    coords: GPSCoordinates,
    polygon: Polygon
  ): Promise<GeofenceCheckResult> {
    const accuracyBufferKm = coords.accuracy
      ? (coords.accuracy * 1.5) / 1000 // Convert meters to km with 1.5x buffer
      : 0;

    const query = `
      SELECT ST_Within(
        ST_Buffer(
          ST_MakePoint($1, $2)::geography,
          $3
        )::geometry,
        ST_GeomFromGeoJSON($4)::geometry
      ) as within
    `;

    try {
      const result = await (this.fastify as any).pg.query(query, [
        coords.lng,
        coords.lat,
        accuracyBufferKm * 1000, // Convert km to meters
        JSON.stringify(polygon),
      ]);

      const isWithin = result.rows[0]?.within === true;

      return {
        allowed: isWithin,
        reason: isWithin ? undefined : 'outside_geofence',
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'Polygon geofence check failed');
      throw new Error('Geofence validation failed');
    }
  }

  /**
   * Check if GPS coordinates are within a radius geofence
   */
  async checkRadiusGeofence(
    coords: GPSCoordinates,
    center: Point,
    radiusKm: number
  ): Promise<GeofenceCheckResult> {
    const accuracyBufferKm = coords.accuracy
      ? (coords.accuracy * 1.5) / 1000
      : 0;

    const effectiveRadiusKm = radiusKm + accuracyBufferKm;

    const query = `
      SELECT ST_DWithin(
        ST_MakePoint($1, $2)::geography,
        ST_MakePoint($3, $4)::geography,
        $5
      ) as within,
      ST_Distance(
        ST_MakePoint($1, $2)::geography,
        ST_MakePoint($3, $4)::geography
      ) / 1000 as distance_km
    `;

    try {
      const result = await (this.fastify as any).pg.query(query, [
        coords.lng,
        coords.lat,
        center.coordinates[0],
        center.coordinates[1],
        effectiveRadiusKm * 1000, // Convert to meters
      ]);

      const isWithin = result.rows[0]?.within === true;
      const distance = parseFloat(result.rows[0]?.distance_km || '0');

      return {
        allowed: isWithin,
        distance,
        reason: isWithin ? undefined : 'outside_geofence',
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'Radius geofence check failed');
      throw new Error('Geofence validation failed');
    }
  }

  /**
   * Main geofence check - dispatches to polygon or radius check
   */
  async checkGeofence(
    coords: GPSCoordinates,
    geofence: GeofenceConfig
  ): Promise<GeofenceCheckResult> {
    if (geofence.type === 'polygon' && geofence.polygon) {
      return this.checkPolygonGeofence(coords, geofence.polygon);
    } else if (
      geofence.type === 'radius' &&
      geofence.center &&
      geofence.radius_km
    ) {
      return this.checkRadiusGeofence(
        coords,
        geofence.center,
        geofence.radius_km
      );
    }

    return {
      allowed: false,
      reason: 'invalid_geofence_config',
    };
  }
}

/**
 * Create GeofenceService instance
 */
export function createGeofenceService(
  fastify: FastifyInstance
): GeofenceService {
  return new GeofenceService(fastify);
}
