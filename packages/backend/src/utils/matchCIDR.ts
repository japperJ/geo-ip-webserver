import { isValid, parse, parseCIDR } from 'ipaddr.js';

/**
 * Check if IP matches any CIDR in list
 * @param ip Client IP address
 * @param cidrList Array of CIDR strings (e.g., ["10.0.0.0/8", "192.168.1.100"])
 * @returns true if IP matches any entry, false otherwise
 */
export function matchCIDR(ip: string, cidrList: string[]): boolean {
  if (!isValid(ip)) {
    return false;
  }

  const parsedIP = parse(ip);

  for (const cidr of cidrList) {
    try {
      // Single IP (no CIDR notation)
      if (!cidr.includes('/')) {
        const singleIP = parse(cidr);
        if (parsedIP.toString() === singleIP.toString()) {
          return true;
        }
        continue;
      }

      // CIDR range
      const [network, prefixLength] = parseCIDR(cidr);
      if (parsedIP.match(network, prefixLength)) {
        return true;
      }
    } catch (error) {
      // Invalid CIDR format - log warning and skip
      console.warn(`Invalid CIDR: ${cidr}`, error);
    }
  }

  return false;
}
