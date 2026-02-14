/**
 * GPS validation utilities
 */

export interface GPSCoordinates {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface GPSValidationResult {
  valid: boolean;
  reason?: string;
}

const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;
const MAX_ACCURACY_METERS = 100; // Default threshold

/**
 * Validate GPS coordinates
 */
export function validateGPS(
  coords: GPSCoordinates,
  maxAccuracyMeters: number = MAX_ACCURACY_METERS
): GPSValidationResult {
  // Validate latitude range
  if (coords.lat < MIN_LATITUDE || coords.lat > MAX_LATITUDE) {
    return {
      valid: false,
      reason: `Invalid latitude: ${coords.lat}. Must be between ${MIN_LATITUDE} and ${MAX_LATITUDE}`,
    };
  }

  // Validate longitude range
  if (coords.lng < MIN_LONGITUDE || coords.lng > MAX_LONGITUDE) {
    return {
      valid: false,
      reason: `Invalid longitude: ${coords.lng}. Must be between ${MIN_LONGITUDE} and ${MAX_LONGITUDE}`,
    };
  }

  // Validate accuracy if provided
  if (coords.accuracy !== undefined) {
    if (coords.accuracy < 0) {
      return {
        valid: false,
        reason: `Invalid accuracy: ${coords.accuracy}. Must be >= 0`,
      };
    }

    if (coords.accuracy > maxAccuracyMeters) {
      return {
        valid: false,
        reason: `GPS accuracy too low: ${coords.accuracy}m. Maximum allowed: ${maxAccuracyMeters}m. Please try outdoors.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Calculate Haversine distance between two GPS coordinates (in km)
 */
export function calculateDistance(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) *
      Math.cos(toRadians(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
