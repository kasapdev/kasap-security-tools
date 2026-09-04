/**
 * Heuristically detects whether a buffer holds binary data by sniffing the
 * first chunk for NUL bytes. This is the same approach `git` itself uses
 * (see `buffer_is_binary`): text files essentially never contain a NUL byte,
 * while most binary formats do within the first few KB.
 */
export function isBinary(buffer: Buffer, sampleSize = 8000): boolean {
  const limit = Math.min(buffer.length, sampleSize);
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}
