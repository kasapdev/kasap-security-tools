import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseGitignore, walkDirectory } from "../src/fsWalk.js";

describe("parseGitignore", () => {
  it("ignores comments and blank lines", () => {
    expect(parseGitignore("# comment\n\n*.log")).toHaveLength(1);
  });

  it("parses negation, trailing slash, and leading slash", () => {
    const rules = parseGitignore("!keep.log\nbuild/\n/dist");
    expect(rules[0]).toMatchObject({ negate: true });
    expect(rules[1]).toMatchObject({ dirOnly: true });
  });
});

describe("walkDirectory", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "secret-scanner-lite-"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "node_modules", "some-dep"), { recursive: true });
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "src", "index.ts"), "console.log('hi');");
    writeFileSync(join(root, "dist", "bundle.js"), "//built");
    writeFileSync(join(root, "node_modules", "some-dep", "index.js"), "module.exports = {};");
    writeFileSync(join(root, ".gitignore"), "dist/\n*.local\n");
    writeFileSync(join(root, "secret.local"), "should be ignored");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("always skips node_modules regardless of .gitignore", () => {
    const files = walkDirectory(root);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });

  it("respects a dir-only gitignore rule", () => {
    const files = walkDirectory(root);
    expect(files.some((f) => f.startsWith("dist/"))).toBe(false);
  });

  it("respects a wildcard gitignore rule", () => {
    const files = walkDirectory(root);
    expect(files).not.toContain("secret.local");
  });

  it("includes files that are not ignored", () => {
    const files = walkDirectory(root);
    expect(files).toContain("src/index.ts");
  });
});
