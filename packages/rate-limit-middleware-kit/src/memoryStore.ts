import type { RateLimitStore } from "./types.js";

interface Entry<TState> {
  state: TState;
  expiresAt: number;
}

export interface MemoryStoreOptions {
  /** How often to sweep expired entries, in ms. Set to 0 to disable the periodic timer entirely (lazy expiry on `get` still applies). Default: 60_000. */
  sweepIntervalMs?: number;
  /** Injectable clock, primarily for deterministic tests. Default: `Date.now`. */
  now?: () => number;
}

/**
 * A simple `Map`-based in-memory `RateLimitStore`.
 *
 * Two mechanisms keep memory bounded even under many distinct keys (e.g.
 * many distinct client IPs):
 *
 * 1. Lazy expiry: `get()` checks the entry's TTL and evicts it on access if
 *    it has expired, so a key that's actively (even if rarely) queried
 *    never returns stale state.
 * 2. A periodic sweep (`setInterval`, unref'd so it never keeps a process
 *    alive on its own) that walks the whole map and evicts anything expired
 *    — this is what actually reclaims memory for keys that are *never*
 *    queried again after they expire (e.g. a one-off client IP).
 *
 * This is process-local — for multi-instance deployments, implement
 * `RateLimitStore<TState>` against a shared store such as Redis.
 */
export class MemoryStore<TState> implements RateLimitStore<TState> {
  private readonly map = new Map<string, Entry<TState>>();
  private readonly now: () => number;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(options: MemoryStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    const sweepIntervalMs = options.sweepIntervalMs ?? 60_000;
    if (sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
      this.sweepTimer.unref?.();
    }
  }

  get(key: string): TState | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.state;
  }

  set(key: string, state: TState, ttlMs: number): void {
    this.map.set(key, { state, expiresAt: this.now() + Math.max(0, ttlMs) });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  /** Removes every currently-expired entry; returns how many were removed. Runs automatically on a timer, but can also be called manually. */
  sweep(): number {
    const now = this.now();
    let removed = 0;
    for (const [key, entry] of this.map) {
      if (entry.expiresAt <= now) {
        this.map.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Number of entries currently held, including any not-yet-swept expired ones. */
  get size(): number {
    return this.map.size;
  }

  /** Stops the periodic sweep timer (useful for tests / clean process shutdown). */
  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }
}

export function createMemoryStore<TState>(options?: MemoryStoreOptions): MemoryStore<TState> {
  return new MemoryStore<TState>(options);
}
