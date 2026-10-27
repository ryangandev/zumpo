import { useEffect, useRef } from 'react';
import type { PlaySound } from './types';

/*
 * Game sounds come from the difference between two snapshots, never from the
 * server: the server stays silent and the wire contract does not change. The
 * guard makes that safe. The first state a page sees, and the first after a
 * reconnect, only become the baseline, so arriving, refreshing or coming back
 * plays nothing that already happened; and each event has a key, so a state
 * that repeats or flips back never plays one event twice. Keys are forgotten
 * at a new game and at a new baseline.
 */

/** Something a state change should be heard as. */
export interface SoundEvent<Id extends string> {
  sound: Id;
  /**
   * What happened, unique within one game: `take:12`, `move:31`,
   * `turn:bob:4`. An event whose key was heard before is dropped.
   */
  key: string;
  /** Another player's doing: plays about 6 dB softer. */
  other?: boolean;
}

/** A game's pure rule from one state to the next to what is heard. */
export type DeriveSounds<State, Id extends string> = (
  prev: State,
  next: State,
) => readonly SoundEvent<Id>[];

export interface ReplayGuardOptions<State> {
  /**
   * True when `next` begins a new game, whose keys (`take:4` again) may be
   * heard even though the last game's were.
   */
  isNewGame?: (prev: State, next: State) => boolean;
  /** How many keys are remembered; the oldest go first. */
  memory?: number;
}

export interface ReplayGuard<State, Id extends string> {
  /**
   * The next state, and what to play for it. `resync` marks the first state
   * after a (re)connection, which only becomes the baseline.
   */
  observe(next: State, resync?: boolean): SoundEvent<Id>[];
}

const MEMORY = 128;

export function createReplayGuard<State, Id extends string>(
  derive: DeriveSounds<State, Id>,
  { isNewGame, memory = MEMORY }: ReplayGuardOptions<State> = {},
): ReplayGuard<State, Id> {
  let prev: { state: State } | null = null;
  let heard: string[] = [];
  return {
    observe(next, resync = false) {
      const base = prev;
      prev = { state: next };
      if (base === null || resync) {
        // Whatever happened while away is in the new baseline, and a new
        // game may have begun there, whose keys must not count as heard.
        heard = [];
        return [];
      }
      if (Object.is(base.state, next)) return [];
      if (isNewGame?.(base.state, next)) heard = [];
      const out: SoundEvent<Id>[] = [];
      for (const event of derive(base.state, next)) {
        if (heard.includes(event.key)) continue;
        heard.push(event.key);
        if (heard.length > memory) heard.shift();
        // One diff can hold several events of one sound (the server
        // coalesces a run): it is heard once, as the viewer's own if any is.
        const same = out.findIndex((e) => e.sound === event.sound);
        if (same === -1) out.push(event);
        else if (out[same]!.other && !event.other) out[same] = event;
      }
      return out;
    },
  };
}

/**
 * Plays what each new `state` should be heard as, through a replay guard.
 * `epoch` is whatever changes when states may have skipped ahead, such as
 * the session's `connection`: the first state after it changes is only a
 * baseline. A null `state` (nothing yet) is skipped.
 */
export function useStateSounds<State, Id extends string>(
  state: State | null,
  {
    derive,
    play,
    epoch = null,
    isNewGame,
  }: {
    derive: DeriveSounds<State, Id>;
    play: PlaySound<Id>;
    epoch?: unknown;
    isNewGame?: (prev: State, next: State) => boolean;
  },
): void {
  const latest = useRef({ derive, isNewGame });
  useEffect(() => {
    latest.current = { derive, isNewGame };
  });
  const track = useRef<{
    guard: ReplayGuard<State, Id>;
    epoch: unknown;
    resync: boolean;
    last: { state: State } | null;
  } | null>(null);

  useEffect(() => {
    const seen = (track.current ??= {
      guard: createReplayGuard<State, Id>(
        (prev, next) => latest.current.derive(prev, next),
        {
          isNewGame: (prev, next) =>
            latest.current.isNewGame?.(prev, next) ?? false,
        },
      ),
      epoch,
      resync: false,
      last: null,
    });
    if (!Object.is(seen.epoch, epoch)) {
      seen.epoch = epoch;
      seen.resync = true;
    }
    // A render for any other reason is not a new state, and must not use up
    // the resync a new epoch is owed.
    if (state === null || (seen.last && Object.is(seen.last.state, state))) {
      return;
    }
    seen.last = { state };
    const events = seen.guard.observe(state, seen.resync);
    seen.resync = false;
    for (const event of events) play(event.sound, { other: event.other });
  }, [state, epoch, play]);
}
