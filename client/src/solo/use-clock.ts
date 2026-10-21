import { useEffect, useState } from 'react';

/**
 * The time now, kept fresh while `running`, for a clock that counts up.
 * `now` is where the time comes from: a game on your own passes its own
 * time (`useSoloTime`), which stands still while the game is paused.
 */
export function useClock(
  running: boolean,
  now: () => number = Date.now,
): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 250);
    return () => clearInterval(timer);
  }, [running]);
  return now();
}
