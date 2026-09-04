import { describe, expect, it, vi } from "vitest";
import { expressRateLimit, type ExpressLikeRequest, type ExpressLikeResponse } from "../src/expressAdapter.js";
import type { Limiter, RateLimitResult } from "../src/types.js";

function fakeLimiter(result: RateLimitResult): Limiter {
  return { consume: vi.fn().mockResolvedValue(result) };
}

function fakeResponse(): ExpressLikeResponse & { headers: Record<string, string>; statusCode?: number; ended: boolean; body?: unknown } {
  const res: ExpressLikeResponse & {
    headers: Record<string, string>;
    statusCode?: number;
    ended: boolean;
    body?: unknown;
  } = {
    headers: {},
    ended: false,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    end(chunk?: unknown) {
      res.ended = true;
      res.body = chunk;
    },
  };
  return res;
}

describe("expressRateLimit", () => {
  it("calls next() and sets headers when the request is allowed", async () => {
    const limiter = fakeLimiter({ allowed: true, limit: 5, remaining: 4, resetMs: 1000, retryAfterMs: 0 });
    const middleware = expressRateLimit({ limiter });
    const req: ExpressLikeRequest = { ip: "1.2.3.4", headers: {} };
    const res = fakeResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.headers["RateLimit-Limit"]).toBe("5");
    expect(res.headers["RateLimit-Remaining"]).toBe("4");
    expect(res.ended).toBe(false);
  });

  it("responds with 429 and does not call next() when the request is blocked", async () => {
    const limiter = fakeLimiter({ allowed: false, limit: 5, remaining: 0, resetMs: 1000, retryAfterMs: 1000 });
    const middleware = expressRateLimit({ limiter });
    const req: ExpressLikeRequest = { ip: "1.2.3.4", headers: {} };
    const res = fakeResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.ended).toBe(true);
    expect(res.headers["Retry-After"]).toBe("1");
  });

  it("uses a custom keyFn to derive the rate-limit key", async () => {
    const consume = vi.fn().mockResolvedValue({ allowed: true, limit: 1, remaining: 0, resetMs: 0, retryAfterMs: 0 });
    const middleware = expressRateLimit({
      limiter: { consume },
      keyFn: (req) => `user:${(req.headers["x-user-id"] as string) ?? "anon"}`,
    });
    const req: ExpressLikeRequest = { headers: { "x-user-id": "42" } };
    await middleware(req, fakeResponse(), vi.fn());

    expect(consume).toHaveBeenCalledWith("user:42", 1);
  });

  it("falls back to socket.remoteAddress when req.ip is absent", async () => {
    const consume = vi.fn().mockResolvedValue({ allowed: true, limit: 1, remaining: 0, resetMs: 0, retryAfterMs: 0 });
    const middleware = expressRateLimit({ limiter: { consume } });
    const req: ExpressLikeRequest = { headers: {}, socket: { remoteAddress: "9.9.9.9" } };
    await middleware(req, fakeResponse(), vi.fn());

    expect(consume).toHaveBeenCalledWith("9.9.9.9", 1);
  });

  it("invokes onLimitExceeded instead of the default 429 when provided", async () => {
    const limiter = fakeLimiter({ allowed: false, limit: 1, remaining: 0, resetMs: 0, retryAfterMs: 0 });
    const onLimitExceeded = vi.fn();
    const middleware = expressRateLimit({ limiter, onLimitExceeded });
    const res = fakeResponse();
    await middleware({ headers: {} }, res, vi.fn());

    expect(onLimitExceeded).toHaveBeenCalledOnce();
    expect(res.ended).toBe(false);
  });

  it("passes errors from the limiter to next(err)", async () => {
    const limiter: Limiter = { consume: vi.fn().mockRejectedValue(new Error("store down")) };
    const middleware = expressRateLimit({ limiter });
    const next = vi.fn();
    await middleware({ headers: {} }, fakeResponse(), next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
