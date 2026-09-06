type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class LRUCache<T> {
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

export const skillCache = new LRUCache<any[]>(200, 5 * 60_000);

// Analytics caches: 5-minute TTL for expensive queries
export const platformMetricsCache = new LRUCache<any>(10, 5 * 60_000);
export const skillTrendsCache = new LRUCache<any[]>(10, 5 * 60_000);

// Per-user payment summary: 60s TTL. The totals scan every completed payment
// record, so a frequently-polled dashboard widget shouldn't re-scan on every
// request. Keyed by userId (one entry per user); only available results are
// cached by the service, never failed/unavailable queries.
export const paymentSummaryCache = new LRUCache<{
  totalEarnings: number | null;
  totalSpent: number | null;
  available: boolean;
}>(500, 60_000);

// Analytics dashboards: 60s TTL. These scan whole collections (contracts,
// reviews, proposals, projects with limit(1000) plus per-project lookups), so a
// frequently-polled dashboard shouldn't re-scan on every request. The per-user
// caches are keyed by userId + date range; only successful results are cached.
export const freelancerAnalyticsCache = new LRUCache<any>(500, 60_000);
export const employerAnalyticsCache = new LRUCache<any>(500, 60_000);
export const adminAnalyticsCache = new LRUCache<any>(10, 60_000);
export const marketplaceLiquidityCache = new LRUCache<any>(10, 60_000);