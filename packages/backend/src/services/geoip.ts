import maxmind, { CityResponse, CountryResponse, Reader, AsnResponse } from 'maxmind';
import { FastifyBaseLogger } from 'fastify';
import { LRUCache } from 'lru-cache';

export interface GeoIPLocation {
  country?: string;
  countryCode?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  postalCode?: string;
}

export interface AnonymousIPCheck {
  isVpn: boolean;
  isProxy: boolean;
  isHosting: boolean;
  isTor: boolean;
}

export class GeoIPService {
  private cityReader: Reader<CityResponse> | null = null;
  private countryReader: Reader<CountryResponse> | null = null;
  private anonReader: Reader<AsnResponse> | null = null;
  
  // LRU cache: 10,000 entries, 5 minute TTL
  private cache = new LRUCache<string, GeoIPLocation>({
    max: 10000,
    ttl: 1000 * 60 * 5, // 5 minutes
  });
  
  private logger: FastifyBaseLogger;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;
  }

  async initialize(cityDbPath: string, countryDbPath: string, anonDbPath?: string): Promise<void> {
    try {
      this.cityReader = await maxmind.open<CityResponse>(cityDbPath);
      this.countryReader = await maxmind.open<CountryResponse>(countryDbPath);
      this.logger.info('GeoIP databases loaded successfully');
      
      // Load anonymous IP database (optional)
      if (anonDbPath) {
        try {
          this.anonReader = await maxmind.open<AsnResponse>(anonDbPath);
          this.logger.info('GeoIP anonymous IP database loaded successfully');
        } catch (error) {
          this.logger.warn({ error }, 'GeoIP anonymous IP database not found - VPN detection disabled');
        }
      } else {
        this.logger.info('GeoIP anonymous IP database path not provided - VPN detection disabled');
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to load GeoIP databases');
      throw error;
    }
  }

  lookup(ip: string): GeoIPLocation | null {
    // Check cache first
    const cached = this.cache.get(ip);
    if (cached) {
      return cached;
    }

    // Perform lookup
    const location = this.performLookup(ip);
    
    // Cache result
    if (location) {
      this.cache.set(ip, location);
    }

    return location;
  }

  private performLookup(ip: string): GeoIPLocation | null {
    try {
      const cityData = this.cityReader?.get(ip);
      
      if (!cityData) {
        // Fallback to country lookup
        const countryData = this.countryReader?.get(ip);
        if (!countryData) {
          return null;
        }

        return {
          country: countryData.country?.names?.en,
          countryCode: countryData.country?.iso_code
        };
      }

      return {
        country: cityData.country?.names?.en,
        countryCode: cityData.country?.iso_code,
        city: cityData.city?.names?.en,
        latitude: cityData.location?.latitude,
        longitude: cityData.location?.longitude,
        timezone: cityData.location?.time_zone,
        postalCode: cityData.postal?.code
      };
    } catch (error) {
      this.logger.error({ error, ip }, 'GeoIP lookup failed');
      return null;
    }
  }

  /**
   * Check if IP is from VPN/proxy/hosting/Tor
   * @param ip IP address
   * @returns Anonymous IP check results
   */
  isAnonymous(ip: string): AnonymousIPCheck {
    // If anonymous IP database not loaded, return all false
    if (!this.anonReader) {
      return {
        isVpn: false,
        isProxy: false,
        isHosting: false,
        isTor: false,
      };
    }

    try {
      const result = this.anonReader.get(ip) as any;

      return {
        isVpn: result?.is_anonymous_vpn || false,
        isProxy: result?.is_anonymous_proxy || false,
        isHosting: result?.is_hosting_provider || false,
        isTor: result?.is_tor_exit_node || false,
      };
    } catch (error) {
      this.logger.error({ error, ip }, 'Anonymous IP check failed');
      return {
        isVpn: false,
        isProxy: false,
        isHosting: false,
        isTor: false,
      };
    }
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      max: this.cache.max,
      ttl: this.cache.ttl,
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.info('GeoIP cache cleared');
  }
}
