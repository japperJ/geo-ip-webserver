import * as ipaddrNamespace from 'ipaddr.js';

const ipaddr = (ipaddrNamespace as any).default ?? ipaddrNamespace;

/**
 * Validate if a string is a valid IP address
 */
function isValidIP(ip: string): boolean {
  try {
    ipaddr.parse(ip);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if IP matches any CIDR in list
 * @param ip Client IP address
 * @param cidrList Array of CIDR strings (e.g., ["10.0.0.0/8", "192.168.1.100"])
 * @returns true if IP matches any entry, false otherwise
 */
export function matchCIDR(ip: string, cidrList: string[]): boolean {
  if (!isValidIP(ip)) {
    return false;
  }

  const parsedIP = ipaddr.parse(ip);

  for (const cidr of cidrList) {
    try {
      // Single IP (no CIDR notation)
      if (!cidr.includes('/')) {
        const singleIP = ipaddr.parse(cidr);
        if (parsedIP.toString() === singleIP.toString()) {
          return true;
        }
        continue;
      }

      // CIDR range
      const [network, prefixLength] = ipaddr.parseCIDR(cidr);
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
