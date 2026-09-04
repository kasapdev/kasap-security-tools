import { describe, expect, it } from "vitest";
import { buildRateLimitHeaders } from "../src/headers.js";

describe("buildRateLimitHeaders", () => {
  it("sets RateLimit-Limit/Remaining/Reset for an allowed request", () => {
    const headers = buildRateLimitHeaders({
      allowed: true,
      limit: 10,
      remaining: 7,
      resetMs: 4200,
      retryAfterMs: 0,
    });
    expect(headers["RateLimit-Limit"]).toBe("10");
    expect(headers["RateLimit-Remaining"]).toBe("7");
    expect(headers["RateLimit-Reset"]).toBe("5"); // ceil(4200/1000)
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("adds Retry-After (delta-seconds) for a blocked request", () => {
    const headers = buildRateLimitHeaders({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetMs: 1500,
      retryAfterMs: 2500,
    });
    expect(headers["Retry-After"]).toBe("3"); // ceil(2500/1000)
    expect(headers["RateLimit-Remaining"]).toBe("0");
  });
});
