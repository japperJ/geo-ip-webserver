import { describe, it, expect } from 'vitest';
import { matchCIDR } from '../matchCIDR.js';

describe('matchCIDR', () => {
  it('should match single IPv4 address', () => {
    expect(matchCIDR('192.168.1.100', ['192.168.1.100'])).toBe(true);
    expect(matchCIDR('192.168.1.101', ['192.168.1.100'])).toBe(false);
  });

  it('should match IPv4 CIDR range', () => {
    expect(matchCIDR('192.168.1.100', ['192.168.1.0/24'])).toBe(true);
    expect(matchCIDR('192.168.1.255', ['192.168.1.0/24'])).toBe(true);
    expect(matchCIDR('192.168.2.100', ['192.168.1.0/24'])).toBe(false);
  });

  it('should match IPv6 CIDR range', () => {
    expect(matchCIDR('2001:db8::1', ['2001:db8::/32'])).toBe(true);
    expect(matchCIDR('2001:db9::1', ['2001:db8::/32'])).toBe(false);
  });

  it('should match any in list', () => {
    const list = ['10.0.0.0/8', '192.168.1.0/24', '172.16.0.5'];
    
    expect(matchCIDR('10.5.10.20', list)).toBe(true);
    expect(matchCIDR('192.168.1.50', list)).toBe(true);
    expect(matchCIDR('172.16.0.5', list)).toBe(true);
    expect(matchCIDR('8.8.8.8', list)).toBe(false);
  });

  it('should handle invalid CIDR gracefully', () => {
    expect(matchCIDR('192.168.1.1', ['invalid-cidr'])).toBe(false);
  });

  it('should return false for invalid IP', () => {
    expect(matchCIDR('invalid-ip', ['192.168.1.0/24'])).toBe(false);
  });
});
