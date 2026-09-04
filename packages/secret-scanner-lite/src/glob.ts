/**
 * Compiles a simple glob pattern (`*`, `**`, `?`, and literal path
 * segments — no brace/character-class expansion) into a regex. Matches
 * anywhere in the path unless the pattern starts with `/`, in which case
 * it's anchored to the start.
 */
function globToRegex(pattern: string): RegExp {
  const anchored = pattern.startsWith("/");
  const body = anchored ? pattern.slice(1) : pattern;

  let source = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "*" && body[i + 1] === "*") {
      source += ".*";
      i++;
    } else if (ch === "*") {
      source += "[^/]*";
    } else if (ch === "?") {
      source += "[^/]";
    } else {
      source += ch?.replace(/[.+^${}()|[\]\\]/g, "\\$&") ?? "";
    }
  }

  return new RegExp(anchored ? `^${source}(/.*)?$` : `(^|/)${source}(/.*)?$`);
}

/** Returns true if `path` (POSIX-separated, relative) matches any of `patterns`. */
export function matchesAnyGlob(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegex(pattern).test(path));
}
