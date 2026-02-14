import ipaddr from 'ipaddr.js';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a single IP address or CIDR range
 */
export function validateIPOrCIDR(input: string): ValidationResult {
  if (!input || input.trim() === '') {
    return { isValid: false, error: 'IP address cannot be empty' };
  }

  const trimmed = input.trim();

  // Check if it's a CIDR range
  if (trimmed.includes('/')) {
    try {
      const [ip, prefixStr] = trimmed.split('/');
      const prefix = parseInt(prefixStr, 10);

      // Parse the IP part
      const parsedIP = ipaddr.process(ip);

      // Validate prefix length
      if (parsedIP.kind() === 'ipv4') {
        if (prefix < 0 || prefix > 32) {
          return { isValid: false, error: 'IPv4 prefix must be between 0 and 32' };
        }
      } else if (parsedIP.kind() === 'ipv6') {
        if (prefix < 0 || prefix > 128) {
          return { isValid: false, error: 'IPv6 prefix must be between 0 and 128' };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Invalid CIDR notation' };
    }
  }

  // Check if it's a single IP
  try {
    ipaddr.process(input);
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid IP address format' };
  }
}

/**
 * Validates a list of IP addresses/CIDR ranges (newline-separated)
 */
export function validateIPList(text: string): { valid: string[]; invalid: Array<{ line: number; value: string; error: string }> } {
  const lines = text.split('\n');
  const valid: string[] = [];
  const invalid: Array<{ line: number; value: string; error: string }> = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (trimmed === '') {
      return;
    }

    const result = validateIPOrCIDR(trimmed);
    if (result.isValid) {
      valid.push(trimmed);
    } else {
      invalid.push({
        line: index + 1,
        value: trimmed,
        error: result.error || 'Invalid format',
      });
    }
  });

  return { valid, invalid };
}

/**
 * Converts array of IPs to newline-separated string
 */
export function ipArrayToText(ips: string[]): string {
  return ips.join('\n');
}

/**
 * Converts newline-separated text to array of IPs
 */
export function ipTextToArray(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
