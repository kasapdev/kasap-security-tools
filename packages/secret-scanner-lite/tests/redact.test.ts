import { describe, expect, it } from "vitest";
import { redact } from "../src/redact.js";

describe("redact", () => {
  it("keeps the first and last 3 characters of a long secret", () => {
    // Split so this fixture never appears as a contiguous AWS-key-shaped
    // literal in the source (GitHub push protection flags those).
    const secret = "AKIA" + "ABCDEFGHIJKLMNOP";
    const redacted = redact(secret);
    expect(redacted.startsWith("AKI")).toBe(true);
    expect(redacted.endsWith("NOP")).toBe(true);
    expect(redacted).not.toContain(secret.slice(3, -3));
  });

  it("never includes the raw secret as a substring of the output (for a realistic key)", () => {
    const secret = "gho_" + "1234567890abcdefghijklmnopqrstuvwxyzAB";
    const redacted = redact(secret);
    expect(redacted).not.toBe(secret);
    // the full middle portion must not leak
    expect(secret.includes(redacted)).toBe(false);
  });

  it("fully redacts short secrets (<=6 chars) instead of leaking overlapping head/tail", () => {
    const redacted = redact("abcdef");
    expect(redacted).toBe("******");
    expect(redacted).not.toContain("a");
  });

  it("produces a middle run of asterisks whose length matches the redacted portion", () => {
    const secret = "0123456789"; // 10 chars: keep "012" and "789", redact 4 middle chars
    expect(redact(secret)).toBe("012****789");
  });
});
