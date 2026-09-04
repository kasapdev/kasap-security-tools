import { describe, expect, it, vi } from "vitest";
import { fastifyRateLimit, type FastifyLikeReply, type FastifyLikeRequest } from "../src/fastifyAdapter.js";
import type { Limiter, RateLimitResult } from "../src/types.js";

function fakeLimiter(result: RateLimitResult): Limiter {
  return { consume: vi.fn().mockResolvedValue(result) };
}

function fakeReply(): FastifyLikeReply & { headers: Record<string, string>; statusCode?: number; sent?: unknown } {
  const reply: FastifyLikeReply & { headers: Record<string, string>; statusCode?: number; sent?: unknown } = {
    headers: {},
    header(name: string, value: string) {
      reply.headers[name] = value;
      return reply;
    },
    code(statusCode: number) {
      reply.statusCode = statusCode;
      return reply;
    },
    send(payload?: unknown) {
      reply.sent = payload;
      return reply;
    },
  };
  return reply;
}

describe("fastifyRateLimit", () => {
  it("sets rate-limit headers and does not send a response when allowed", async () => {
    const limiter = fakeLimiter({ allowed: true, limit: 5, remaining: 2, resetMs: 3000, retryAfterMs: 0 });
    const hook = fastifyRateLimit({ limiter });
    const request: FastifyLikeRequest = { ip: "1.2.3.4", headers: {} };
    const reply = fakeReply();

    await hook(request, reply);

    expect(reply.headers["RateLimit-Limit"]).toBe("5");
    expect(reply.headers["RateLimit-Remaining"]).toBe("2");
    expect(reply.sent).toBeUndefined();
    expect(reply.statusCode).toBeUndefined();
  });

  it("sends a 429 when the request is blocked", async () => {
    const limiter = fakeLimiter({ allowed: false, limit: 5, remaining: 0, resetMs: 2000, retryAfterMs: 2000 });
    const hook = fastifyRateLimit({ limiter });
    const reply = fakeReply();

    await hook({ ip: "1.2.3.4", headers: {} }, reply);

    expect(reply.statusCode).toBe(429);
    expect(reply.sent).toEqual({ error: "Too Many Requests" });
    expect(reply.headers["Retry-After"]).toBe("2");
  });

  it("uses a custom keyFn to derive the rate-limit key", async () => {
    const consume = vi.fn().mockResolvedValue({ allowed: true, limit: 1, remaining: 0, resetMs: 0, retryAfterMs: 0 });
    const hook = fastifyRateLimit({
      limiter: { consume },
      keyFn: (req) => `api-key:${(req.headers["x-api-key"] as string) ?? "none"}`,
    });
    await hook({ headers: { "x-api-key": "abc" } }, fakeReply());

    expect(consume).toHaveBeenCalledWith("api-key:abc", 1);
  });

  it("defaults the key to request.ip", async () => {
    const consume = vi.fn().mockResolvedValue({ allowed: true, limit: 1, remaining: 0, resetMs: 0, retryAfterMs: 0 });
    const hook = fastifyRateLimit({ limiter: { consume } });
    await hook({ ip: "5.6.7.8", headers: {} }, fakeReply());

    expect(consume).toHaveBeenCalledWith("5.6.7.8", 1);
  });
});
