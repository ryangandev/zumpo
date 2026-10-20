/**
 * A log line that one client can repeat at will, written at most once per key
 * per `intervalMs`, with a count of the ones held back since. Without it, a
 * client sending bad packets in a loop writes the log as fast as it sends.
 *
 * Keys are a fixed set, such as event names, so the map stays small. `now` is
 * injectable so a test can move the clock.
 */
const createLogThrottle = (
  intervalMs: number,
  write: (line: string) => void = console.warn,
  now: () => number = Date.now,
) => {
  const byKey = new Map<string, { writtenAtMs: number; held: number }>();

  return (key: string, line: () => string): void => {
    const currentMs = now();
    const entry = byKey.get(key);
    if (entry && currentMs - entry.writtenAtMs < intervalMs) {
      entry.held += 1;
      return;
    }
    const held = entry?.held ?? 0;
    write(held > 0 ? `${line()} (and ${held} more like it)` : line());
    byKey.set(key, { writtenAtMs: currentMs, held: 0 });
  };
};

export { createLogThrottle };
