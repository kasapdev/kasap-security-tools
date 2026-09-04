import { describe, expect, it } from "vitest";
import { normalizeFromConfig, normalizeFromHeaders } from "../src/normalize.js";

describe("normalizeFromHeaders", () => {
  it("detects a wildcard origin", () => {
    const n = normalizeFromHeaders({ accessControlAllowOrigin: "*" });
    expect(n.wildcardOrigin).toBe(true);
    expect(n.originIsDynamic).toBe(true);
  });

  it("detects credentials from the exact header string 'true'", () => {
    expect(normalizeFromHeaders({ accessControlAllowCredentials: "true" }).credentials).toBe(true);
    expect(normalizeFromHeaders({ accessControlAllowCredentials: "false" }).credentials).toBe(false);
  });

  it("detects reflection: ACAO exactly equals the origin we sent, and is not '*'", () => {
    const n = normalizeFromHeaders(
      { accessControlAllowOrigin: "https://evil.invalid" },
      "https://evil.invalid",
    );
    expect(n.reflectsArbitraryOrigin).toBe(true);
    expect(n.originIsDynamic).toBe(true);
  });

  it("does not call it reflection when ACAO is a fixed allowlisted origin different from what we sent", () => {
    const n = normalizeFromHeaders(
      { accessControlAllowOrigin: "https://trusted.example" },
      "https://evil.invalid",
    );
    expect(n.reflectsArbitraryOrigin).toBe(false);
    expect(n.originIsDynamic).toBe(false);
  });

  it("does not double-count wildcard as reflection", () => {
    const n = normalizeFromHeaders({ accessControlAllowOrigin: "*" }, "*");
    expect(n.reflectsArbitraryOrigin).toBe(false);
  });

  it("parses a comma-separated methods/headers wildcard", () => {
    expect(normalizeFromHeaders({ accessControlAllowMethods: "GET, POST, *" }).methodsWildcard).toBe(
      true,
    );
    expect(normalizeFromHeaders({ accessControlAllowHeaders: "Content-Type" }).headersWildcard).toBe(
      false,
    );
  });

  it("reports varyIncludesOrigin as true/false/undefined correctly", () => {
    expect(normalizeFromHeaders({ vary: "Origin, Accept-Encoding" }).varyIncludesOrigin).toBe(true);
    expect(normalizeFromHeaders({ vary: "Accept-Encoding" }).varyIncludesOrigin).toBe(false);
    expect(normalizeFromHeaders({}).varyIncludesOrigin).toBeUndefined();
  });
});

describe("normalizeFromConfig", () => {
  it("treats origin: '*' as a wildcard", () => {
    const n = normalizeFromConfig({ origin: "*" });
    expect(n.wildcardOrigin).toBe(true);
    expect(n.originIsDynamic).toBe(true);
  });

  it("treats origin: true as naive unconditional reflection", () => {
    const n = normalizeFromConfig({ origin: true });
    expect(n.reflectsArbitraryOrigin).toBe(true);
    expect(n.originIsDynamic).toBe(true);
  });

  it("treats a static string origin as neither wildcard nor dynamic", () => {
    const n = normalizeFromConfig({ origin: "https://app.example.com" });
    expect(n.wildcardOrigin).toBe(false);
    expect(n.reflectsArbitraryOrigin).toBe(false);
    expect(n.originIsDynamic).toBe(false);
  });

  it("treats an array or function/RegExp origin as dynamic (but not naive reflection)", () => {
    expect(normalizeFromConfig({ origin: ["https://a.example", "https://b.example"] }).originIsDynamic).toBe(
      true,
    );
    expect(normalizeFromConfig({ origin: /example\.com$/ }).originIsDynamic).toBe(true);
    expect(normalizeFromConfig({ origin: () => true }).originIsDynamic).toBe(true);
  });

  it("reads credentials and methods/headers wildcards from the config object", () => {
    const n = normalizeFromConfig({
      credentials: true,
      methods: ["GET", "*"],
      allowedHeaders: "*",
    });
    expect(n.credentials).toBe(true);
    expect(n.methodsWildcard).toBe(true);
    expect(n.headersWildcard).toBe(true);
  });

  it("always leaves varyIncludesOrigin unknown (undefined) — config mode has no real response", () => {
    expect(normalizeFromConfig({ origin: true }).varyIncludesOrigin).toBeUndefined();
  });
});
