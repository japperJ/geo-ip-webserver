import * as ipaddr from 'ipaddr.js';

/**
 * Anonymize IP address for GDPR compliance
 * 
 * IPv4: Remove last octet (e.g., 192.168.1.100 -> 192.168.1.0)
 * IPv6: Remove last 80 bits (e.g., 2001:db8::1 -> 2001:db8::)
 * 
 * @param ip IP address (IPv4 or IPv6)
 * @returns Anonymized IP address
 */
export function anonymizeIP(ip: string): string {
  try {
    const parsed = ipaddr.parse(ip);

    if (parsed.kind() === 'ipv4') {
      // IPv4: Zero out last octet
      const octets = parsed.toByteArray();
      octets[3] = 0;
      return octets.join('.');
    } else {
      // IPv6: Keep first 48 bits (3 parts), zero out rest
      const parts = parsed.toNormalizedString().split(':');
      const anonymized = parts.slice(0, 3).join(':') + '::';
      return anonymized;
    }
  } catch (error) {
    // If parsing fails, return as-is (shouldn't happen with validated IPs)
    console.error('Failed to anonymize IP:', ip, error);
    return ip;
  }
}
