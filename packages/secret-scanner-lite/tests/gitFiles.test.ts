import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listFiles } from "../src/gitFiles.js";

describe("listFiles", () => {
  it("parses NUL-separated output from `git ls-files -z`", () => {
    const fakeExecFile = vi.fn().mockReturnValue("a.ts\0b/c.ts\0");
    const files = listFiles("/some/repo", fakeExecFile as never);
    expect(files).toEqual(["a.ts", "b/c.ts"]);
    expect(fakeExecFile).toHaveBeenCalledWith(
      "git",
      ["ls-files", "-z"],
      expect.objectContaining({ cwd: "/some/repo" }),
    );
  });

  it("falls back to a manual directory walk when git is unavailable", () => {
    let root = "";
    root = mkdtempSync(join(tmpdir(), "secret-scanner-lite-gitfiles-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), "export {};");

    const throwingExecFile = vi.fn().mockImplementation(() => {
      throw new Error("not a git repository");
    });

    const files = listFiles(root, throwingExecFile as never);
    expect(files).toContain("src/a.ts");

    rmSync(root, { recursive: true, force: true });
  });
});
