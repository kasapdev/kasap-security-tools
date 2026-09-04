import { execFileSync } from "node:child_process";
import { scanLine } from "./scanContent.js";
import type { Finding } from "./types.js";

const COMMIT_RE = /^commit ([0-9a-f]{7,40})/;
const NEW_FILE_RE = /^\+\+\+ b\/(.+)$/;
const OLD_FILE_ONLY_RE = /^\+\+\+ \/dev\/null$/;
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parses the output of `git log -p` and scans every *added* line (i.e.
 * content that was introduced by some commit) for secrets, using the real
 * new-file line numbers derived from unified-diff hunk headers.
 *
 * This is what lets secret-scanner-lite catch secrets that were committed
 * and later removed in a subsequent commit: the working tree is clean, but
 * the secret is still sitting in git history and `git log -p` will surface
 * it as a `+` line in the commit that introduced it. This is a pure
 * function over diff text so it can be unit-tested without invoking git.
 */
export function parseGitLogP(diffText: string): Finding[] {
  const findings: Finding[] = [];
  const lines = diffText.split(/\r\n|\r|\n/);

  let currentCommit: string | undefined;
  let currentFile: string | undefined;
  let newLineNum = 0;
  let inHunk = false;

  for (const line of lines) {
    const commitMatch = COMMIT_RE.exec(line);
    if (commitMatch) {
      currentCommit = commitMatch[1];
      currentFile = undefined;
      inHunk = false;
      continue;
    }

    if (OLD_FILE_ONLY_RE.test(line)) {
      // File was deleted in this commit; its "+++" side has no path, and
      // there is nothing new to scan in this diff (deletions are "-").
      currentFile = undefined;
      inHunk = false;
      continue;
    }

    const newFileMatch = NEW_FILE_RE.exec(line);
    if (newFileMatch) {
      currentFile = newFileMatch[1];
      inHunk = false;
      continue;
    }

    const hunkMatch = HUNK_HEADER_RE.exec(line);
    if (hunkMatch) {
      newLineNum = Number(hunkMatch[1]);
      inHunk = true;
      continue;
    }

    if (!inHunk || !currentFile) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      const content = line.slice(1);
      findings.push(...scanLine(content, currentFile, newLineNum, currentCommit));
      newLineNum++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      // Removed line: doesn't exist in the new file, so no new-file line
      // number to advance.
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" — not a content line.
    } else {
      // Context line (present in both old and new).
      newLineNum++;
    }
  }

  return findings;
}

/**
 * Runs `git log -p` over the full history of `root` and scans every added
 * line for secrets. Requires `root` to be a git working tree.
 */
export function scanGitHistory(root: string, execFile = execFileSync): Finding[] {
  const output = execFile("git", ["log", "-p", "--no-color", "--all"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 256,
  }) as unknown as string;
  return parseGitLogP(output);
}
