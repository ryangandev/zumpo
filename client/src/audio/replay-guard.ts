import { useEffect, useRef } from 'react';
import type { PlayOptions, PlaySound } from './types';

/*
 * Game sounds come from the difference between two snapshots, never from the
 * server: the server stays silent and the wire contract does not change. The
 * guard makes that safe. The first state a page sees, and the first after a
 * reconnect, only become the baseline, so arriving, refreshing or coming back
 * plays nothing that already happened; and each event has a key, so a state
 * that repeats or flips back never plays one event twice, across a reconnect
 * too. Keys are forgotten only when a new game begins, which every game must
 * say how to tell (`isNewGame`), since its keys (`take:4`) come round again.
 *
 * The guard lives as long as the component that holds it: use it in the
 * room's page, never in a component a phase mounts, or every phase change
 * starts it over and the change into that phase is lost.
 */

/**
 * Something a state change should be heard as. A stepped sound (`Stepped`,
 * see `SteppedId`) must say which step.
 */
export type SoundEvent<Id extends string, Stepped extends Id = never> = {
  [S in Id]: {
    sound: S;
    /**
     * What happened, unique within one game: `take:12`, `move:31`,
     * `turn:bob:4`. An event whose key was heard before is dropped.
     */
    key: string;
    /** Another player's doing: plays about 6 dB softer. */
    other?: boolean;
    /**
     * Milliseconds after the change it plays, for a run that one snapshot
     * brings at once and that is heard one after another: a guess's pegs
     * dropping in. Events of one sound at different delays are each heard.
     */
    delayMs?: number;
  } & (S extends Stepped
    ? /** Which step, from 1 (see `PlayOptions.variant`). */
      { variant: number }
    : { variant?: number });
}[Id];

/** A game's pure rule from one state to the next to what is heard. */
export type DeriveSounds<
  State,
  Id extends string,
  Stepped extends Id = never,
> = (prev: State, next: State) => readonly SoundEvent<Id, Stepped>[];

/**
 * True when `next` is in a later game than `prev`. The two need not be
 * consecutive: across a reconnect `prev` may be mid-game 1 and `next`
 * mid-game 2, so compare what a game leaves behind (the last game's summary,
 * a game number) rather than a phase change between them.
 */
export type IsNewGame<State> = (prev: State, next: State) => boolean;

/**
 * Which of one change's events play, given all of them, new and merged:
 * where one sound must stand alone (`RoomLayout`'s "your turn" over a game's
 * own). Those left out were heard all the same, and never play later.
 */
export type SelectSounds<Id extends string, Stepped extends Id = never> = (
  events: SoundEvent<Id, Stepped>[],
) => SoundEvent<Id, Stepped>[];

export interface ReplayGuardOptions<
  State,
  Id extends string = string,
  Stepped extends Id = never,
> {
  /** Whether a new game began, whose keys may be heard again. */
  isNewGame: IsNewGame<State>;
  /** Which of a change's events play; all of them without. */
  select?: SelectSounds<Id, Stepped>;
  /**
   * The keys a state stands for on its own, such as whose go it is
   * (`turn:2.5`): a baseline counts them as heard, so a state that leaves
   * and comes back to them after arriving is silent too.
   */
  standing?: (state: State) => readonly string[];
  /** How many keys are remembered; the oldest go first. */
  memory?: number;
}

export interface ReplayGuard<
  State,
  Id extends string,
  Stepped extends Id = never,
> {
  /**
   * The next state, and what to play for it. `resync` marks the first state
   * after a (re)connection, which only becomes the baseline.
   */
  observe(next: State, resync?: boolean): SoundEvent<Id, Stepped>[];
}

const MEMORY = 128;

/** The higher of two steps, either of which may be missing. */
const higher = (a: number | undefined, b: number | undefined) =>
  a === undefined ? b : b === undefined ? a : Math.max(a, b);

export function createReplayGuard<
  State,
  Id extends string,
  Stepped extends Id = never,
>(
  derive: DeriveSounds<State, Id, Stepped>,
  {
    isNewGame,
    select,
    standing,
    memory = MEMORY,
  }: ReplayGuardOptions<State, Id, Stepped>,
): ReplayGuard<State, Id, Stepped> {
  let prev: { state: State } | null = null;
  let heard: string[] = [];
  const remember = (key: string) => {
    if (heard.includes(key)) return false;
    heard.push(key);
    if (heard.length > memory) heard.shift();
    return true;
  };
  // A baseline: nothing plays, and what it already stands for is heard.
  const arrive = (state: State) => {
    for (const key of standing?.(state) ?? []) remember(key);
    return [];
  };
  return {
    observe(next, resync = false) {
      const base = prev;
      prev = { state: next };
      if (base === null) return arrive(next);
      if (Object.is(base.state, next)) return [];
      if (isNewGame(base.state, next)) heard = [];
      // What happened while away is in the new baseline; the keys heard
      // before it are kept, so a state that flips back is still silent.
      if (resync) return arrive(next);
      const out: SoundEvent<Id, Stepped>[] = [];
      for (const event of derive(base.state, next)) {
        if (!remember(event.key)) continue;
        // One diff can hold several events of one sound (the server
        // coalesces a run, two players score at once): it is heard once, as
        // the viewer's own if any is, at the highest step any of them reached.
        // A run heard one after another (`delayMs`) keeps each of its beats.
        const same = out.findIndex(
          (e) =>
            e.sound === event.sound &&
            (e.delayMs ?? 0) === (event.delayMs ?? 0),
        );
        if (same === -1) {
          out.push(event);
          continue;
        }
        const kept = out[same]!;
        const pick = kept.other && !event.other ? event : kept;
        const variant = higher(kept.variant, event.variant);
        out[same] = variant === pick.variant ? pick : { ...pick, variant };
      }
      return select ? select(out) : out;
    },
  };
}

/**
 * Plays what each new `state` should be heard as, through a replay guard.
 * `epoch` is whatever changes when states may have skipped ahead, such as
 * the session's `connection`: the first state after it changes is only a
 * baseline. A null `state` (nothing yet) is skipped. A sound `cuts` says
 * yes to, such as a stinger, cuts short the beats of a run still waiting to
 * play (`delayMs`), so they never land over it.
 */
export function useStateSounds<
  State,
  Id extends string,
  Stepped extends Id = never,
>(
  state: State | null,
  {
    derive,
    play,
    epoch = null,
    isNewGame,
    select,
    standing,
    cuts,
  }: {
    // The steps come from `play`, the bank's own; `derive` must give them.
    derive: DeriveSounds<State, Id, NoInfer<Stepped>>;
    play: PlaySound<Id, Stepped>;
    epoch?: unknown;
    isNewGame: IsNewGame<State>;
    select?: SelectSounds<Id, NoInfer<Stepped>>;
    standing?: (state: State) => readonly string[];
    cuts?: (sound: Id) => boolean;
  },
): void {
  const latest = useRef({ derive, isNewGame, select, standing, cuts });
  useEffect(() => {
    latest.current = { derive, isNewGame, select, standing, cuts };
  });
  // A run's later beats, let go with the page that asked for them.
  const pending = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    };
  }, []);
  const track = useRef<{
    guard: ReplayGuard<State, Id, Stepped>;
    epoch: unknown;
    resync: boolean;
    last: { state: State } | null;
  } | null>(null);

  useEffect(() => {
    const seen = (track.current ??= {
      guard: createReplayGuard<State, Id, Stepped>(
        (prev, next) => latest.current.derive(prev, next),
        {
          isNewGame: (prev, next) => latest.current.isNewGame(prev, next),
          select: (events) => latest.current.select?.(events) ?? events,
          standing: (arrived) => latest.current.standing?.(arrived) ?? [],
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
    // Each event already carries the step its sound needs.
    const playAny = play as (id: Id, options?: PlayOptions) => void;
    const cut = latest.current.cuts;
    if (cut && events.some((e) => !e.delayMs && cut(e.sound))) {
      for (const timer of pending.current) clearTimeout(timer);
      pending.current.clear();
    }
    for (const { sound, other, variant, delayMs } of events) {
      const options = variant === undefined ? { other } : { other, variant };
      if (!delayMs) {
        playAny(sound, options);
        continue;
      }
      const timer = setTimeout(() => {
        pending.current.delete(timer);
        playAny(sound, options);
      }, delayMs);
      pending.current.add(timer);
    }
  }, [state, epoch, play]);
}
