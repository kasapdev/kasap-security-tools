import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isBinary } from "./binary.js";
import { DETECTORS } from "./detectors.js";
import { shannonEntropy, characterClassCount } from "./entropy.js";
import { listFiles } from "./gitFiles.js";
import { matchesAnyGlob } from "./glob.js";
import { parseGitLogP, scanGitHistory } from "./historyScan.js";
import { redact } from "./redact.js";
import { scanLine, scanText } from "./scanContent.js";
import { walkDirectory } from "./fsWalk.js";
import type { Finding } from "./types.js";

export interface ScanOptions {
  /** Extra glob patterns to exclude, in addition to always-skipped dirs. */
  exclude?: string[];
  /** Also scan full git history (requires `root` to be a git repo). */
  history?: boolean;
}

/**
 * Scans a directory's working tree (and, optionally, full git history) for
 * likely secrets. This is the main library entry point — the CLI (`cli.ts`)
 * is a thin wrapper around this function.
 */
export function scanRepository(root: string, options: ScanOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const files = listFiles(root);
  const exclude = options.exclude ?? [];

  for (const relPath of files) {
    if (matchesAnyGlob(relPath, exclude)) continue;

    let buffer: Buffer;
    try {
      buffer = readFileSync(join(root, relPath));
    } catch {
      continue; // e.g. broken symlink
    }
    if (isBinary(buffer)) continue;

    findings.push(...scanText(buffer.toString("utf8"), relPath));
  }

  if (options.history) {
    for (const finding of scanGitHistory(root)) {
      if (matchesAnyGlob(finding.file, exclude)) continue;
      findings.push(finding);
    }
  }

  return findings;
}

export {
  DETECTORS,
  redact,
  shannonEntropy,
  characterClassCount,
  isBinary,
  listFiles,
  walkDirectory,
  matchesAnyGlob,
  scanLine,
  scanText,
  parseGitLogP,
  scanGitHistory,
};
export type { Finding, Severity, Detector } from "./types.js";
