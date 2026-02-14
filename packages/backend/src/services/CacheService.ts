import { LRUCache } from 'lru-cache';
import type { FastifyInstance } from 'fastify';
import type { Site } from '../models/Site.js';
import { cacheHitRate, cacheSizeGauge } from '../plugins/metrics.js';

const MEMORY_CACHE_MAX = 1000;
const MEMORY_CACHE_TTL = 60 * 1000; // 60 seconds
const REDIS_CACHE_TTL = 300; // 5 minutes (in seconds)

export interface CacheStats {
  memoryHits: number;
  redisHits: number;
  dbHits: number;
  totalRequests: number;
  hitRate: number;
  memorySize: number;
}

export class CacheService {
  private memoryCache: LRUCache<string, Site>;
  private stats = {
    memoryHits: 0,
    redisHits: 0,
    dbHits: 0,
  };

  constructor(private fastify: FastifyInstance) {
    this.memoryCache = new LRUCache<string, Site>({
      max: MEMORY_CACHE_MAX,
      ttl: MEMORY_CACHE_TTL,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
    });

    // Subscribe to cache invalidation events
    this.subscribeToCacheInvalidation();
  }

  private async subscribeToCacheInvalidation() {
    try {
      const subscriber = this.fastify.redis.duplicate();
      await subscriber.subscribe('cache:invalidate:site');

      subscriber.on('message', (channel, message) => {
        if (channel === 'cache:invalidate:site') {
          const hostname = message;
          this.memoryCache.delete(hostname);
          this.fastify.log.debug({ hostname }, 'Cache invalidated via pub/sub');
        }
      });

      this.fastify.log.info('Subscribed to cache invalidation channel');
    } catch (error) {
      this.fastify.log.error({ error }, 'Failed to subscribe to cache invalidation');
    }
  }

  async getSiteByHostname(hostname: string): Promise<Site | null> {
    // 1. Check memory cache
    const memoryHit = this.memoryCache.get(hostname);
    if (memoryHit) {
      this.stats.memoryHits++;
      return memoryHit;
    }

    // 2. Check Redis cache
    try {
      const redisKey = `site:hostname:${hostname}`;
      const redisHit = await this.fastify.redis.get(redisKey);
      
      if (redisHit) {
        this.stats.redisHits++;
        const site = JSON.parse(redisHit) as Site;
        
        // Populate memory cache
        this.memoryCache.set(hostname, site);
        
        return site;
      }
    } catch (error) {
      this.fastify.log.error({ error, hostname }, 'Redis cache error');
    }

    // 3. Query database
    this.stats.dbHits++;
    const result = await this.fastify.pg.query<Site>(
      'SELECT * FROM sites WHERE hostname = $1 AND enabled = true AND deleted_at IS NULL',
      [hostname]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const site = result.rows[0];

    // Populate both caches
    await this.setSiteCache(hostname, site);

    return site;
  }

  async setSiteCache(hostname: string, site: Site): Promise<void> {
    // Set memory cache
    this.memoryCache.set(hostname, site);

    // Set Redis cache
    try {
      const redisKey = `site:hostname:${hostname}`;
      await this.fastify.redis.setex(
        redisKey,
        REDIS_CACHE_TTL,
        JSON.stringify(site)
      );
    } catch (error) {
      this.fastify.log.error({ error, hostname }, 'Failed to set Redis cache');
    }
  }

  async invalidateSiteCache(hostname: string): Promise<void> {
    // Clear memory cache
    this.memoryCache.delete(hostname);

    // Clear Redis cache
    try {
      const redisKey = `site:hostname:${hostname}`;
      await this.fastify.redis.del(redisKey);

      // Publish invalidation event for other instances
      await this.fastify.redis.publish('cache:invalidate:site', hostname);
      
      this.fastify.log.info({ hostname }, 'Cache invalidated and published');
    } catch (error) {
      this.fastify.log.error({ error, hostname }, 'Failed to invalidate Redis cache');
    }
  }

  async warmCache(): Promise<void> {
    this.fastify.log.info('Warming site cache...');

    try {
      // Get top 100 enabled sites (by popularity if we had a request counter)
      const result = await this.fastify.pg.query<Site>(
        'SELECT * FROM sites WHERE enabled = true AND deleted_at IS NULL AND hostname IS NOT NULL LIMIT 100'
      );

      for (const site of result.rows) {
        if (site.hostname) {
          await this.setSiteCache(site.hostname, site);
        }
      }

      this.fastify.log.info({ count: result.rows.length }, 'Cache warmed successfully');
    } catch (error) {
      this.fastify.log.error({ error }, 'Failed to warm cache');
    }
  }

  getStats(): CacheStats {
    const totalRequests = this.stats.memoryHits + this.stats.redisHits + this.stats.dbHits;
    const cacheHits = this.stats.memoryHits + this.stats.redisHits;
    const hitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

    // Update Prometheus metrics
    cacheHitRate.set(hitRate / 100); // Convert to 0-1 range
    cacheSizeGauge.set(this.memoryCache.size);

    return {
      memoryHits: this.stats.memoryHits,
      redisHits: this.stats.redisHits,
      dbHits: this.stats.dbHits,
      totalRequests,
      hitRate: Math.round(hitRate * 100) / 100,
      memorySize: this.memoryCache.size,
    };
  }

  resetStats(): void {
    this.stats = {
      memoryHits: 0,
      redisHits: 0,
      dbHits: 0,
    };
  }
}
