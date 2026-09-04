import { matchDetectors } from "./detectors.js";
import { characterClassCount, shannonEntropy } from "./entropy.js";
import { redact } from "./redact.js";
import type { Finding, Severity } from "./types.js";

/**
 * Tuning knobs for the generic high-entropy fallback detector. These are
 * intentionally conservative (fewer false positives, at the cost of missing
 * some real secrets) — see the README "Detection tradeoffs" section for the
 * reasoning.
 */
export const ENTROPY_MIN_LENGTH = 20;
export const ENTROPY_MIN_CHAR_CLASSES = 3;
export const ENTROPY_MIN_BITS_PER_CHAR = 4.3;
export const ENTROPY_RULE_SEVERITY: Severity = "medium";

/** Matches a canonical UUID, e.g. `550e8400-e29b-41d4-a716-446655440000`. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches a bare hex digest, e.g. a git commit hash, MD5/SHA-1/SHA-256 hash. */
const HEX_DIGEST_SHAPE = /^[0-9a-f]{32,64}$/i;

/** Matches quoted string literals of at least `ENTROPY_MIN_LENGTH` characters. */
const QUOTED_STRING = /'([^'\\]{20,})'|"([^"\\]{20,})"/g;

/**
 * Decides whether a candidate quoted string looks like a generated secret
 * (as opposed to a UUID, hash, sentence, etc). See the module-level
 * constants above for the exact thresholds, and the package README for the
 * false-positive/false-negative tradeoff this encodes.
 */
export function isHighEntropyCandidate(candidate: string): boolean {
  if (candidate.length < ENTROPY_MIN_LENGTH) return false;
  if (UUID_SHAPE.test(candidate) || HEX_DIGEST_SHAPE.test(candidate)) return false;
  if (characterClassCount(candidate) < ENTROPY_MIN_CHAR_CLASSES) return false;
  return shannonEntropy(candidate) >= ENTROPY_MIN_BITS_PER_CHAR;
}

/**
 * Scans a single line of text for both shape-based detector matches and,
 * failing those, generic high-entropy quoted strings. Returns findings with
 * `file`/`line` already filled in and the matched value already redacted —
 * the raw secret value never leaves this function.
 */
export function scanLine(line: string, file: string, lineNumber: number, commit?: string): Finding[] {
  const findings: Finding[] = [];
  const claimedRanges: Array<[number, number]> = [];

  for (const { detector, match, start, end } of matchDetectors(line)) {
    // Some patterns nest inside others on the same secret (e.g. a bare AWS
    // key matched by `aws-access-key-id` sits inside the wider
    // `apiKey = "..."` span matched by `generic-api-key-assignment`).
    // `matchDetectors` walks `DETECTORS` in order, so the more specific
    // pattern is always seen first; skip a later match that overlaps
    // already-claimed text instead of double-reporting the same secret.
    const overlapsClaimed = claimedRanges.some(([s, e]) => start < e && end > s);
    if (overlapsClaimed) continue;

    claimedRanges.push([start, end]);
    findings.push({
      file,
      line: lineNumber,
      ruleId: detector.id,
      ruleName: detector.name,
      severity: detector.severity,
      redacted: redact(match),
      ...(commit ? { commit } : {}),
    });
  }

  QUOTED_STRING.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTED_STRING.exec(line)) !== null) {
    const content = m[1] ?? m[2] ?? "";
    const contentStart = m.index + 1; // skip the opening quote
    const contentEnd = contentStart + content.length;
    const overlapsDetectorMatch = claimedRanges.some(
      ([start, end]) => contentStart < end && contentEnd > start,
    );
    if (!overlapsDetectorMatch && isHighEntropyCandidate(content)) {
      findings.push({
        file,
        line: lineNumber,
        ruleId: "high-entropy-string",
        ruleName: "High-entropy string literal",
        severity: ENTROPY_RULE_SEVERITY,
        redacted: redact(content),
        ...(commit ? { commit } : {}),
      });
    }
  }

  return findings;
}

/** Scans multi-line text content (e.g. a whole file) line by line. */
export function scanText(text: string, file: string, commit?: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    findings.push(...scanLine(lines[i] ?? "", file, i + 1, commit));
  }
  return findings;
}
