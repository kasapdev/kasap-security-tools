import type { ClockFn, Limiter, RateLimitResult, RateLimitStore } from "./types.js";

export interface TokenBucketState {
  /** Fractional tokens currently in the bucket (may be non-integer between refills). */
  tokens: number;
  /** Timestamp (ms) the state was last updated/refilled at. */
  lastRefillMs: number;
}

export interface TokenBucketOptions {
  /** Maximum number of tokens the bucket can hold (the burst size). */
  capacity: number;
  /** Tokens added per second. */
  refillRatePerSec: number;
  store: RateLimitStore<TokenBucketState>;
  now?: ClockFn;
}

/**
 * Classic token-bucket rate limiter: each key gets a bucket that starts
 * full (`capacity` tokens) and refills continuously at `refillRatePerSec`
 * tokens/second, capped at `capacity`. Each `consume()` call attempts to
 * remove `cost` tokens; it succeeds only if enough tokens are available.
 *
 * Token bucket naturally allows short bursts up to `capacity` while still
 * enforcing a long-run average rate of `refillRatePerSec` — unlike a fixed
 * window, it has no "reset cliff" where a client can double their effective
 * rate by timing requests around a window boundary.
 */
export class TokenBucketLimiter implements Limiter {
  readonly capacity: number;
  readonly refillRatePerSec: number;
  private readonly store: RateLimitStore<TokenBucketState>;
  private readonly now: ClockFn;

  constructor(options: TokenBucketOptions) {
    if (!(options.capacity > 0)) throw new Error("capacity must be > 0");
    if (!(options.refillRatePerSec > 0)) throw new Error("refillRatePerSec must be > 0");
    this.capacity = options.capacity;
    this.refillRatePerSec = options.refillRatePerSec;
    this.store = options.store;
    this.now = options.now ?? Date.now;
  }

  async consume(key: string, cost = 1): Promise<RateLimitResult> {
    const now = this.now();
    const existing = await this.store.get(key);

    const lastRefillMs = existing?.lastRefillMs ?? now;
    const elapsedSec = Math.max(0, now - lastRefillMs) / 1000;
    const refilled = elapsedSec * this.refillRatePerSec;
    const tokensBeforeConsume = Math.min(
      this.capacity,
      (existing?.tokens ?? this.capacity) + refilled,
    );

    const allowed = tokensBeforeConsume >= cost;
    const tokensAfter = allowed ? tokensBeforeConsume - cost : tokensBeforeConsume;

    // TTL = time to fully refill from empty, so a key that stops being used
    // naturally falls out of the store instead of living forever.
    const ttlMs = Math.ceil((this.capacity / this.refillRatePerSec) * 1000);
    await this.store.set(key, { tokens: tokensAfter, lastRefillMs: now }, ttlMs);

    const remaining = Math.floor(tokensAfter);
    const deficitForFull = this.capacity - tokensAfter;
    const resetMs = Math.max(0, Math.ceil((deficitForFull / this.refillRatePerSec) * 1000));
    const retryAfterMs = allowed
      ? 0
      : Math.max(0, Math.ceil(((cost - tokensBeforeConsume) / this.refillRatePerSec) * 1000));

    return { allowed, limit: this.capacity, remaining, resetMs, retryAfterMs };
  }
}
