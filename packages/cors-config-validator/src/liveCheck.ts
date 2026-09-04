import { normalizeFromHeaders } from "./normalize.js";
import { runCorsRules } from "./rules.js";
import type { CorsFinding, CorsHeaders } from "./types.js";

export interface LiveCheckOptions {
  /**
   * Origin header value to send in the probe request. Defaults to a
   * randomly-generated, clearly non-allowlisted "evil" origin — this is
   * what makes reflected-origin-without-validation detectable: if the
   * server reflects an origin it could not possibly have allowlisted, its
   * origin check is broken (or absent).
   */
  probeOrigin?: string;
  assumePublicApi?: boolean;
  /** Injectable fetch implementation, primarily for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

function defaultProbeOrigin(): string {
  return `https://cors-audit-probe-${Math.random().toString(36).slice(2, 10)}.invalid`;
}

function extractCorsHeaders(res: Response): CorsHeaders {
  return {
    accessControlAllowOrigin: res.headers.get("access-control-allow-origin") ?? undefined,
    accessControlAllowCredentials: res.headers.get("access-control-allow-credentials") ?? undefined,
    accessControlAllowMethods: res.headers.get("access-control-allow-methods") ?? undefined,
    accessControlAllowHeaders: res.headers.get("access-control-allow-headers") ?? undefined,
    vary: res.headers.get("vary") ?? undefined,
  };
}

/**
 * Sends a real CORS preflight request (`OPTIONS` with `Origin` and
 * `Access-Control-Request-Method`) against `url` and audits the response
 * headers with the same rule engine used by config-file mode.
 *
 * **This makes a real network request.** Only ever run it against a URL you
 * personally own or are explicitly authorized to test — see the package
 * README's "Intended use" section. This function is deliberately not
 * exercised with a real network call in the automated (CI) test suite; it
 * is covered there only with a mocked `fetch` (see `tests/liveCheck.test.ts`),
 * and is otherwise an intentionally-manual-only code path.
 */
export async function liveCheck(url: string, options: LiveCheckOptions = {}): Promise<CorsFinding[]> {
  const probeOrigin = options.probeOrigin ?? defaultProbeOrigin();
  const doFetch = options.fetchImpl ?? fetch;

  const preflightResponse = await doFetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: probeOrigin,
      "Access-Control-Request-Method": "GET",
    },
  });

  const headers = extractCorsHeaders(preflightResponse);
  const normalized = normalizeFromHeaders(headers, probeOrigin);
  return runCorsRules(normalized, { assumePublicApi: options.assumePublicApi });
}
