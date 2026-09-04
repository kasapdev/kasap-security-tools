import { buildRateLimitHeaders } from "./headers.js";
import type { Limiter } from "./types.js";

/**
 * Minimal structural subset of Express's `Request` that this adapter needs.
 * Deliberately not importing the `express` package's types so this package
 * has zero runtime/type dependency on Express — a real `express.Request`
 * satisfies this shape.
 */
export interface ExpressLikeRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}

/** Minimal structural subset of Express's `Response` that this adapter needs. */
export interface ExpressLikeResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): ExpressLikeResponse;
  end(chunk?: unknown): unknown;
}

export type ExpressNextFn = (err?: unknown) => void;

export interface ExpressRateLimitOptions {
  limiter: Limiter;
  /** Derives the rate-limit key from the request. Defaults to the client IP. */
  keyFn?: (req: ExpressLikeRequest) => string;
  /** Number of tokens/slots this request consumes. Default 1. */
  cost?: number;
  /** Called instead of the default 429 response when the limit is exceeded. */
  onLimitExceeded?: (req: ExpressLikeRequest, res: ExpressLikeResponse) => void;
}

function defaultKeyFn(req: ExpressLikeRequest): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/**
 * Returns an Express-style `(req, res, next)` middleware backed by the
 * given `Limiter` (a `TokenBucketLimiter` or `SlidingWindowLimiter`).
 */
export function expressRateLimit(options: ExpressRateLimitOptions) {
  const keyFn = options.keyFn ?? defaultKeyFn;
  const cost = options.cost ?? 1;

  return async function rateLimitMiddleware(
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
    next: ExpressNextFn,
  ): Promise<void> {
    try {
      const key = keyFn(req);
      const result = await options.limiter.consume(key, cost);

      const headers = buildRateLimitHeaders(result);
      for (const [name, value] of Object.entries(headers)) {
        res.setHeader(name, value);
      }

      if (!result.allowed) {
        if (options.onLimitExceeded) {
          options.onLimitExceeded(req, res);
        } else {
          res.status(429).end("Too Many Requests");
        }
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
