/** Severity of a detected finding. */
export type Severity = "critical" | "high" | "medium" | "low";

/** A single potential-secret finding produced by the scanner. */
export interface Finding {
  /** Path of the file the finding was found in, relative to the scan root. */
  file: string;
  /** 1-based line number within the file (or diff, for history scans) the match occurred on. */
  line: number;
  /** Stable identifier of the rule that produced the finding, e.g. "aws-access-key-id". */
  ruleId: string;
  /** Human-readable rule name. */
  ruleName: string;
  severity: Severity;
  /**
   * The matched secret value with all but the first/last 3 characters redacted.
   * The raw secret value is never stored on a Finding.
   */
  redacted: string;
  /**
   * Set only for git-history findings: the commit hash the secret was introduced in.
   * Undefined for working-tree scans.
   */
  commit?: string;
}

/** A single regex-based detector rule. */
export interface Detector {
  id: string;
  name: string;
  severity: Severity;
  /** Must be a global regex (flags include "g") so all matches on a line can be found. */
  pattern: RegExp;
}
