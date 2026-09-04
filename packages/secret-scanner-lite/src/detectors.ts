import type { Detector } from "./types.js";

/**
 * High-confidence, shape-based secret detectors. Each pattern targets a
 * specific, well-known credential format, which keeps the false-positive
 * rate very low compared to generic entropy scanning (used only as a
 * fallback, see `scanContent.ts`).
 */
export const DETECTORS: Detector[] = [
  {
    id: "aws-access-key-id",
    name: "AWS Access Key ID",
    severity: "critical",
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  {
    id: "private-key-header",
    name: "Private key header",
    severity: "critical",
    pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: "slack-token",
    name: "Slack token",
    severity: "high",
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    id: "github-token",
    name: "GitHub token",
    severity: "high",
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g,
  },
  {
    id: "generic-api-key-assignment",
    name: "Generic API key assignment",
    severity: "medium",
    pattern: /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/gi,
  },
];

/**
 * Runs every detector against a single line of text and returns the raw
 * (un-redacted) matched substrings alongside the detector that matched.
 * Redaction happens one layer up, in `scanContent.ts`, so it can never be
 * accidentally skipped by a caller.
 */
export interface DetectorMatch {
  detector: Detector;
  match: string;
  start: number;
  end: number;
}

export function matchDetectors(line: string): DetectorMatch[] {
  const results: DetectorMatch[] = [];
  for (const detector of DETECTORS) {
    // Reset lastIndex defensively: detectors are module-level singletons
    // reused across many lines/files, and a global regex is stateful.
    detector.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = detector.pattern.exec(line)) !== null) {
      results.push({
        detector,
        match: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
      // Avoid infinite loops on zero-length matches.
      if (match[0].length === 0) detector.pattern.lastIndex++;
    }
  }
  return results;
}
