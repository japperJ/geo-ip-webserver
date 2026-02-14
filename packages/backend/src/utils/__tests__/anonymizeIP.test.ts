import { describe, it, expect } from 'vitest';
import { anonymizeIP } from '../anonymizeIP.js';

describe('anonymizeIP', () => {
  describe('IPv4', () => {
    it('should anonymize IPv4 address', () => {
      expect(anonymizeIP('192.168.1.100')).toBe('192.168.1.0');
      expect(anonymizeIP('10.20.30.40')).toBe('10.20.30.0');
      expect(anonymizeIP('8.8.8.8')).toBe('8.8.8.0');
    });

    it('should handle already anonymized IPv4', () => {
      expect(anonymizeIP('192.168.1.0')).toBe('192.168.1.0');
    });
  });

  describe('IPv6', () => {
    it('should anonymize IPv6 address', () => {
      expect(anonymizeIP('2001:db8::1')).toBe('2001:db8:0::');
      expect(anonymizeIP('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8:0::');
    });

    it('should handle already anonymized IPv6', () => {
      expect(anonymizeIP('2001:db8:0::')).toBe('2001:db8:0::');
    });
  });

  describe('Invalid IPs', () => {
    it('should return input for invalid IP', () => {
      expect(anonymizeIP('invalid-ip')).toBe('invalid-ip');
    });
  });
});
