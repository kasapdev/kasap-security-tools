/** Deterministic, manually-advanced clock for testing time-based algorithms without real delays. */
export function makeClock(startMs = 0) {
  let current = startMs;
  return {
    now: (): number => current,
    advance(ms: number): void {
      current += ms;
    },
    set(ms: number): void {
      current = ms;
    },
  };
}
