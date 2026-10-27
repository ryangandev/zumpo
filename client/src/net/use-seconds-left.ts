import { useEffect, useState } from 'react';

/**
 * Whole seconds left on a server clock. The server sends time left rather
 * than a deadline, so the count starts from when the snapshot arrived and a
 * client clock that disagrees with the server's still counts right.
 *
 * Paused, it holds the last value: while reconnecting the client cannot know
 * what the server's clock did.
 */
export function useSecondsLeft(
  endsInMs: number,
  receivedAt: number,
  paused = false,
): number {
  const [seconds, setSeconds] = useState(() =>
    secondsLeft(endsInMs, receivedAt),
  );

  useEffect(() => {
    if (paused) return;
    const tick = () => setSeconds(secondsLeft(endsInMs, receivedAt));
    tick();
    if (endsInMs <= 0) return;
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [endsInMs, receivedAt, paused]);

  return seconds;
}

/** The whole seconds left on a clock a snapshot sent, as of now. */
export function secondsLeft(endsInMs: number, receivedAt: number): number {
  const elapsed = performance.now() - receivedAt;
  return Math.max(0, Math.ceil((endsInMs - elapsed) / 1000));
}
