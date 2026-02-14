import { describe, it, expect } from 'vitest';
import { getClientIP } from '../getClientIP.js';

// Mock FastifyRequest
function mockRequest(headers: Record<string, string | string[]>, remoteAddress?: string): any {
  return {
    headers,
    socket: {
      remoteAddress,
    },
  };
}

describe('getClientIP', () => {
  it('should extract IP from X-Forwarded-For (single IP)', () => {
    const request = mockRequest({
      'x-forwarded-for': '192.168.1.100',
    });

    const ip = getClientIP(request);
    expect(ip).toBe('192.168.1.100');
  });

  it('should extract leftmost IP from X-Forwarded-For (multiple IPs)', () => {
    const request = mockRequest({
      'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
    });

    const ip = getClientIP(request);
    expect(ip).toBe('203.0.113.195'); // Client IP
  });

  it('should extract IP from X-Real-IP if X-Forwarded-For missing', () => {
    const request = mockRequest({
      'x-real-ip': '10.0.0.5',
    });

    const ip = getClientIP(request);
    expect(ip).toBe('10.0.0.5');
  });

  it('should fall back to socket.remoteAddress', () => {
    const request = mockRequest({}, '172.16.0.10');

    const ip = getClientIP(request);
    expect(ip).toBe('172.16.0.10');
  });

  it('should return null for invalid IP', () => {
    const request = mockRequest({
      'x-forwarded-for': 'invalid-ip',
    });

    const ip = getClientIP(request);
    expect(ip).toBeNull();
  });

  it('should handle IPv6 addresses', () => {
    const request = mockRequest({
      'x-forwarded-for': '2001:db8::1',
    });

    const ip = getClientIP(request);
    expect(ip).toBe('2001:db8::1');
  });

  it('should return null when no IP available', () => {
    const request = mockRequest({});

    const ip = getClientIP(request);
    expect(ip).toBeNull();
  });
});
