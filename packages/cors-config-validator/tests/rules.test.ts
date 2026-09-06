import { describe, expect, it } from "vitest";
import { runCorsRules } from "../src/rules.js";
import type { NormalizedCors } from "../src/types.js";

const BASE: NormalizedCors = {
  wildcardOrigin: false,
  reflectsArbitraryOrigin: false,
  credentials: false,
  methodsWildcard: false,
  headersWildcard: false,
  varyIncludesOrigin: undefined,
  originIsDynamic: false,
  allowsNullOrigin: false,
};

describe("runCorsRules", () => {
  it("flags a clean, static-origin, no-credentials config with nothing", () => {
    const findings = runCorsRules({ ...BASE });
    expect(findings).toHaveLength(0);
  });

  it("flags wildcard origin + credentials as critical", () => {
    const findings = runCorsRules({ ...BASE, wildcardOrigin: true, credentials: true });
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("wildcard-origin-with-credentials");
    expect(findings.find((f) => f.ruleId === "wildcard-origin-with-credentials")?.severity).toBe(
      "critical",
    );
  });

  it("flags a bare wildcard origin (no credentials) as medium, informational", () => {
    const findings = runCorsRules({ ...BASE, wildcardOrigin: true });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: "wildcard-origin", severity: "medium" });
  });

  it("suppresses the wildcard-origin finding when assumePublicApi is set", () => {
    const findings = runCorsRules({ ...BASE, wildcardOrigin: true }, { assumePublicApi: true });
    expect(findings.find((f) => f.ruleId === "wildcard-origin")).toBeUndefined();
  });

  it("does not double-flag wildcard-origin when wildcard-origin-with-credentials already fired", () => {
    const findings = runCorsRules({ ...BASE, wildcardOrigin: true, credentials: true });
    expect(findings.find((f) => f.ruleId === "wildcard-origin")).toBeUndefined();
  });

  it("flags reflected-origin-without-validation as high when there are no credentials", () => {
    const findings = runCorsRules({ ...BASE, reflectsArbitraryOrigin: true, originIsDynamic: true });
    expect(findings).toContainEqual(
      expect.objectContaining({ ruleId: "reflected-origin-without-validation", severity: "high" }),
    );
  });

  it("escalates reflected-origin-without-validation to critical when credentials are allowed", () => {
    const findings = runCorsRules({
      ...BASE,
      reflectsArbitraryOrigin: true,
      credentials: true,
      originIsDynamic: true,
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ ruleId: "reflected-origin-without-validation", severity: "critical" }),
    );
  });

  it("flags null-origin-allowed as high when there are no credentials", () => {
    const findings = runCorsRules({ ...BASE, allowsNullOrigin: true });
    expect(findings).toContainEqual(
      expect.objectContaining({ ruleId: "null-origin-allowed", severity: "high" }),
    );
  });

  it("escalates null-origin-allowed to critical when credentials are allowed", () => {
    const findings = runCorsRules({ ...BASE, allowsNullOrigin: true, credentials: true });
    expect(findings).toContainEqual(
      expect.objectContaining({ ruleId: "null-origin-allowed", severity: "critical" }),
    );
  });

  it("flags overly-broad methods/headers wildcard with credentials as critical", () => {
    const findings = runCorsRules({ ...BASE, methodsWildcard: true, credentials: true });
    expect(findings).toContainEqual(
      expect.objectContaining({
        ruleId: "overly-broad-methods-or-headers-with-credentials",
        severity: "critical",
      }),
    );
  });

  it("flags overly-broad headers wildcard without credentials as low", () => {
    const findings = runCorsRules({ ...BASE, headersWildcard: true });
    expect(findings).toContainEqual(
      expect.objectContaining({ ruleId: "overly-broad-methods-or-headers", severity: "low" }),
    );
  });

  it("flags missing Vary: Origin when origin is dynamic and Vary is known to omit it", () => {
    const findings = runCorsRules({
      ...BASE,
      reflectsArbitraryOrigin: true,
      originIsDynamic: true,
      varyIncludesOrigin: false,
    });
    expect(findings).toContainEqual(expect.objectContaining({ ruleId: "missing-vary-origin" }));
  });

  it("does not flag missing-vary-origin when Vary: Origin is present", () => {
    const findings = runCorsRules({
      ...BASE,
      reflectsArbitraryOrigin: true,
      originIsDynamic: true,
      varyIncludesOrigin: true,
    });
    expect(findings.find((f) => f.ruleId === "missing-vary-origin")).toBeUndefined();
  });

  it("does not flag missing-vary-origin when it is unknown (config-file mode)", () => {
    const findings = runCorsRules({
      ...BASE,
      reflectsArbitraryOrigin: true,
      originIsDynamic: true,
      varyIncludesOrigin: undefined,
    });
    expect(findings.find((f) => f.ruleId === "missing-vary-origin")).toBeUndefined();
  });

  it("does not flag missing-vary-origin for a static, non-dynamic origin", () => {
    const findings = runCorsRules({ ...BASE, originIsDynamic: false, varyIncludesOrigin: false });
    expect(findings.find((f) => f.ruleId === "missing-vary-origin")).toBeUndefined();
  });
});
