/**
 * GPS-IP cross-validation to prevent spoofing
 */

import { calculateDistance } from './validateGPS.js';

export interface IPLocation {
  lat: number;
  lng: number;
}

export interface GPSIPValidationResult {
  valid: boolean;
  distance?: number;
  reason?: string;
}

const MAX_DISTANCE_KM = 500; // Maximum allowed distance between GPS and IP location

/**
 * Validate GPS coordinates against IP geolocation
 * Helps detect GPS spoofing
 */
export function validateGPSWithIP(
  gpsCoords: { lat: number; lng: number },
  ipLocation: IPLocation | null,
  maxDistanceKm: number = MAX_DISTANCE_KM
): GPSIPValidationResult {
  // If no IP location available, skip validation
  if (!ipLocation || !ipLocation.lat || !ipLocation.lng) {
    return { valid: true };
  }

  const distance = calculateDistance(gpsCoords, ipLocation);

  if (distance > maxDistanceKm) {
    return {
      valid: false,
      distance,
      reason: `GPS coordinates don't match IP location (${distance.toFixed(0)}km apart). Possible spoofing detected.`,
    };
  }

  return {
    valid: true,
    distance,
  };
}
