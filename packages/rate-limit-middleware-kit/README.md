# @kasap/rate-limit-middleware-kit

Framework-agnostic rate limiting with two real algorithm implementations —
**token bucket** and **sliding window log** — plus thin adapters for Express
and Fastify. No dependency on `express` or `fastify` themselves; the
adapters use structural ("duck") typing against the small slice of each
framework's request/response API they actually need.

## Algorithms

- **Token bucket** (`TokenBucketLimiter`): each key gets a bucket that
  starts full (`capacity` tokens) and refills continuously at
  `refillRatePerSec` tokens/second, capped at `capacity`. Allows short
  bursts up to `capacity` while enforcing a long-run average rate.
- **Sliding window log** (`SlidingWindowLimiter`): keeps a timestamp log per
  key; a request is allowed only if fewer than `limit` timestamps remain in
  the trailing `windowMs`. No fixed-window reset cliff.

Both are backed by a pluggable `RateLimitStore<TState>` (`get`/`set`, async-
friendly). `MemoryStore` is a real `Map`-based implementation with lazy
expiry (checked on `get`) *and* a periodic background sweep (unref'd
`setInterval`, default every 60s) so idle keys don't grow memory forever.

### Implementing a Redis-backed store

`RateLimitStore<TState>` is intentionally minimal so it maps directly onto
Redis commands:

```ts
import type { RateLimitStore } from "@kasap/rate-limit-middleware-kit";

class RedisStore<TState> implements RateLimitStore<TState> {
  constructor(private redis: RedisClient, private prefix = "rl:") {}

  async get(key: string): Promise<TState | undefined> {
    const raw = await this.redis.get(this.prefix + key);
    return raw ? (JSON.parse(raw) as TState) : undefined;
  }

  async set(key: string, state: TState, ttlMs: number): Promise<void> {
    await this.redis.set(this.prefix + key, JSON.stringify(state), "PX", ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}
```

(Not implemented here to avoid pulling in a Redis client dependency — but
nothing about the interface assumes an in-process store.)

## Usage

### Express

```ts
import express from "express";
import {
  TokenBucketLimiter,
  createMemoryStore,
  expressRateLimit,
  type TokenBucketState,
} from "@kasap/rate-limit-middleware-kit";

const limiter = new TokenBucketLimiter({
  capacity: 20,
  refillRatePerSec: 5,
  store: createMemoryStore<TokenBucketState>(),
});

const app = express();
app.use(expressRateLimit({ limiter })); // keys by req.ip by default
```

### Fastify

```ts
import Fastify from "fastify";
import {
  SlidingWindowLimiter,
  createMemoryStore,
  fastifyRateLimit,
  type SlidingWindowState,
} from "@kasap/rate-limit-middleware-kit";

const limiter = new SlidingWindowLimiter({
  limit: 100,
  windowMs: 60_000,
  store: createMemoryStore<SlidingWindowState>(),
});

const fastify = Fastify();
fastify.addHook("onRequest", fastifyRateLimit({ limiter }));
```

### Custom key function (e.g. per API key instead of per IP)

```ts
expressRateLimit({
  limiter,
  keyFn: (req) => (req.headers["x-api-key"] as string) ?? req.ip ?? "unknown",
});
```

## Response headers

Both adapters set the current IETF-draft rate-limit headers
(`draft-ietf-httpapi-ratelimit-headers`):

```
RateLimit-Limit: 20
RateLimit-Remaining: 17
RateLimit-Reset: 4
```

and, only on a blocked (429) response, `Retry-After` (RFC 9110
delta-seconds).

## Tests

```bash
pnpm --filter @kasap/rate-limit-middleware-kit test
```

All algorithm tests use an injectable clock (`now` option) instead of real
`setTimeout` delays, so they run instantly and deterministically while still
exercising exact refill/expiry math and boundary conditions.
