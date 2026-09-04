import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../src/memoryStore.js";
import { SlidingWindowLimiter, type SlidingWindowState } from "../src/slidingWindow.js";
import { makeClock } from "./testClock.js";

function makeLimiter(limit: number, windowMs: number, clock: ReturnType<typeof makeClock>) {
  const store = createMemoryStore<SlidingWindowState>({ sweepIntervalMs: 0, now: clock.now });
  return new SlidingWindowLimiter({ limit, windowMs, store, now: clock.now });
}

describe("SlidingWindowLimiter", () => {
  it("allows up to `limit` requests within the window, then blocks", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(3, 1000, clock);
    for (let i = 0; i < 3; i++) {
      expect((await limiter.consume("key")).allowed).toBe(true);
    }
    const fourth = await limiter.consume("key");
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("still blocks 1ms before the window fully elapses (exclusive lower boundary)", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(3, 1000, clock);
    for (let i = 0; i < 3; i++) await limiter.consume("key");

    clock.advance(999);
    const result = await limiter.consume("key");
    expect(result.allowed).toBe(false);
  });

  it("allows a request again exactly when the oldest timestamp leaves the window", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(3, 1000, clock);
    for (let i = 0; i < 3; i++) await limiter.consume("key"); // all at t=0

    clock.advance(1000); // t=1000: window is (0, 1000], the t=0 entries are no longer > windowStart(0)
    const result = await limiter.consume("key");
    expect(result.allowed).toBe(true);
  });

  it("expires only the timestamps that have individually aged out (partial expiry)", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(3, 1000, clock);

    await limiter.consume("key"); // t=0
    clock.advance(300);
    await limiter.consume("key"); // t=300
    clock.advance(300);
    await limiter.consume("key"); // t=600 -> window now full (3 requests)

    clock.advance(401); // t=1001; windowStart = 1; t=0 has aged out, t=300 & t=600 remain
    const result = await limiter.consume("key");
    expect(result.allowed).toBe(true); // only 2 remained, so the 3rd (new) fits
    expect(result.remaining).toBe(0); // now 3 timestamps again (300, 600, 1001)

    const blocked = await limiter.consume("key");
    expect(blocked.allowed).toBe(false);
  });

  it("tracks distinct keys independently", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(1, 1000, clock);
    expect((await limiter.consume("a")).allowed).toBe(true);
    expect((await limiter.consume("b")).allowed).toBe(true);
  });

  it("rejects a multi-cost request atomically (no partial consumption)", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(3, 1000, clock);
    await limiter.consume("key"); // 1 used, 2 remain

    const rejected = await limiter.consume("key", 5);
    expect(rejected.allowed).toBe(false);

    // Confirm nothing was recorded by the rejected attempt: 2 more single
    // requests should still fit within the limit of 3.
    expect((await limiter.consume("key")).allowed).toBe(true);
    expect((await limiter.consume("key")).allowed).toBe(true);
    expect((await limiter.consume("key")).allowed).toBe(false);
  });

  it("computes resetMs as the time until the oldest timestamp leaves the window", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(1, 1000, clock);
    await limiter.consume("key"); // t=0

    clock.advance(400);
    const blocked = await limiter.consume("key");
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetMs).toBe(600);
  });

  it("rejects invalid configuration", () => {
    const store = createMemoryStore<SlidingWindowState>({ sweepIntervalMs: 0 });
    expect(() => new SlidingWindowLimiter({ limit: 0, windowMs: 1000, store })).toThrow();
    expect(() => new SlidingWindowLimiter({ limit: 1, windowMs: 0, store })).toThrow();
  });
});
