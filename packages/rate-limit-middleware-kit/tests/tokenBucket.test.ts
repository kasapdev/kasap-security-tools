import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../src/memoryStore.js";
import { TokenBucketLimiter, type TokenBucketState } from "../src/tokenBucket.js";
import { makeClock } from "./testClock.js";

function makeLimiter(capacity: number, refillRatePerSec: number, clock: ReturnType<typeof makeClock>) {
  const store = createMemoryStore<TokenBucketState>({ sweepIntervalMs: 0, now: clock.now });
  return new TokenBucketLimiter({ capacity, refillRatePerSec, store, now: clock.now });
}

describe("TokenBucketLimiter", () => {
  it("starts full: a fresh key can immediately consume up to capacity", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(5, 1, clock);
    for (let i = 0; i < 5; i++) {
      const result = await limiter.consume("key");
      expect(result.allowed).toBe(true);
    }
    const sixth = await limiter.consume("key");
    expect(sixth.allowed).toBe(false);
    expect(sixth.remaining).toBe(0);
  });

  it("refills at exactly refillRatePerSec tokens per second", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(10, 2, clock); // 2 tokens/sec

    for (let i = 0; i < 10; i++) await limiter.consume("key");
    const blocked = await limiter.consume("key");
    expect(blocked.allowed).toBe(false);

    // 3 seconds at 2 tokens/sec = 6 tokens refilled
    clock.advance(3000);
    for (let i = 0; i < 6; i++) {
      const r = await limiter.consume("key");
      expect(r.allowed).toBe(true);
    }
    const seventh = await limiter.consume("key");
    expect(seventh.allowed).toBe(false);
  });

  it("never refills beyond capacity even after a long idle period", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(5, 10, clock);
    await limiter.consume("key"); // 4 tokens left

    clock.advance(1_000_000); // enormous idle gap
    const result = await limiter.consume("key");
    expect(result.allowed).toBe(true);
    // capacity is 5; after this consume, remaining should be capacity - 1 = 4
    expect(result.remaining).toBe(4);
  });

  it("tracks distinct keys independently", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(1, 1, clock);
    const a = await limiter.consume("a");
    const b = await limiter.consume("b");
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("supports a variable cost per request", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(10, 1, clock);
    const result = await limiter.consume("key", 7);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);

    const blocked = await limiter.consume("key", 5);
    expect(blocked.allowed).toBe(false);
  });

  it("computes retryAfterMs as the time needed to accumulate the missing tokens", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(5, 1, clock); // 1 token/sec
    for (let i = 0; i < 5; i++) await limiter.consume("key");

    const blocked = await limiter.consume("key"); // needs 1 more token at 1/sec
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
  });

  it("does not consume tokens when the request is rejected", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(3, 1, clock);
    for (let i = 0; i < 3; i++) await limiter.consume("key");

    const before = await limiter.consume("key");
    expect(before.allowed).toBe(false);
    expect(before.remaining).toBe(0);

    clock.advance(1000); // +1 token
    const after = await limiter.consume("key");
    expect(after.allowed).toBe(true); // proves the earlier rejection didn't burn a token
  });

  it("rejects invalid configuration", () => {
    const store = createMemoryStore<TokenBucketState>({ sweepIntervalMs: 0 });
    expect(() => new TokenBucketLimiter({ capacity: 0, refillRatePerSec: 1, store })).toThrow();
    expect(() => new TokenBucketLimiter({ capacity: 1, refillRatePerSec: 0, store })).toThrow();
  });
});
