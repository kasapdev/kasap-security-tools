/**
 * Computes the Shannon entropy of a string, in bits per character.
 *
 * H(X) = -sum(p(x) * log2(p(x))) over the observed character distribution.
 * A higher value means the characters are more uniformly/randomly distributed
 * (closer to log2(alphabet size)); a lower value means the string is more
 * repetitive/predictable. Random API keys and tokens tend to sit well above
 * 4 bits/char; English words, lowercase hex hashes, and UUIDs tend to sit
 * lower because their alphabet is smaller or their character distribution is
 * skewed.
 */
export function shannonEntropy(input: string): number {
  if (input.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const ch of input) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }

  const length = input.length;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Character-class categories used to judge alphabet diversity of a string. */
export interface CharacterClassCounts {
  lower: boolean;
  upper: boolean;
  digit: boolean;
  symbol: boolean;
}

/**
 * Reports which character classes (lowercase, uppercase, digit, symbol)
 * appear in the input. Used as a cheap, deterministic proxy for "looks like
 * a generated token" (mixed-case alphanumeric, often with symbols like
 * `+`, `/`, `-`, `_`) versus "looks like a hex hash or UUID" (digits and
 * lowercase a-f only).
 */
export function characterClasses(input: string): CharacterClassCounts {
  const classes: CharacterClassCounts = {
    lower: false,
    upper: false,
    digit: false,
    symbol: false,
  };
  for (const ch of input) {
    if (ch >= "a" && ch <= "z") classes.lower = true;
    else if (ch >= "A" && ch <= "Z") classes.upper = true;
    else if (ch >= "0" && ch <= "9") classes.digit = true;
    else classes.symbol = true;
  }
  return classes;
}

/** Number of character classes present, per {@link characterClasses}. */
export function characterClassCount(input: string): number {
  const c = characterClasses(input);
  return Number(c.lower) + Number(c.upper) + Number(c.digit) + Number(c.symbol);
}
