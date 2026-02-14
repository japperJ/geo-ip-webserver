import maxmind, { CityResponse, CountryResponse, Reader } from 'maxmind';
import { FastifyBaseLogger } from 'fastify';

interface GeoIPLocation {
  country?: string;
  countryCode?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  postalCode?: string;
}

interface CacheEntry {
  data: GeoIPLocation;
  timestamp: number;
}

export class GeoIPService {
  private cityReader: Reader<CityResponse> | null = null;
  private countryReader: Reader<CountryResponse> | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour in ms
  private readonly MAX_CACHE_SIZE = 10000; // LRU cache size
  private logger: FastifyBaseLogger;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;
  }

  async initialize(cityDbPath: string, countryDbPath: string): Promise<void> {
    try {
      this.cityReader = await maxmind.open<CityResponse>(cityDbPath);
      this.countryReader = await maxmind.open<CountryResponse>(countryDbPath);
      this.logger.info('GeoIP databases loaded successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to load GeoIP databases');
      throw error;
    }
  }

  lookup(ip: string): GeoIPLocation | null {
    // Check cache first
    const cached = this.cache.get(ip);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.data;
    }

    // Perform lookup
    const location = this.performLookup(ip);
    
    // Cache result (LRU eviction)
    if (location) {
      this.cacheResult(ip, location);
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

  private cacheResult(ip: string, location: GeoIPLocation): void {
    // LRU eviction: remove oldest entry if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(ip, {
      data: location,
      timestamp: Date.now()
    });
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttl: this.CACHE_TTL
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.info('GeoIP cache cleared');
  }
}
