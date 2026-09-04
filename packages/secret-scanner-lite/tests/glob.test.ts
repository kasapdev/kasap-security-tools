import { describe, expect, it } from "vitest";
import { matchesAnyGlob } from "../src/glob.js";

describe("matchesAnyGlob", () => {
  it("matches a simple extension wildcard anywhere in the path", () => {
    expect(matchesAnyGlob("dist/bundle.min.js", ["*.js"])).toBe(true);
    expect(matchesAnyGlob("src/index.ts", ["*.js"])).toBe(false);
  });

  it("matches a directory-name pattern at any depth", () => {
    expect(matchesAnyGlob("packages/foo/node_modules/bar/index.js", ["node_modules"])).toBe(
      true,
    );
  });

  it("respects a leading-slash root anchor", () => {
    expect(matchesAnyGlob("build/out.js", ["/build"])).toBe(true);
    expect(matchesAnyGlob("packages/build/out.js", ["/build"])).toBe(false);
  });

  it("supports ** for arbitrary depth", () => {
    expect(matchesAnyGlob("a/b/c/fixture.secret", ["**/*.secret"])).toBe(true);
  });

  it("returns false when no pattern matches", () => {
    expect(matchesAnyGlob("src/index.ts", ["*.log", "dist"])).toBe(false);
  });
});
