/**
 * Webhook event deduplication
 *
 * Webhook providers (email, Didit, blockchain indexers) use at-least-once
 * delivery, so the same event can arrive multiple times. This helper keeps a
 * bounded in-memory set of processed event keys so a duplicate delivery is
 * acknowledged (200) without re-processing the side effects.
 *
 * In-memory by design, matching the existing Didit KYC dedup (per-process fast
 * path). Where durability across instances matters, pair it with a lock or a
 * final-state guard in the consuming handler — a duplicate arriving on another
 * replica must be harmless at the data layer, not just skipped here.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_KEYS = 1000;

type DedupOptions = {
  ttlMs?: number;
  maxKeys?: number;
};

export class WebhookDeduper {
  private readonly seen = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxKeys: number;

  constructor(options: DedupOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxKeys = options.maxKeys ?? MAX_KEYS;
  }

  /**
   * True if the key was ALREADY seen (duplicate delivery). Marks the key as
   * processed on first sight. The caller marks after successful processing by
   * using markProcessed() — see isDuplicate for the symmetric flow.
   */
  has(key: string): boolean {
    this.prune();
    return this.seen.has(key);
  }

  /** Record a successfully-processed event key. */
  markProcessed(key: string): void {
    this.prune();
    this.seen.set(key, Date.now());
    if (this.seen.size > this.maxKeys) {
      this.prune();
    }
  }

  /** Convenience: dedupe-and-mark in one call (for fire-and-forget handlers). */
  checkAndMark(key: string): boolean {
    const duplicate = this.has(key);
    if (!duplicate) this.markProcessed(key);
    return duplicate;
  }

  clear(): void {
    this.seen.clear();
  }

  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [key, timestamp] of this.seen) {
      if (timestamp < cutoff) {
        this.seen.delete(key);
      }
    }
  }
}
