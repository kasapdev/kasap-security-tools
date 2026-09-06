/**
 * Redacts a matched secret so it is safe to print/log: keeps the first 3 and
 * last 3 characters and replaces everything in between with asterisks.
 * Secrets of 6 characters or fewer are fully redacted (no characters are
 * revealed) since first/last 3 would otherwise overlap and leak the whole
 * value. An empty string has no secret to redact, so it maps to itself
 * rather than fabricating asterisks that would misleadingly imply a secret
 * was found.
 */
export function redact(secret: string): string {
  if (secret.length === 0) return "";
  if (secret.length <= 6) {
    return "*".repeat(Math.max(secret.length, 3));
  }
  const first = secret.slice(0, 3);
  const last = secret.slice(-3);
  const middleLength = secret.length - 6;
  return `${first}${"*".repeat(middleLength)}${last}`;
}
