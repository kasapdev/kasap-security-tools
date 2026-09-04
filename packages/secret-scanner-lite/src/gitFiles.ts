import { execFileSync } from "node:child_process";
import { walkDirectory } from "./fsWalk.js";

/**
 * Lists files to scan, rooted at `root`. Prefers `git ls-files` (fast,
 * respects the full real `.gitignore`/`.git/info/exclude` semantics, and
 * naturally skips `.git` itself) when `root` is inside a git working tree.
 * Falls back to a manual directory walk (see `fsWalk.ts`) otherwise.
 */
export function listFiles(root: string, execFile = execFileSync): string[] {
  try {
    const output = execFile("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
    }) as unknown as string;
    return output.split("\0").filter((f) => f.length > 0);
  } catch {
    return walkDirectory(root);
  }
}
