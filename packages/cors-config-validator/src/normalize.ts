import type { CorsConfigLike, CorsHeaders, NormalizedCors } from "./types.js";

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function includesWildcard(value: string | string[] | undefined): boolean {
  if (value === undefined) return false;
  const list = Array.isArray(value) ? value : parseList(value);
  return list.includes("*");
}

/**
 * Builds a `NormalizedCors` from real (or fixture) response headers, given
 * the `Origin` value that was sent in the request that produced them. That
 * request origin is what makes reflected-origin detection possible: if the
 * server's `Access-Control-Allow-Origin` echoes back exactly the (clearly
 * non-allowlisted) origin we sent, it's reflecting without validating.
 */
export function normalizeFromHeaders(headers: CorsHeaders, requestOrigin?: string): NormalizedCors {
  const acao = headers.accessControlAllowOrigin;
  const wildcardOrigin = acao === "*";
  const reflectsArbitraryOrigin = Boolean(requestOrigin) && acao === requestOrigin && !wildcardOrigin;
  const credentials = headers.accessControlAllowCredentials === "true";
  const methodsWildcard = includesWildcard(headers.accessControlAllowMethods);
  const headersWildcard = includesWildcard(headers.accessControlAllowHeaders);
  const originIsDynamic = wildcardOrigin || reflectsArbitraryOrigin;
  const allowsNullOrigin = acao === "null";

  const varyIncludesOrigin =
    headers.vary === undefined
      ? undefined
      : parseList(headers.vary)
          .map((v) => v.toLowerCase())
          .includes("origin");

  return {
    wildcardOrigin,
    reflectsArbitraryOrigin,
    credentials,
    methodsWildcard,
    headersWildcard,
    varyIncludesOrigin,
    originIsDynamic,
    allowsNullOrigin,
  };
}

/**
 * Builds a `NormalizedCors` from a parsed CORS config object (config-file
 * mode — no network access). `origin: true` is the naive "reflect any
 * origin" setting several popular CORS middlewares expose, and is treated
 * the same as a live server that reflects an unvalidated origin.
 */
export function normalizeFromConfig(config: CorsConfigLike): NormalizedCors {
  const { origin } = config;
  const wildcardOrigin = origin === "*" || (Array.isArray(origin) && origin.includes("*"));
  const reflectsArbitraryOrigin = origin === true;
  const credentials = config.credentials === true;
  const methodsWildcard = includesWildcard(config.methods);
  const headersWildcard = includesWildcard(config.allowedHeaders);
  const originIsDynamic =
    wildcardOrigin ||
    reflectsArbitraryOrigin ||
    Array.isArray(origin) ||
    typeof origin === "function" ||
    origin instanceof RegExp;
  // A static `origin: "null"` or an allowlist array that includes the
  // literal string "null" both accept the `Origin: null` header that
  // sandboxed iframes, `data:`/`file:` pages, and redirected requests can
  // send — see the `allowsNullOrigin` doc comment on `NormalizedCors`.
  const allowsNullOrigin = origin === "null" || (Array.isArray(origin) && origin.includes("null"));

  return {
    wildcardOrigin,
    reflectsArbitraryOrigin,
    credentials,
    methodsWildcard,
    headersWildcard,
    // Config-file mode has no real HTTP response to inspect, so whether a
    // `Vary: Origin` header would actually be sent is unknowable here —
    // leaving this `undefined` means the missing-vary-origin rule (which
    // only fires on a definite `false`) is simply not evaluated in this mode.
    varyIncludesOrigin: undefined,
    originIsDynamic,
    allowsNullOrigin,
  };
}
