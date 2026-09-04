/** Injectable clock function, so algorithms can be unit-tested deterministically. */
export type ClockFn = () => number;

/** Result of a single `consume()` call against a limiter. */
export interface RateLimitResult {
  allowed: boolean;
  /** The configured limit (bucket capacity, or window request count). */
  limit: number;
  /** Requests/tokens remaining right now (floored). */
  remaining: number;
  /** Milliseconds from now until the limit is fully available again. */
  resetMs: number;
  /** Only meaningful when `allowed` is false: milliseconds to wait before retrying. */
  retryAfterMs: number;
}

/**
 * Pluggable state store, generic over the per-algorithm state shape.
 *
 * This interface is intentionally minimal and async-friendly so it's
 * genuinely sufficient to back with Redis: `get` maps to a `GET`/`HGETALL`
 * (JSON-decode the value), `set` maps to a `SET key value PX ttlMs` (or
 * `SETEX` in seconds), and `delete` maps to `DEL`. A Redis-backed store is
 * not implemented in this package (no Redis client dependency is pulled
 * in), but nothing about this interface assumes an in-process Map.
 */
export interface RateLimitStore<TState> {
  get(key: string): TState | undefined | Promise<TState | undefined>;
  set(key: string, state: TState, ttlMs: number): void | Promise<void>;
  delete?(key: string): void | Promise<void>;
}

/** Common surface both `TokenBucketLimiter` and `SlidingWindowLimiter` implement. */
export interface Limiter {
  consume(key: string, cost?: number): Promise<RateLimitResult> | RateLimitResult;
}
