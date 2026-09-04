import { describe, expect, it } from "vitest";
import { characterClassCount, characterClasses, shannonEntropy } from "../src/entropy.js";

describe("shannonEntropy", () => {
  it("returns 0 for a repeated single character", () => {
    expect(shannonEntropy("aaaaaaaa")).toBe(0);
  });

  it("returns 0 for an empty string", () => {
    expect(shannonEntropy("")).toBe(0);
  });

  it("returns 2 bits/char for 4 equally-frequent distinct characters", () => {
    // "abcd" repeated: each of a,b,c,d appears with probability 0.25 ->
    // H = -4 * 0.25 * log2(0.25) = 2 bits/char exactly.
    expect(shannonEntropy("abcdabcdabcd")).toBeCloseTo(2, 10);
  });

  it("is higher for a more random-looking string than for English-like text", () => {
    const random = "aZ3$kQ9!mR7@xT2#";
    const repetitive = "the the the the";
    expect(shannonEntropy(random)).toBeGreaterThan(shannonEntropy(repetitive));
  });
});

describe("characterClasses / characterClassCount", () => {
  it("detects all four classes in a mixed string", () => {
    const classes = characterClasses("Ab1!");
    expect(classes).toEqual({ lower: true, upper: true, digit: true, symbol: true });
    expect(characterClassCount("Ab1!")).toBe(4);
  });

  it("detects only lower+digit for a lowercase hex hash", () => {
    const classes = characterClasses("d41d8cd98f00b204e9800998ecf8427e");
    expect(classes.upper).toBe(false);
    expect(classes.symbol).toBe(false);
    expect(characterClassCount("d41d8cd98f00b204e9800998ecf8427e")).toBe(2);
  });
});
