import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

// Common cache interface - maintains backward compatibility with sync operations
export interface Cache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs?: number): void;
  delete(key: string): boolean;
  deleteMatching(predicate: (key: string) => boolean): void;
  clear(): void;
}

// In-memory LRU cache implementation
export class LRUCache<T> implements Cache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(maxSize: number = 500, defaultTtlMs: number = 60_000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  deleteMatching(predicate: (key: string) => boolean): void {
    for (const key of Array.from(this.cache.keys())) {
      if (predicate(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  startCleanup(intervalMs: number = 60_000): void {
    this.stopCleanup();
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, intervalMs);
    this.cleanupTimer.unref();
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// Redis-backed cache implementation with sync interface for backward compatibility
export class RedisCache<T> implements Cache<T> {
  private prefix: string;
  private defaultTtlMs: number;
  private fallbackCache: LRUCache<T>;
  private redisAvailable: boolean = true;

  constructor(prefix: string, maxSize: number = 500, defaultTtlMs: number = 60_000) {
    this.prefix = prefix;
    this.defaultTtlMs = defaultTtlMs;
    // Fallback in-memory cache for development or Redis down scenarios
    this.fallbackCache = new LRUCache<T>(maxSize, defaultTtlMs);
    
    // Listen for Redis errors to switch to fallback
    redis.on('error', () => {
      if (this.redisAvailable) {
        logger.warn(`[cache:${prefix}] Redis unavailable, using in-memory fallback`);
        this.redisAvailable = false;
      }
    });

    redis.on('ready', () => {
      if (!this.redisAvailable) {
        logger.info(`[cache:${prefix}] Redis reconnected, resuming Redis cache`);
        this.redisAvailable = true;
      }
    });
  }

  private getFullKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  // Synchronous get - always reads from in-memory fallback
  // Async population from Redis happens transparently
  get(key: string): T | undefined {
    // Always serve from fallback cache for sync interface
    return this.fallbackCache.get(key);
  }

  // Asynchronous get from Redis - returns null if not found
  async getAsync(key: string): Promise<T | null> {
    if (!this.redisAvailable) {
      const value = this.fallbackCache.get(key);
      return value ?? null;
    }

    try {
      const data = await redis.get(this.getFullKey(key));
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error: unknown) {
      logger.warn(`[cache:${this.prefix}] Redis get error: ${String(error)}`);
      const value = this.fallbackCache.get(key);
      return value ?? null;
    }
  }

  // Synchronous set - updates in-memory immediately, Redis in background
  set(key: string, value: T, ttlMs?: number): void {
    const ttlSeconds = Math.floor((ttlMs ?? this.defaultTtlMs) / 1000);
    
    // Always update fallback cache for immediate consistency
    this.fallbackCache.set(key, value, ttlMs);

    // Fire-and-forget Redis update
    if (this.redisAvailable) {
      redis.setex(this.getFullKey(key), ttlSeconds, JSON.stringify(value)).catch((error) => {
        logger.warn(`[cache:${this.prefix}] Redis set error: ${String(error)}`);
      });
    }
  }

  // Asynchronous set - returns when Redis operation completes
  async setAsync(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttlSeconds = Math.floor((ttlMs ?? this.defaultTtlMs) / 1000);
    
    // Always update fallback cache for consistency
    this.fallbackCache.set(key, value, ttlMs);

    if (!this.redisAvailable) {
      return;
    }

    try {
      await redis.setex(this.getFullKey(key), ttlSeconds, JSON.stringify(value));
    } catch (error: unknown) {
      logger.warn(`[cache:${this.prefix}] Redis set error: ${String(error)}`);
    }
  }

  // Synchronous delete - updates in-memory immediately, Redis in background
  delete(key: string): boolean {
    const result = this.fallbackCache.delete(key);
    
    // Fire-and-forget Redis delete
    if (this.redisAvailable) {
      redis.del(this.getFullKey(key)).catch((error) => {
        logger.warn(`[cache:${this.prefix}] Redis delete error: ${String(error)}`);
      });
    }
    
    return result;
  }

  // Asynchronous delete - returns when Redis operation completes
  async deleteAsync(key: string): Promise<void> {
    this.fallbackCache.delete(key);
    
    if (!this.redisAvailable) {
      return;
    }

    try {
      await redis.del(this.getFullKey(key));
    } catch (error: unknown) {
      logger.warn(`[cache:${this.prefix}] Redis delete error: ${String(error)}`);
    }
  }

  // Synchronous deleteMatching - updates in-memory immediately, Redis in background
  deleteMatching(predicate: (key: string) => boolean): void {
    // Delete from fallback cache
    this.fallbackCache.deleteMatching(predicate);

    // Fire-and-forget Redis delete
    if (this.redisAvailable) {
      this.deleteMatchingAsync(predicate).catch((error) => {
        logger.warn(`[cache:${this.prefix}] Redis deleteMatching error: ${String(error)}`);
      });
    }
  }

  // Asynchronous deleteMatching
  private async deleteMatchingAsync(predicate: (key: string) => boolean): Promise<void> {
    try {
      const pattern = `${this.prefix}:*`;
      const keys: string[] = [];
      
      // Use SCAN to find keys matching the pattern
      let cursor = '0';
      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const batch = result[1];
        
        for (const fullKey of batch) {
          // Extract the key without prefix
          const keyWithoutPrefix = fullKey.startsWith(`${this.prefix}:`) 
            ? fullKey.slice(this.prefix.length + 1) 
            : fullKey;
          
          if (predicate(keyWithoutPrefix)) {
            keys.push(fullKey);
          }
        }
      } while (cursor !== '0');

      // Delete matching keys in batches
      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
      }
    } catch (error: unknown) {
      logger.warn(`[cache:${this.prefix}] Redis deleteMatching error: ${String(error)}`);
    }
  }

  // Synchronous clear - updates in-memory immediately, Redis in background
  clear(): void {
    this.fallbackCache.clear();

    // Fire-and-forget Redis clear
    if (this.redisAvailable) {
      this.clearAsync().catch((error) => {
        logger.warn(`[cache:${this.prefix}] Redis clear error: ${String(error)}`);
      });
    }
  }

  // Asynchronous clear
  private async clearAsync(): Promise<void> {
    try {
      // Use SCAN to find and delete all keys with this prefix
      const pattern = `${this.prefix}:*`;
      const keys: string[] = [];
      
      let cursor = '0';
      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        keys.push(...result[1]);
      } while (cursor !== '0');

      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
      }
    } catch (error: unknown) {
      logger.warn(`[cache:${this.prefix}] Redis clear error: ${String(error)}`);
    }
  }

  get size(): number {
    return this.fallbackCache.size;
  }

  // Populate the in-memory cache from Redis on startup
  async warmCache(): Promise<void> {
    if (!this.redisAvailable) {
      return;
    }

    try {
      const pattern = `${this.prefix}:*`;
      let cursor = '0';
      
      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];
        
        if (keys.length > 0) {
          const values = await redis.mget(...keys);
          
          for (let i = 0; i < keys.length; i++) {
            const fullKey = keys[i];
            if (!fullKey) continue;
            const data = values[i];
            if (data) {
              // Extract the key without prefix
              const keyWithoutPrefix = fullKey.startsWith(`${this.prefix}:`) 
                ? fullKey.slice(this.prefix.length + 1) 
                : fullKey;
              
              try {
                const value = JSON.parse(data) as T;
                this.fallbackCache.set(keyWithoutPrefix, value);
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      } while (cursor !== '0');
      
      logger.info(`[cache:${this.prefix}] Warmed cache with ${this.fallbackCache.size} entries`);
    } catch (error: unknown) {
      logger.warn(`[cache:${this.prefix}] Failed to warm cache: ${String(error)}`);
    }
  }

  startCleanup(intervalMs: number = 60_000): void {
    // Only start cleanup for fallback cache
    this.fallbackCache.startCleanup(intervalMs);
  }

  stopCleanup(): void {
    this.fallbackCache.stopCleanup();
  }
}

// Detect Redis availability
const useRedis = !!process.env.REDIS_URL && process.env.NODE_ENV === 'production';

// Helper to create the appropriate cache based on environment
function createCache<T>(prefix: string, maxSize: number, ttlMs: number): RedisCache<T> | LRUCache<T> {
  if (useRedis) {
    logger.info(`[cache:${prefix}] Using Redis cache`);
    return new RedisCache<T>(prefix, maxSize, ttlMs);
  }
  logger.debug?.(`[cache:${prefix}] Using in-memory LRU cache`);
  return new LRUCache<T>(maxSize, ttlMs);
}

// Skill cache: 200 entries, 5-minute TTL
export const skillCache = createCache<any>('skill', 200, 5 * 60_000);

// Project caches: open project listings & project details (30s TTL) and category stats (60s TTL)
export const projectCache = createCache<any>('projects', 200, 30_000);
export const projectCategoryStatsCache = createCache<any>('project-stats', 10, 60_000);

// Freelancer search cache: 100 entries, 30s TTL
export const freelancerSearchCache = createCache<any>('freelancer-search', 100, 30_000);

// Analytics caches: 5-minute TTL for expensive queries
export const platformMetricsCache = createCache<any>('platform-metrics', 10, 5 * 60_000);
export const skillTrendsCache = createCache<any[]>('skill-trends', 10, 5 * 60_000);

// Per-user payment summary: 60s TTL
export const paymentSummaryCache = createCache<{
  totalEarnings: number | null;
  totalSpent: number | null;
  available: boolean;
}>('payment-summary', 500, 60_000);

// Analytics dashboards: 60s TTL
export const freelancerAnalyticsCache = createCache<any>('freelancer-analytics', 500, 60_000);
export const employerAnalyticsCache = createCache<any>('employer-analytics', 500, 60_000);
export const adminAnalyticsCache = createCache<any>('admin-analytics', 10, 60_000);
export const marketplaceLiquidityCache = createCache<any>('marketplace-liquidity', 10, 60_000);
export const funnelMetricsCache = createCache<any>('funnel-metrics', 10, 60_000);
export const cohortRetentionCache = createCache<any>('cohort-retention', 10, 60_000);
export const churnRiskCache = createCache<any>('churn-risk', 10, 60_000);
export const marketplaceVelocityCache = createCache<any>('marketplace-velocity', 10, 60_000);

// Idempotency cache: 1000 entries, 15-minute TTL
export const idempotencyCache = createCache<{
  status: 'in_progress' | 'completed';
  statusCode?: number;
  body?: any;
}>('idempotency', 1000, 15 * 60_000);

const allCaches: (LRUCache<any> | RedisCache<any>)[] = [
  skillCache,
  projectCache,
  projectCategoryStatsCache,
  freelancerSearchCache,
  idempotencyCache,
  platformMetricsCache,
  skillTrendsCache,
  paymentSummaryCache,
  freelancerAnalyticsCache,
  employerAnalyticsCache,
  adminAnalyticsCache,
  marketplaceLiquidityCache,
  funnelMetricsCache,
  cohortRetentionCache,
  churnRiskCache,
  marketplaceVelocityCache,
];

export function startAllCacheCleanups(intervalMs: number = 60_000): void {
  for (const cache of allCaches) {
    cache.startCleanup(intervalMs);
  }
}

export function stopAllCacheCleanups(): void {
  for (const cache of allCaches) {
    cache.stopCleanup();
  }
}

// Warm all Redis caches on startup
export async function warmAllCaches(): Promise<void> {
  if (!useRedis) {
    return;
  }
  
  for (const cache of allCaches) {
    if (cache instanceof RedisCache) {
      await cache.warmCache();
    }
  }
}


