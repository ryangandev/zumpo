import { useMemo, useState } from 'react';

/**
 * The time a game on your own runs on: the wall clock, standing still while
 * the game is paused. Each pause is taken off for good, so a game that keeps
 * its timestamps in this time loses nothing on its clock to one.
 */
export class PausableClock {
  #offset = 0;
  #pausedAt: number | null = null;
  readonly #wall: () => number;

  constructor(wall: () => number = Date.now) {
    this.#wall = wall;
  }

  /** Milliseconds, as `Date.now()` counts them, less every pause so far. */
  now(): number {
    return (this.#pausedAt ?? this.#wall()) - this.#offset;
  }

  get paused(): boolean {
    return this.#pausedAt !== null;
  }

  pause(): void {
    this.#pausedAt ??= this.#wall();
  }

  resume(): void {
    if (this.#pausedAt === null) return;
    this.#offset += this.#wall() - this.#pausedAt;
    this.#pausedAt = null;
  }
}

/** A game on your own's time, and whether it stands still. */
export interface SoloTime {
  /** The game's time now; read it for every timestamp the game keeps. */
  now: () => number;
  /**
   * True while How to play or the Leave question is open: the game waits, and
   * its board is put away.
   */
  paused: boolean;
  setPaused: (paused: boolean) => void;
}

/**
 * A game on your own's own clock, which `SoloLayout` pauses while How to play
 * or the Leave question is open. A game passes it to `SoloLayout`, stamps its moves with `now()`
 * and holds its timers while `paused`.
 */
export function useSoloTime(): SoloTime {
  const [clock] = useState(() => new PausableClock());
  const [paused, setPausedState] = useState(false);
  return useMemo(
    () => ({
      now: () => clock.now(),
      paused,
      setPaused: (next: boolean) => {
        if (next) clock.pause();
        else clock.resume();
        setPausedState(next);
      },
    }),
    [clock, paused],
  );
}
