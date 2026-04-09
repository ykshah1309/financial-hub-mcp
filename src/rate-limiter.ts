/**
 * Token-bucket rate limiter with request queuing.
 *
 * Prevents hitting SEC EDGAR (10 req/s) and FRED (120 req/min) rate limits.
 * Requests that exceed the budget are queued and resolved in order.
 */

interface QueuedRequest {
  resolve: () => void;
}

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;
  private queue: QueuedRequest[] = [];
  private draining = false;

  /**
   * @param maxPerSecond  Maximum requests per second
   * @param burst         Burst capacity (defaults to 80% of maxPerSecond)
   */
  constructor(maxPerSecond: number, burst?: number) {
    this.maxTokens = burst ?? Math.max(1, Math.floor(maxPerSecond * 0.8));
    this.tokens = this.maxTokens;
    this.refillRate = maxPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    while (this.queue.length > 0) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        this.queue.shift()!.resolve();
      } else {
        // Wait until at least one token is available
        const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
        await sleep(waitMs);
      }
    }

    this.draining = false;
  }

  /** Acquire a token. Resolves immediately if available, queues otherwise. */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push({ resolve });
      this.drainQueue();
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry wrapper with exponential backoff for rate-limit responses.
 * Retries on HTTP 429 and 503, up to maxRetries times.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  limiter: RateLimiter,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await limiter.acquire();

    const res = await fetch(url, options);

    if (res.status === 429 || res.status === 503) {
      lastError = new Error(`Rate limited: ${res.status} (attempt ${attempt + 1})`);
      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
        await sleep(backoff);
        continue;
      }
    }

    return res;
  }

  throw lastError ?? new Error("fetchWithRetry exhausted retries");
}

// ── Shared instances ────────────────────────────────────────────────────────

/** SEC EDGAR: 10 req/s, burst 8 */
export const edgarLimiter = new RateLimiter(10, 8);

/** FRED: 120 req/min = 2 req/s, burst 2 */
export const fredLimiter = new RateLimiter(2, 2);
