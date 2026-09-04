import { buildRateLimitHeaders } from "./headers.js";
import type { Limiter } from "./types.js";

/**
 * Minimal structural subset of Fastify's `FastifyRequest` that this adapter
 * needs. Deliberately not importing the `fastify` package's types so this
 * package has zero runtime/type dependency on Fastify — a real
 * `FastifyRequest` satisfies this shape.
 */
export interface FastifyLikeRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Minimal structural subset of Fastify's `FastifyReply` that this adapter needs. */
export interface FastifyLikeReply {
  header(name: string, value: string): FastifyLikeReply;
  code(statusCode: number): FastifyLikeReply;
  send(payload?: unknown): FastifyLikeReply;
}

export interface FastifyRateLimitOptions {
  limiter: Limiter;
  /** Derives the rate-limit key from the request. Defaults to the client IP. */
  keyFn?: (req: FastifyLikeRequest) => string;
  /** Number of tokens/slots this request consumes. Default 1. */
  cost?: number;
}

function defaultKeyFn(req: FastifyLikeRequest): string {
  return req.ip ?? "unknown";
}

/**
 * Returns a Fastify `onRequest`-hook-compatible async function backed by
 * the given `Limiter`. Register it with `fastify.addHook("onRequest", ...)`
 * (globally) or as a route-level `onRequest` option. Calling `reply.send()`
 * from inside an `onRequest` hook is the standard Fastify way to short-
 * circuit the request lifecycle, which is exactly what happens here when
 * the limit is exceeded.
 */
export function fastifyRateLimit(options: FastifyRateLimitOptions) {
  const keyFn = options.keyFn ?? defaultKeyFn;
  const cost = options.cost ?? 1;

  return async function rateLimitOnRequestHook(
    request: FastifyLikeRequest,
    reply: FastifyLikeReply,
  ): Promise<void> {
    const key = keyFn(request);
    const result = await options.limiter.consume(key, cost);

    const headers = buildRateLimitHeaders(result);
    for (const [name, value] of Object.entries(headers)) {
      reply.header(name, value);
    }

    if (!result.allowed) {
      reply.code(429).send({ error: "Too Many Requests" });
    }
  };
}
