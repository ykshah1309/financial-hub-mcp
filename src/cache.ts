/**
 * In-memory LRU cache with TTL-based expiry and bounded size.
 *
 * SEC company facts payloads can be 20-50MB each. Caching 200 of them
 * would OOM any Node process. This cache enforces strict entry limits
 * and sweeps expired entries on every write to prevent memory buildup.
 *
 * Eviction is LRU: get() promotes accessed entries to most-recent position
 * via Map delete-and-reinsert. When at capacity, the least recently used
 * (first key in iteration order) is evicted.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  /**
   * @param ttlSeconds  Time-to-live in seconds
   * @param maxSize     Max entries — hard limit, oldest evicted when full
   */
  constructor(ttlSeconds: number, maxSize: number) {
    this.ttlMs = ttlSeconds * 1000;
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // LRU promotion: delete and re-insert moves key to end of Map iteration order.
    // This ensures eviction (which takes the first key) always removes the
    // least recently used entry, not the oldest inserted one.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // Proactive sweep: remove all expired entries before inserting
    this.evictExpired();

    // If still at capacity, evict oldest
    while (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
      else break;
    }

    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  /** Remove all expired entries immediately. */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

// ── Shared cache instances ──────────────────────────────────────────────────
// Sizes are deliberately small for heavy payloads to prevent OOM.

/** Company facts: 1h TTL, max 10 entries (~20-50MB each, 10 = ~200-500MB worst case) */
export const factsCache = new TTLCache<any>(3600, 10);

/** Company submissions: 1h TTL, max 30 entries (~50KB each, negligible) */
export const submissionsCache = new TTLCache<any>(3600, 30);

/** Company tickers: 24h TTL, single entry (~3MB). Refreshes daily so new listings appear. */
export const tickerCache = new TTLCache<any>(86400, 1);

/** FRED series metadata: 6h TTL, max 100 entries (~1KB each) */
export const fredSeriesCache = new TTLCache<any>(21600, 100);

/** FRED observations: 1h TTL, max 50 entries (~5KB each) */
export const fredObsCache = new TTLCache<any>(3600, 50);

// ── Market data caches (Finnhub) ────────────────────────────────────────────

/** Company profile: 24h TTL, max 50 entries (~2KB each) */
export const marketProfileCache = new TTLCache<any>(86400, 50);

/** Market/company news: 5min TTL, max 10 entries (~20KB each) */
export const marketNewsCache = new TTLCache<any>(300, 10);

/** Insider transactions: 1h TTL, max 30 entries (~5KB each) */
export const insiderCache = new TTLCache<any>(3600, 30);

/** Basic financials (PE, beta, etc.): 1h TTL, max 30 entries (~3KB each) */
export const basicFinancialsCache = new TTLCache<any>(3600, 30);
