import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "../src/memoryStore.js";
import { makeClock } from "./testClock.js";

describe("MemoryStore", () => {
  it("returns undefined for a key that was never set", () => {
    const store = createMemoryStore<{ n: number }>({ sweepIntervalMs: 0 });
    expect(store.get("missing")).toBeUndefined();
  });

  it("returns the stored state while the ttl has not elapsed", () => {
    const clock = makeClock();
    const store = createMemoryStore<{ n: number }>({ sweepIntervalMs: 0, now: clock.now });
    store.set("k", { n: 1 }, 1000);
    clock.advance(999);
    expect(store.get("k")).toEqual({ n: 1 });
  });

  it("lazily expires an entry once its ttl has elapsed, evicting it from the map", () => {
    const clock = makeClock();
    const store = createMemoryStore<{ n: number }>({ sweepIntervalMs: 0, now: clock.now });
    store.set("k", { n: 1 }, 1000);
    clock.advance(1000);
    expect(store.get("k")).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("delete() removes an entry immediately", () => {
    const store = createMemoryStore<{ n: number }>({ sweepIntervalMs: 0 });
    store.set("k", { n: 1 }, 10_000);
    store.delete("k");
    expect(store.get("k")).toBeUndefined();
  });

  it("sweep() removes every currently-expired entry and reports how many were removed", () => {
    const clock = makeClock();
    const store = createMemoryStore<{ n: number }>({ sweepIntervalMs: 0, now: clock.now });
    store.set("a", { n: 1 }, 100);
    store.set("b", { n: 2 }, 100);
    store.set("c", { n: 3 }, 10_000);

    clock.advance(100);
    const removed = store.sweep();
    expect(removed).toBe(2);
    expect(store.size).toBe(1);
    expect(store.get("c")).toEqual({ n: 3 });
  });

  it("automatically sweeps stale entries on the configured periodic interval", () => {
    vi.useFakeTimers();
    try {
      const store = createMemoryStore<{ n: number }>({ sweepIntervalMs: 1000 });
      store.set("k", { n: 1 }, 10); // expires almost immediately relative to the sweep interval
      vi.advanceTimersByTime(1000);
      expect(store.size).toBe(0);
      store.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not schedule a periodic timer when sweepIntervalMs is 0", () => {
    const store = createMemoryStore<{ n: number }>({ sweepIntervalMs: 0 });
    // Nothing to assert on the timer directly, but stop() must be a safe no-op.
    expect(() => store.stop()).not.toThrow();
  });
});
