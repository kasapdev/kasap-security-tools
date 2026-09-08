import type { CorsConfigLike } from "./types.js";

/** The cross-origin request being simulated against a config-file-mode CORS policy. */
export interface SimulatedRequest {
  /** The `Origin` header value the browser would send. */
  origin: string;
  /** The method the actual (non-preflight) request would use, e.g. `"PUT"`. */
  method: string;
  /**
   * Header names the browser would list in `Access-Control-Request-Headers`
   * (i.e. non-simple headers the real request wants to send, such as
   * `Authorization` or a custom `X-*` header). Omit or pass `[]` when the
   * request adds no such headers.
   */
  requestHeaders?: string[];
}

export type OriginMatchKind = "wildcard" | "reflect-any" | "exact-string" | "array" | "regex" | "function";

export interface OriginCheckResult {
  allowed: boolean;
  /** How the match was decided, when allowed. `undefined` when denied. */
  matchedBy?: OriginMatchKind;
  reason: string;
}

export interface MethodCheckResult {
  allowed: boolean;
  /** True when the configured methods list is a wildcard (`"*"`). */
  wildcard: boolean;
  /** The effective methods list that was checked against (after applying the library-convention default). */
  allowedMethods: string[];
  reason: string;
}

export interface HeadersCheckResult {
  allowed: boolean;
  /** True when the configured `allowedHeaders` is a wildcard (`"*"`). */
  wildcard: boolean;
  /** Requested headers (from `SimulatedRequest.requestHeaders`) that are not covered by the policy. Empty when allowed. */
  disallowed: string[];
  reason: string;
}

export interface PreflightSimulationResult {
  request: SimulatedRequest;
  origin: OriginCheckResult;
  method: MethodCheckResult;
  headers: HeadersCheckResult;
  credentials: boolean;
  /**
   * True when `credentials` is enabled but the origin, methods, or headers
   * check was only satisfied via a wildcard (`"*"`). Per the Fetch/CORS
   * spec, a wildcard value never satisfies a credentialed request — a
   * compliant browser rejects it client-side even though the response
   * headers "matched" on paper. `origin: true` (naive reflection) is *not*
   * a wildcard in this sense: the actual `Access-Control-Allow-Origin`
   * value sent back is the literal request origin, not `"*"`, so it does
   * satisfy the spec's credentialed-request requirement (see the separate
   * `reflected-origin-without-validation` rule for why that's still a
   * security problem).
   */
  blockedByCredentialsWildcard: boolean;
  /** Overall verdict: true only when origin, method, and headers all pass, and credentials don't get blocked by a wildcard. */
  allowed: boolean;
  /** Human-readable reasons for denial. Empty when `allowed` is true. */
  reasons: string[];
}

/** `cors` npm package's documented default when `methods` is not specified. */
const DEFAULT_METHODS = ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"];

function toList(value: string | string[]): string[] {
  if (Array.isArray(value)) return value;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Evaluates a `cors`-package-style `origin` function against a request
 * origin. These functions follow a Node-style `(origin, callback)`
 * convention where `callback(err, allow)` is invoked synchronously (or,
 * less commonly, the function directly returns a boolean). Since this is a
 * pure, synchronous simulation, an origin function that only resolves
 * asynchronously (e.g. does its own I/O and calls back on a later tick)
 * cannot be evaluated and is conservatively treated as denied.
 */
function evaluateFunctionOrigin(
  fn: (...args: unknown[]) => unknown,
  requestOrigin: string,
): OriginCheckResult {
  let called = false;
  let callbackErrored = false;
  let callbackAllowed = false;
  const callback = (err: unknown, allow?: unknown): void => {
    called = true;
    callbackErrored = Boolean(err);
    callbackAllowed = Boolean(allow);
  };

  let directReturn: unknown;
  try {
    directReturn = fn(requestOrigin, callback);
  } catch {
    return {
      allowed: false,
      reason: "The configured origin function threw synchronously while being evaluated; treated as a denial.",
    };
  }

  if (called) {
    if (callbackErrored) {
      return {
        allowed: false,
        reason: "The configured origin function's callback was invoked with an error; treated as a denial.",
      };
    }
    return {
      allowed: callbackAllowed,
      matchedBy: callbackAllowed ? "function" : undefined,
      reason: callbackAllowed
        ? "The configured origin function's callback allowed this origin."
        : "The configured origin function's callback denied this origin.",
    };
  }

  if (typeof directReturn === "boolean") {
    return {
      allowed: directReturn,
      matchedBy: directReturn ? "function" : undefined,
      reason: directReturn
        ? "The configured origin function returned true for this origin."
        : "The configured origin function returned false for this origin.",
    };
  }

  return {
    allowed: false,
    reason:
      "The configured origin function neither invoked its callback synchronously nor returned a boolean " +
      "(likely does asynchronous work). This cannot be simulated without real I/O; treated as a denial.",
  };
}

function evaluateOrigin(configOrigin: CorsConfigLike["origin"], requestOrigin: string): OriginCheckResult {
  if (configOrigin === undefined || configOrigin === false) {
    return {
      allowed: false,
      reason:
        configOrigin === false
          ? "`origin: false` disables CORS entirely — no origin is allowed."
          : "No `origin` is configured, so no cross-origin request is allowed.",
    };
  }

  if (configOrigin === true) {
    return {
      allowed: true,
      matchedBy: "reflect-any",
      reason:
        "`origin: true` reflects any request Origin back unconditionally (naive reflection — see the " +
        "reflected-origin-without-validation rule for the security implication of this).",
    };
  }

  if (configOrigin === "*") {
    return { allowed: true, matchedBy: "wildcard", reason: 'origin: "*" allows any origin.' };
  }

  if (typeof configOrigin === "string") {
    const allowed = configOrigin === requestOrigin;
    return {
      allowed,
      matchedBy: allowed ? "exact-string" : undefined,
      reason: allowed
        ? `Origin exactly matches the configured static origin "${configOrigin}".`
        : `Origin "${requestOrigin}" does not match the configured static origin "${configOrigin}".`,
    };
  }

  if (Array.isArray(configOrigin)) {
    if (configOrigin.includes("*")) {
      return {
        allowed: true,
        matchedBy: "wildcard",
        reason: 'The allowlist array includes "*", which allows any origin.',
      };
    }
    const allowed = configOrigin.includes(requestOrigin);
    return {
      allowed,
      matchedBy: allowed ? "array" : undefined,
      reason: allowed
        ? `Origin "${requestOrigin}" is present in the configured allowlist array.`
        : `Origin "${requestOrigin}" is not present in the configured allowlist array: [${configOrigin.join(", ")}].`,
    };
  }

  if (configOrigin instanceof RegExp) {
    const allowed = configOrigin.test(requestOrigin);
    return {
      allowed,
      matchedBy: allowed ? "regex" : undefined,
      reason: allowed
        ? `Origin "${requestOrigin}" matches the configured allowlist regex ${configOrigin}.`
        : `Origin "${requestOrigin}" does not match the configured allowlist regex ${configOrigin}.`,
    };
  }

  // Only remaining CorsConfigLike['origin'] shape is a function.
  return evaluateFunctionOrigin(configOrigin, requestOrigin);
}

function evaluateMethod(configMethods: CorsConfigLike["methods"], requestMethod: string): MethodCheckResult {
  const list = configMethods === undefined ? DEFAULT_METHODS : toList(configMethods);
  const wildcard = list.includes("*");
  const requestUpper = requestMethod.toUpperCase();
  const allowed = wildcard || list.some((m) => m.toUpperCase() === requestUpper);

  return {
    allowed,
    wildcard,
    allowedMethods: list,
    reason: wildcard
      ? 'Access-Control-Allow-Methods is a wildcard ("*"), so any method is allowed.'
      : allowed
        ? `Method "${requestMethod}" is in the configured methods list: [${list.join(", ")}].`
        : `Method "${requestMethod}" is not in the configured methods list: [${list.join(", ")}].`,
  };
}

function evaluateHeaders(
  configHeaders: CorsConfigLike["allowedHeaders"],
  requestHeaders: string[] | undefined,
): HeadersCheckResult {
  const requested = requestHeaders ?? [];

  if (configHeaders === undefined) {
    // `cors` package convention: an unset `allowedHeaders` reflects back
    // whatever the request asked for in `Access-Control-Request-Headers`,
    // rather than denying everything not on an explicit list.
    return {
      allowed: true,
      wildcard: false,
      disallowed: [],
      reason:
        requested.length === 0
          ? "No Access-Control-Request-Headers were requested, and allowedHeaders is unset."
          : `allowedHeaders is unset, which reflects the requested header(s) back verbatim: ${requested.join(", ")}.`,
    };
  }

  const configured = toList(configHeaders);
  const wildcard = configured.includes("*");
  if (wildcard) {
    return {
      allowed: true,
      wildcard: true,
      disallowed: [],
      reason: 'Access-Control-Allow-Headers is a wildcard ("*"), so any requested header is allowed.',
    };
  }

  // Header field names are matched case-insensitively per the Fetch spec.
  const configuredLower = new Set(configured.map((h) => h.toLowerCase()));
  const disallowed = requested.filter((h) => !configuredLower.has(h.toLowerCase()));

  return {
    allowed: disallowed.length === 0,
    wildcard: false,
    disallowed,
    reason:
      disallowed.length === 0
        ? "All requested headers are present (case-insensitively) in the configured allowedHeaders list."
        : `Requested header(s) not covered by the configured allowedHeaders list (case-insensitive match): ${disallowed.join(", ")}.`,
  };
}

/**
 * Simulates a single cross-origin request against a config-file-mode CORS
 * policy (the same `CorsConfigLike` shape `normalizeFromConfig` reads),
 * computing exactly what the policy would allow or deny — per the real
 * Fetch/CORS spec rules, not the reduced allow/deny-relevant booleans
 * `NormalizedCors` uses for the rule engine. Makes no network call.
 *
 * This is useful for answering concrete questions a rule-engine finding
 * can't: "would `https://partner.example` calling `PUT` with an
 * `Authorization` header actually be allowed by this config?"
 *
 * Three real spec subtleties this accounts for:
 * - `origin: true` (naive reflection) satisfies a credentialed request's
 *   origin check (the literal origin is echoed back — not `"*"`), while a
 *   real `origin: "*"` wildcard never does, regardless of what
 *   `Access-Control-Allow-Credentials` says.
 * - An unset `allowedHeaders` reflects whatever was requested (the `cors`
 *   package's actual default), rather than denying every header.
 * - Header name matching is case-insensitive; method matching is
 *   case-insensitive here too, matching how browsers normalize the method
 *   before comparing (methods are conventionally upper-cased).
 */
export function simulatePreflight(
  config: CorsConfigLike,
  request: SimulatedRequest,
): PreflightSimulationResult {
  const origin = evaluateOrigin(config.origin, request.origin);
  const method = evaluateMethod(config.methods, request.method);
  const headers = evaluateHeaders(config.allowedHeaders, request.requestHeaders);
  const credentials = config.credentials === true;

  const blockedByCredentialsWildcard =
    credentials && (origin.matchedBy === "wildcard" || method.wildcard || headers.wildcard);

  const reasons: string[] = [];
  if (!origin.allowed) reasons.push(origin.reason);
  if (!method.allowed) reasons.push(method.reason);
  if (!headers.allowed) reasons.push(headers.reason);
  if (blockedByCredentialsWildcard) {
    reasons.push(
      "Credentials are enabled, but the origin, methods, or headers check was only satisfied via a " +
        'wildcard ("*"). Per the Fetch/CORS spec, a wildcard cannot satisfy a credentialed request — a ' +
        "compliant browser blocks this client-side even though the response headers technically matched.",
    );
  }

  const allowed = origin.allowed && method.allowed && headers.allowed && !blockedByCredentialsWildcard;

  return { request, origin, method, headers, credentials, blockedByCredentialsWildcard, allowed, reasons };
}
