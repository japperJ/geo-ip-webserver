import { describe, it, expect } from 'vitest';
import { validateGPSWithIP } from '../validateGPSWithIP';

describe('validateGPSWithIP', () => {
  it('should pass when GPS and IP location are close', () => {
    const gps = { lat: 37.7749, lng: -122.4194 };
    const ip = { lat: 37.7849, lng: -122.4094 };
    const result = validateGPSWithIP(gps, ip, 500);
    expect(result.valid).toBe(true);
    expect(result.distance).toBeLessThan(2);
  });

  it('should fail when GPS and IP location are far apart', () => {
    const gps = { lat: 37.7749, lng: -122.4194 }; // San Francisco
    const ip = { lat: 34.0522, lng: -118.2437 }; // Los Angeles
    const result = validateGPSWithIP(gps, ip, 500);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('don\'t match IP location');
  });

  it('should pass when IP location is null', () => {
    const gps = { lat: 37.7749, lng: -122.4194 };
    const result = validateGPSWithIP(gps, null, 500);
    expect(result.valid).toBe(true);
  });

  it('should use custom max distance', () => {
    const gps = { lat: 37.7749, lng: -122.4194 };
    const ip = { lat: 37.8, lng: -122.3 }; // ~15km away
    const resultStrict = validateGPSWithIP(gps, ip, 10);
    const resultRelaxed = validateGPSWithIP(gps, ip, 50);
    expect(resultStrict.valid).toBe(false);
    expect(resultRelaxed.valid).toBe(true);
  });
});
