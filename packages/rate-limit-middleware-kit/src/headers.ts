import type { RateLimitResult } from "./types.js";

/**
 * Builds standard rate-limit response headers following the current
 * IETF draft convention (`draft-ietf-httpapi-ratelimit-headers`):
 * `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (all as
 * delta-seconds from now, per the draft), plus `Retry-After` (RFC 9110,
 * delta-seconds) when the request was rejected.
 */
export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetMs / 1000)),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(Math.ceil(result.retryAfterMs / 1000));
  }
  return headers;
}
