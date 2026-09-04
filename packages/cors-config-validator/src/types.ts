export type Severity = "critical" | "high" | "medium" | "low";

export interface CorsFinding {
  ruleId: string;
  severity: Severity;
  message: string;
}

/** Raw CORS-related response headers, as observed from a real HTTP response or supplied as test fixtures. */
export interface CorsHeaders {
  accessControlAllowOrigin?: string;
  accessControlAllowCredentials?: string;
  accessControlAllowMethods?: string;
  accessControlAllowHeaders?: string;
  vary?: string;
}

/**
 * Common shape of the popular `cors` npm package's options object (and
 * similar Express/Koa/etc middleware config shapes). `origin: true` is that
 * package's "reflect the request Origin back, unconditionally" setting —
 * the naive-reflection pattern this tool specifically flags.
 */
export interface CorsConfigLike {
  origin?: boolean | string | string[] | RegExp | ((...args: unknown[]) => unknown);
  credentials?: boolean;
  methods?: string | string[];
  allowedHeaders?: string | string[];
}

/**
 * Framework/mode-agnostic representation the rule engine actually operates
 * on. Both live-check (from real response headers) and config-file (from a
 * parsed config object) modes reduce to this shape before running the same
 * rules.
 */
export interface NormalizedCors {
  wildcardOrigin: boolean;
  /** True when the server reflects an arbitrary, non-allowlisted origin back verbatim. */
  reflectsArbitraryOrigin: boolean;
  credentials: boolean;
  methodsWildcard: boolean;
  headersWildcard: boolean;
  /** `undefined` when it cannot be known (config-file mode has no real response to inspect). */
  varyIncludesOrigin?: boolean;
  originIsDynamic: boolean;
}
