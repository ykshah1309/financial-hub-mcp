/**
 * Token-bucket rate limiter with bounded request queuing.
 *
 * Prevents hitting SEC EDGAR (10 req/s) and FRED (120 req/min) rate limits.
 * Requests that exceed the budget are queued with a timeout — if the queue
 * is full or the wait exceeds the deadline, the request is rejected immediately
 * so the LLM can pivot rather than stall indefinitely.
 */

interface QueuedRequest {
  resolve: () => void;
  reject: (err: Error) => void;
  deadline: number;
}

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;
  private queue: QueuedRequest[] = [];
  private draining = false;
  private readonly maxQueueSize: number;
  private readonly timeoutMs: number;

  /**
   * @param maxPerSecond  Maximum requests per second
   * @param burst         Burst capacity (defaults to 80% of maxPerSecond)
   * @param maxQueue      Max queued requests before rejecting (default 50)
   * @param timeoutMs     Max ms a request can wait in queue (default 30s)
   */
  constructor(maxPerSecond: number, burst?: number, maxQueue = 50, timeoutMs = 30_000) {
    this.maxTokens = burst ?? Math.max(1, Math.floor(maxPerSecond * 0.8));
    this.tokens = this.maxTokens;
    this.refillRate = maxPerSecond / 1000;
    this.lastRefill = Date.now();
    this.maxQueueSize = maxQueue;
    this.timeoutMs = timeoutMs;
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
      // Evict expired requests from the front
      const now = Date.now();
      while (this.queue.length > 0 && this.queue[0].deadline <= now) {
        const expired = this.queue.shift()!;
        expired.reject(new Error("Rate limiter timeout: request waited too long in queue"));
      }
      if (this.queue.length === 0) break;

      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        this.queue.shift()!.resolve();
      } else {
        const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
        await sleep(Math.min(waitMs, 200)); // wake frequently to check deadlines
      }
    }

    this.draining = false;
  }

  /** Acquire a token. Resolves immediately if available, queues with timeout otherwise. */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(
        `Rate limiter queue full (${this.maxQueueSize} pending). ` +
        `Too many concurrent requests — slow down or reduce parallelism.`
      );
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject, deadline: Date.now() + this.timeoutMs });
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

/** SEC EDGAR: 10 req/s, burst 8, max 50 queued, 30s timeout */
export const edgarLimiter = new RateLimiter(10, 8, 50, 30_000);

/** FRED: 120 req/min = 2 req/s, burst 2, max 30 queued, 30s timeout */
export const fredLimiter = new RateLimiter(2, 2, 30, 30_000);
