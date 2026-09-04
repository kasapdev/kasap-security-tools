import type { ClockFn, Limiter, RateLimitResult, RateLimitStore } from "./types.js";

export interface SlidingWindowState {
  /** Timestamps (ms) of requests that were allowed and are still within the trailing window. */
  timestamps: number[];
}

export interface SlidingWindowOptions {
  /** Maximum number of requests allowed within any trailing `windowMs` period. */
  limit: number;
  windowMs: number;
  store: RateLimitStore<SlidingWindowState>;
  now?: ClockFn;
}

/**
 * Sliding-window-log rate limiter: keeps a log of request timestamps per
 * key and, on each `consume()`, first drops any timestamp older than
 * `now - windowMs`, then allows the request only if fewer than `limit`
 * timestamps remain in the trailing window.
 *
 * Unlike a fixed window, this has no reset-boundary edge case (e.g. a
 * client sending `limit` requests in the last millisecond of one window and
 * `limit` more in the first millisecond of the next, doubling their
 * effective rate) — the window is always measured relative to "now", not to
 * a fixed clock boundary.
 */
export class SlidingWindowLimiter implements Limiter {
  readonly limit: number;
  readonly windowMs: number;
  private readonly store: RateLimitStore<SlidingWindowState>;
  private readonly now: ClockFn;

  constructor(options: SlidingWindowOptions) {
    if (!(options.limit > 0)) throw new Error("limit must be > 0");
    if (!(options.windowMs > 0)) throw new Error("windowMs must be > 0");
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.store = options.store;
    this.now = options.now ?? Date.now;
  }

  async consume(key: string, cost = 1): Promise<RateLimitResult> {
    const now = this.now();
    const windowStart = now - this.windowMs;
    const existing = await this.store.get(key);
    // Strictly greater than windowStart: a timestamp exactly `windowMs` in
    // the past has just left the trailing window.
    const timestamps = (existing?.timestamps ?? []).filter((t) => t > windowStart);

    const allowed = timestamps.length + cost <= this.limit;
    if (allowed) {
      for (let i = 0; i < cost; i++) timestamps.push(now);
    }

    await this.store.set(key, { timestamps }, this.windowMs);

    const remaining = Math.max(0, this.limit - timestamps.length);
    const oldest = timestamps[0];
    const resetMs = oldest !== undefined ? Math.max(0, oldest + this.windowMs - now) : 0;
    const retryAfterMs = allowed ? 0 : resetMs;

    return { allowed, limit: this.limit, remaining, resetMs, retryAfterMs };
  }
}
