import { describe, it, expect } from 'vitest';
import { validateGPS, calculateDistance } from '../validateGPS';

describe('validateGPS', () => {
  it('should validate correct GPS coordinates', () => {
    const result = validateGPS({ lat: 37.7749, lng: -122.4194, accuracy: 50 });
    expect(result.valid).toBe(true);
  });

  it('should reject latitude out of range', () => {
    const result = validateGPS({ lat: 91, lng: -122.4194, accuracy: 50 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid latitude');
  });

  it('should reject longitude out of range', () => {
    const result = validateGPS({ lat: 37.7749, lng: -181, accuracy: 50 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid longitude');
  });

  it('should reject accuracy above threshold', () => {
    const result = validateGPS({ lat: 37.7749, lng: -122.4194, accuracy: 150 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('GPS accuracy too low');
  });

  it('should accept coordinates without accuracy', () => {
    const result = validateGPS({ lat: 37.7749, lng: -122.4194 });
    expect(result.valid).toBe(true);
  });
});

describe('calculateDistance', () => {
  it('should calculate distance between two points', () => {
    const sf = { lat: 37.7749, lng: -122.4194 };
    const la = { lat: 34.0522, lng: -118.2437 };
    const distance = calculateDistance(sf, la);
    expect(distance).toBeGreaterThan(500);
    expect(distance).toBeLessThan(600);
  });

  it('should return 0 for same coordinates', () => {
    const coord = { lat: 37.7749, lng: -122.4194 };
    const distance = calculateDistance(coord, coord);
    expect(distance).toBe(0);
  });
});
