import type { CorsFinding, NormalizedCors } from "./types.js";

export interface RuleOptions {
  /** Suppresses the informational `wildcard-origin` finding for APIs that are intentionally fully public. */
  assumePublicApi?: boolean;
}

/**
 * The core rule engine. Pure function over a `NormalizedCors` value — no
 * network or file I/O — so both live-check and config-file mode share
 * exactly the same security logic, and it's trivially unit-testable against
 * fixtures.
 */
export function runCorsRules(normalized: NormalizedCors, options: RuleOptions = {}): CorsFinding[] {
  const findings: CorsFinding[] = [];

  if (normalized.wildcardOrigin && normalized.credentials) {
    findings.push({
      ruleId: "wildcard-origin-with-credentials",
      severity: "critical",
      message:
        'Access-Control-Allow-Origin: "*" is combined with Access-Control-Allow-Credentials: true. This ' +
        "combination is invalid per the Fetch/CORS spec (compliant browsers reject it), but many servers " +
        "and proxies set both anyway — which usually means the origin allowlist check was never actually " +
        "wired up, and any origin can make credentialed requests against clients that don't enforce it.",
    });
  }

  if (normalized.wildcardOrigin && !normalized.credentials && !options.assumePublicApi) {
    findings.push({
      ruleId: "wildcard-origin",
      severity: "medium",
      message:
        'Access-Control-Allow-Origin is "*", so any website can read responses from this endpoint via ' +
        "cross-origin JavaScript. This is expected for a genuinely public, unauthenticated API, but is " +
        "often left over from development and unintentional in production. Pass --assume-public-api / " +
        "assumePublicApi to suppress this for endpoints that are meant to be fully public.",
    });
  }

  if (normalized.allowsNullOrigin) {
    findings.push({
      ruleId: "null-origin-allowed",
      severity: normalized.credentials ? "critical" : "high",
      message:
        'The origin allowlist accepts the literal string "null". Browsers send `Origin: null` from ' +
        "contexts an attacker can trivially trigger — sandboxed `<iframe>` documents, `data:`/`file:` " +
        "pages, and some redirected requests — so allowlisting it is effectively equivalent to allowing " +
        "an attacker-controlled origin" +
        (normalized.credentials ? ", combined here with credentialed requests." : ".") +
        ' Remove "null" from the allowlist unless you have a specific, well-understood reason to trust it.',
    });
  }

  if (normalized.reflectsArbitraryOrigin && !normalized.wildcardOrigin) {
    findings.push({
      ruleId: "reflected-origin-without-validation",
      severity: normalized.credentials ? "critical" : "high",
      message:
        "The server reflects the request's Origin header back verbatim without validating it against an " +
        "allowlist. This behaves like a wildcard for every origin while still allowing " +
        (normalized.credentials
          ? "credentialed (cookie/Authorization-header-bearing) requests, which is a serious CSRF/data-theft risk."
          : "any origin to be accepted, defeating the purpose of an origin check."),
    });
  }

  const broadMethodsOrHeaders = normalized.methodsWildcard || normalized.headersWildcard;
  if (broadMethodsOrHeaders && normalized.credentials) {
    findings.push({
      ruleId: "overly-broad-methods-or-headers-with-credentials",
      severity: "critical",
      message:
        'Access-Control-Allow-Methods and/or Access-Control-Allow-Headers is a wildcard ("*") while ' +
        "credentials are allowed. Per spec a wildcard isn't supposed to satisfy a credentialed request, " +
        "but misconfigured servers/proxies can still make this practically exploitable — restrict both to " +
        "an explicit list.",
    });
  } else if (broadMethodsOrHeaders) {
    findings.push({
      ruleId: "overly-broad-methods-or-headers",
      severity: "low",
      message:
        'Access-Control-Allow-Methods and/or Access-Control-Allow-Headers is a wildcard ("*"). Consider ' +
        "listing only the methods/headers the API actually needs, to reduce the attack surface.",
    });
  }

  if (normalized.originIsDynamic && normalized.varyIncludesOrigin === false) {
    findings.push({
      ruleId: "missing-vary-origin",
      severity: "medium",
      message:
        'Access-Control-Allow-Origin is dynamic/reflected, but the response is missing "Vary: Origin". ' +
        "A shared/intermediate cache could store a response generated for one origin and serve it to a " +
        "different origin, leaking data cross-origin.",
    });
  }

  return findings;
}
