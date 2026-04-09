/**
 * Simple in-memory TTL cache.
 *
 * Reduces redundant API calls to SEC EDGAR and FRED, easing rate-limit
 * pressure and improving latency for repeated queries on the same company.
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
   * @param maxSize     Max entries before oldest are evicted
   */
  constructor(ttlSeconds: number, maxSize = 200) {
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
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }
}

// ── Shared cache instances ──────────────────────────────────────────────────

/** Company facts: 1 hour TTL (filings update infrequently) */
export const factsCache = new TTLCache<any>(3600);

/** Company submissions: 1 hour TTL */
export const submissionsCache = new TTLCache<any>(3600);

/** FRED series metadata: 6 hour TTL */
export const fredSeriesCache = new TTLCache<any>(21600);

/** FRED observations: 1 hour TTL */
export const fredObsCache = new TTLCache<any>(3600);
