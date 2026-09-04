import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

interface GitignoreRule {
  regex: RegExp;
  negate: boolean;
  dirOnly: boolean;
}

/**
 * Converts a single `.gitignore` line into a regex rule. This implements a
 * useful subset of the real gitignore spec (comments, blank lines,
 * `!negation`, a trailing `/` meaning "directories only", a leading `/`
 * anchoring to the repo root, and `*`/`**`/`?` wildcards) — it does not
 * implement every edge case (e.g. per-directory nested `.gitignore` files,
 * character classes) since this is only a fallback for when the target
 * isn't a git repository (git itself is used, via `git ls-files`, whenever
 * it's available).
 */
function parseGitignoreLine(rawLine: string): GitignoreRule | null {
  let line = rawLine.trim();
  if (line === "" || line.startsWith("#")) return null;

  let negate = false;
  if (line.startsWith("!")) {
    negate = true;
    line = line.slice(1);
  }

  let dirOnly = false;
  if (line.endsWith("/")) {
    dirOnly = true;
    line = line.slice(0, -1);
  }

  const anchored = line.startsWith("/");
  if (anchored) line = line.slice(1);

  let regexSource = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "*" && line[i + 1] === "*") {
      regexSource += ".*";
      i++;
    } else if (ch === "*") {
      regexSource += "[^/]*";
    } else if (ch === "?") {
      regexSource += "[^/]";
    } else {
      regexSource += ch?.replace(/[.+^${}()|[\]\\]/g, "\\$&") ?? "";
    }
  }

  const pattern = anchored ? `^${regexSource}(/.*)?$` : `(^|/)${regexSource}(/.*)?$`;
  return { regex: new RegExp(pattern), negate, dirOnly };
}

export function parseGitignore(content: string): GitignoreRule[] {
  return content
    .split(/\r\n|\r|\n/)
    .map(parseGitignoreLine)
    .filter((r): r is GitignoreRule => r !== null);
}

function isIgnored(relPath: string, isDirectory: boolean, rules: GitignoreRule[]): boolean {
  let ignored = false;
  const posixPath = relPath.split(sep).join("/");
  for (const rule of rules) {
    if (rule.dirOnly && !isDirectory) continue;
    if (rule.regex.test(posixPath)) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

/** Directories that are always skipped, regardless of `.gitignore` content. */
const ALWAYS_SKIP = new Set([".git", "node_modules"]);

/**
 * Walks a directory tree from `root` and returns file paths (relative to
 * `root`, POSIX-separated) that are not ignored by a root-level
 * `.gitignore` (if present) and not inside an always-skipped directory.
 * This is the fallback file-discovery strategy used when the scan target
 * is not a git repository.
 */
export function walkDirectory(root: string): string[] {
  let gitignoreRules: GitignoreRule[] = [];
  try {
    gitignoreRules = parseGitignore(readFileSync(join(root, ".gitignore"), "utf8"));
  } catch {
    // No .gitignore present — that's fine, nothing extra is ignored.
  }

  const results: string[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ALWAYS_SKIP.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const relPath = relative(root, fullPath);
      if (isIgnored(relPath, entry.isDirectory(), gitignoreRules)) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        results.push(relPath.split(sep).join("/"));
      }
    }
  }

  walk(root);
  return results;
}
