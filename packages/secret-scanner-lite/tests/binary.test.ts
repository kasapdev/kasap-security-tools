import { describe, expect, it } from "vitest";
import { isBinary } from "../src/binary.js";

describe("isBinary", () => {
  it("returns false for plain text", () => {
    expect(isBinary(Buffer.from("hello world\nsecond line\n", "utf8"))).toBe(false);
  });

  it("returns true when a NUL byte is present in the sampled range", () => {
    const buf = Buffer.concat([Buffer.from("PNG"), Buffer.from([0x00, 0x01, 0x02])]);
    expect(isBinary(buf)).toBe(true);
  });

  it("only sniffs the given sample size", () => {
    const text = Buffer.from("a".repeat(20), "utf8");
    const withLateNull = Buffer.concat([text, Buffer.from([0x00])]);
    expect(isBinary(withLateNull, 10)).toBe(false); // NUL is past the sample window
    expect(isBinary(withLateNull, 100)).toBe(true);
  });
});
