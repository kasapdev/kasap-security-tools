import { describe, expect, it } from "vitest";
import { isHighEntropyCandidate, scanLine, scanText } from "../src/scanContent.js";

// Built via concatenation rather than as contiguous literals so these
// realistic-shaped fixture secrets never trigger GitHub push protection on
// this repo (they're fake test values, but the platform can't tell that
// from a literal string match).
const AWS_KEY = "AKIA" + "IOSFODNN7EXAMPLE";
const GITHUB_PAT = "ghp_" + "1234567890abcdefghijklmnopqrstuvwxyzAB";

describe("isHighEntropyCandidate", () => {
  it("accepts a realistic, generated-looking token", () => {
    expect(isHighEntropyCandidate("aZ3mQ9xTkR7wLpN2vBcY5dEfGh8j")).toBe(true);
  });

  it("rejects a canonical UUID", () => {
    expect(isHighEntropyCandidate("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("rejects a lowercase hex digest (e.g. a git commit hash)", () => {
    expect(isHighEntropyCandidate("e3b0c44298fc1c149afbf4c8996fb92427ae41e")).toBe(false);
  });

  it("rejects a short string even if it looks random", () => {
    expect(isHighEntropyCandidate("aZ3$kQ9!")).toBe(false);
  });

  it("rejects a long, low-entropy repeated string", () => {
    expect(isHighEntropyCandidate("aaaaaaaaaaaaaaaaaaaaAAAA1111")).toBe(false);
  });

  it("rejects an ordinary English sentence", () => {
    expect(isHighEntropyCandidate("this is just a normal sentence about things")).toBe(false);
  });
});

describe("scanLine", () => {
  it("redacts matched secrets and never leaks the raw value", () => {
    const line = `const key = "${AWS_KEY}";`;
    const findings = scanLine(line, "config.ts", 3);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.redacted).not.toBe(AWS_KEY);
    expect(findings[0]?.redacted.includes("IOSFODNN7EXAMPL")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(AWS_KEY);
  });

  it("attaches the correct file and line number", () => {
    const findings = scanLine(`const key = "${AWS_KEY}";`, "src/config.ts", 42);
    expect(findings[0]).toMatchObject({ file: "src/config.ts", line: 42 });
  });

  it("does not flag a UUID assigned to a variable", () => {
    const findings = scanLine(
      'const requestId = "550e8400-e29b-41d4-a716-446655440000";',
      "handler.ts",
      1,
    );
    expect(findings).toHaveLength(0);
  });

  it("does not flag a git commit hash", () => {
    const findings = scanLine(
      'const baseCommit = "e3b0c44298fc1c149afbf4c8996fb92427ae41e";',
      "release.ts",
      1,
    );
    expect(findings).toHaveLength(0);
  });

  it("does not double-count a token matched by both a specific detector and the entropy fallback", () => {
    const findings = scanLine(
      `export GITHUB_TOKEN = "${GITHUB_PAT}"`,
      "env.ts",
      1,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("github-token");
  });

  it("flags a high-entropy quoted string with no specific detector match", () => {
    const findings = scanLine(
      'const token = "aZ3mQ9xTkR7wLpN2vBcY5dEfGh8j";',
      "auth.ts",
      1,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("high-entropy-string");
  });
});

describe("scanText", () => {
  it("scans multiple lines and reports correct 1-based line numbers", () => {
    const text = ["line one", `const key = "${AWS_KEY}";`, "line three"].join("\n");
    const findings = scanText(text, "file.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(2);
  });

  it("propagates an optional commit id onto findings", () => {
    const findings = scanText(`const key = "${AWS_KEY}";`, "file.ts", "abc1234");
    expect(findings[0]?.commit).toBe("abc1234");
  });
});
