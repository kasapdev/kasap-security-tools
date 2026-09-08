import { describe, expect, it } from "vitest";
import { simulatePreflight } from "../src/simulate.js";

const REQ = { origin: "https://partner.example", method: "PUT" };

describe("simulatePreflight — origin matching", () => {
  it("denies when origin is unset", () => {
    const result = simulatePreflight({}, REQ);
    expect(result.origin.allowed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  it("denies when origin: false", () => {
    const result = simulatePreflight({ origin: false }, REQ);
    expect(result.origin.allowed).toBe(false);
    expect(result.origin.reason).toMatch(/disables CORS/);
  });

  it("allows any origin via origin: true (naive reflection) and reports matchedBy", () => {
    const result = simulatePreflight({ origin: true }, REQ);
    expect(result.origin.allowed).toBe(true);
    expect(result.origin.matchedBy).toBe("reflect-any");
  });

  it('allows any origin via origin: "*" and reports matchedBy wildcard', () => {
    const result = simulatePreflight({ origin: "*" }, REQ);
    expect(result.origin.allowed).toBe(true);
    expect(result.origin.matchedBy).toBe("wildcard");
  });

  it("matches an exact static string origin", () => {
    const allowed = simulatePreflight({ origin: "https://partner.example" }, REQ);
    expect(allowed.origin.allowed).toBe(true);
    expect(allowed.origin.matchedBy).toBe("exact-string");

    const denied = simulatePreflight({ origin: "https://other.example" }, REQ);
    expect(denied.origin.allowed).toBe(false);
    expect(denied.origin.matchedBy).toBeUndefined();
  });

  it("matches an origin allowlist array, and array-wildcard allows everything", () => {
    const allowed = simulatePreflight(
      { origin: ["https://a.example", "https://partner.example"] },
      REQ,
    );
    expect(allowed.origin.allowed).toBe(true);
    expect(allowed.origin.matchedBy).toBe("array");

    const denied = simulatePreflight({ origin: ["https://a.example", "https://b.example"] }, REQ);
    expect(denied.origin.allowed).toBe(false);

    const wildcardArray = simulatePreflight({ origin: ["*"] }, REQ);
    expect(wildcardArray.origin.allowed).toBe(true);
    expect(wildcardArray.origin.matchedBy).toBe("wildcard");
  });

  it("matches an origin regex", () => {
    const allowed = simulatePreflight({ origin: /\.example$/ }, REQ);
    expect(allowed.origin.allowed).toBe(true);
    expect(allowed.origin.matchedBy).toBe("regex");

    const denied = simulatePreflight({ origin: /\.other$/ }, REQ);
    expect(denied.origin.allowed).toBe(false);
  });

  it("evaluates a cors-package-style origin function via its (origin, callback) convention", () => {
    const allowFn = (origin: unknown, cb: (err: unknown, allow?: unknown) => void) => cb(null, true);
    const allowed = simulatePreflight({ origin: allowFn }, REQ);
    expect(allowed.origin.allowed).toBe(true);
    expect(allowed.origin.matchedBy).toBe("function");

    const denyFn = (origin: unknown, cb: (err: unknown, allow?: unknown) => void) => cb(null, false);
    const denied = simulatePreflight({ origin: denyFn }, REQ);
    expect(denied.origin.allowed).toBe(false);

    const errFn = (origin: unknown, cb: (err: unknown, allow?: unknown) => void) => cb(new Error("boom"), true);
    const errored = simulatePreflight({ origin: errFn }, REQ);
    expect(errored.origin.allowed).toBe(false);
  });

  it("evaluates an origin function that directly returns a boolean instead of using a callback", () => {
    const allowed = simulatePreflight({ origin: () => true }, REQ);
    expect(allowed.origin.allowed).toBe(true);
    expect(allowed.origin.matchedBy).toBe("function");

    const denied = simulatePreflight({ origin: () => false }, REQ);
    expect(denied.origin.allowed).toBe(false);
  });

  it("denies (without throwing) when an origin function throws synchronously", () => {
    const result = simulatePreflight(
      {
        origin: () => {
          throw new Error("boom");
        },
      },
      REQ,
    );
    expect(result.origin.allowed).toBe(false);
    expect(result.origin.reason).toMatch(/threw synchronously/);
  });

  it("denies when an origin function neither calls back nor returns a boolean (unsimulatable async)", () => {
    const result = simulatePreflight({ origin: () => undefined }, REQ);
    expect(result.origin.allowed).toBe(false);
    expect(result.origin.reason).toMatch(/asynchronous/);
  });
});

describe("simulatePreflight — method matching", () => {
  it("uses the cors-package default method list when methods is unset", () => {
    const result = simulatePreflight({ origin: "*" }, { origin: "https://x.example", method: "POST" });
    expect(result.method.allowed).toBe(true);
    expect(result.method.allowedMethods).toEqual(["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"]);
  });

  it("denies a method not in an explicit methods list", () => {
    const result = simulatePreflight(
      { origin: "*", methods: ["GET", "POST"] },
      { origin: "https://x.example", method: "DELETE" },
    );
    expect(result.method.allowed).toBe(false);
  });

  it("matches methods case-insensitively", () => {
    const result = simulatePreflight(
      { origin: "*", methods: "get,post" },
      { origin: "https://x.example", method: "GET" },
    );
    expect(result.method.allowed).toBe(true);
  });

  it("treats a methods wildcard as allowing anything", () => {
    const result = simulatePreflight(
      { origin: "*", methods: "*" },
      { origin: "https://x.example", method: "PURGE" },
    );
    expect(result.method.allowed).toBe(true);
    expect(result.method.wildcard).toBe(true);
  });
});

describe("simulatePreflight — header matching", () => {
  it("allows when no headers were requested, regardless of config", () => {
    const result = simulatePreflight({ origin: "*" }, { origin: "https://x.example", method: "GET" });
    expect(result.headers.allowed).toBe(true);
    expect(result.headers.disallowed).toEqual([]);
  });

  it("reflects (allows) requested headers when allowedHeaders is unset — cors package convention", () => {
    const result = simulatePreflight(
      { origin: "*" },
      { origin: "https://x.example", method: "GET", requestHeaders: ["Authorization", "X-Custom"] },
    );
    expect(result.headers.allowed).toBe(true);
  });

  it("matches header names case-insensitively against an explicit allowedHeaders list", () => {
    const result = simulatePreflight(
      { origin: "*", allowedHeaders: ["content-type", "Authorization"] },
      { origin: "https://x.example", method: "GET", requestHeaders: ["Content-Type", "authorization"] },
    );
    expect(result.headers.allowed).toBe(true);
    expect(result.headers.disallowed).toEqual([]);
  });

  it("reports the specific disallowed headers when some are not covered", () => {
    const result = simulatePreflight(
      { origin: "*", allowedHeaders: ["Content-Type"] },
      { origin: "https://x.example", method: "GET", requestHeaders: ["Content-Type", "X-Api-Key"] },
    );
    expect(result.headers.allowed).toBe(false);
    expect(result.headers.disallowed).toEqual(["X-Api-Key"]);
  });

  it("treats a headers wildcard as allowing anything requested", () => {
    const result = simulatePreflight(
      { origin: "*", allowedHeaders: "*" },
      { origin: "https://x.example", method: "GET", requestHeaders: ["X-Anything"] },
    );
    expect(result.headers.allowed).toBe(true);
    expect(result.headers.wildcard).toBe(true);
  });
});

describe("simulatePreflight — credentials + wildcard interaction (real spec rule)", () => {
  it("blocks a credentialed request whose origin was only allowed via a true wildcard", () => {
    const result = simulatePreflight({ origin: "*", credentials: true }, REQ);
    expect(result.origin.allowed).toBe(true);
    expect(result.blockedByCredentialsWildcard).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("cannot satisfy a credentialed request"))).toBe(true);
  });

  it("does NOT block a credentialed request satisfied via naive reflection (origin: true) — not a wildcard value", () => {
    const result = simulatePreflight({ origin: true, credentials: true }, REQ);
    expect(result.blockedByCredentialsWildcard).toBe(false);
    expect(result.allowed).toBe(true);
  });

  it("blocks a credentialed request whose methods were only allowed via a wildcard", () => {
    const result = simulatePreflight(
      { origin: "https://partner.example", credentials: true, methods: "*" },
      REQ,
    );
    expect(result.blockedByCredentialsWildcard).toBe(true);
    expect(result.allowed).toBe(false);
  });

  it("blocks a credentialed request whose headers were only allowed via a wildcard", () => {
    const result = simulatePreflight(
      { origin: "https://partner.example", credentials: true, allowedHeaders: "*" },
      { ...REQ, requestHeaders: ["Authorization"] },
    );
    expect(result.blockedByCredentialsWildcard).toBe(true);
    expect(result.allowed).toBe(false);
  });

  it("allows a fully valid credentialed request with no wildcards anywhere", () => {
    const result = simulatePreflight(
      {
        origin: ["https://partner.example"],
        credentials: true,
        methods: ["PUT"],
        allowedHeaders: ["Authorization"],
      },
      { ...REQ, requestHeaders: ["Authorization"] },
    );
    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});

describe("simulatePreflight — overall verdict aggregation", () => {
  it("collects reasons from every failing check, not just the first", () => {
    const result = simulatePreflight(
      { origin: "https://other.example", methods: ["GET"], allowedHeaders: ["Content-Type"] },
      { origin: "https://partner.example", method: "DELETE", requestHeaders: ["X-Api-Key"] },
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons).toHaveLength(3);
  });

  it("echoes the simulated request back on the result", () => {
    const request = { origin: "https://partner.example", method: "PUT", requestHeaders: ["Authorization"] };
    const result = simulatePreflight({ origin: "*" }, request);
    expect(result.request).toEqual(request);
  });
});
