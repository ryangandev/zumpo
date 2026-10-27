import { useMemo } from 'react';
import {
  useSounds,
  useStateSounds,
  type DeriveSounds,
  type PlaySound,
  type SelectSounds,
  type SoundBank,
  type SoundEvent,
  type SteppedId,
} from '../audio';
import { soloSounds } from '../audio/generated/solo';

/*
 * What a game on your own sounds like: what the player does, played in their
 * own handlers, what the game does in reply, from its states, and its end,
 * once. The states go through a replay guard as a room's snapshots do, so
 * the first state a page shows (a fresh board, or a daily puzzle restored
 * from this device) is only a baseline, and a refresh plays nothing,
 * however the game stood. How and why: docs/architecture.md#sounds-on-your-own.
 */

/** The solo bank: how a game on your own ends. Every solo bank holds it. */
export const SOLO_BANK = { ...soloSounds } satisfies SoundBank;

/**
 * How a game on your own ended: finished, finished with a new best on this
 * device, or lost (a mine, a code missed).
 */
export type SoloEnd = 'complete' | 'best' | 'loss';

const STINGER = {
  complete: 'stinger-solo-complete',
  best: 'stinger-new-best',
  loss: 'stinger-solo-loss',
} as const satisfies Record<SoloEnd, keyof typeof SOLO_BANK>;

/**
 * How a finish sounds, from what `recordBest` said of it: a new best when it
 * beat one this device kept, as the result's words say; a first finish has
 * nothing to beat, and is a finish.
 */
export const finishEnd = (finish: {
  previous: unknown;
  isBest: boolean;
}): SoloEnd =>
  finish.isBest && finish.previous !== null ? 'best' : 'complete';

/** What the guard hears a game on your own by: its state, and its end. */
export interface SoloSoundView<Game> {
  game: Game;
  end: SoloEnd | null;
}

/** The end's key, apart from the game's own (`game:`). */
const END_KEY = 'end';
const GAME_KEY = 'game:';

/**
 * What the guard hears between two views: the game's own events, and the
 * end the first time there is one.
 */
export function deriveSoloSounds<Game>(
  derive: DeriveSounds<Game, string> | undefined,
): DeriveSounds<SoloSoundView<Game>, string> {
  return (prev, next) => {
    const events: SoundEvent<string>[] = (
      derive?.(prev.game, next.game) ?? []
    ).map((event) => ({ ...event, key: `${GAME_KEY}${event.key}` }));
    if (prev.end === null && next.end !== null) {
      events.push({ sound: STINGER[next.end], key: END_KEY });
    }
    return events;
  };
}

/**
 * The end stands alone on its change: the move that ends a game is heard as
 * its end, never as itself too. What is dropped was heard all the same.
 */
export const endAlone: SelectSounds<string> = (events) =>
  events.some((event) => event.key === END_KEY)
    ? events.filter((event) => event.key === END_KEY)
    : events;

/**
 * A game on your own is one mount: Play again and a new board mount a new
 * game (`key`), and its guard with it, so its keys need not name the game
 * and are never forgotten.
 */
const sameGame = () => false;

/**
 * Plays a game on your own's sounds, and returns `play` for what the player
 * does in their own handlers (a key, a flag, a card picked).
 *
 * - `game`: the game's state, as the page holds it.
 * - `end`: how it ended, or null while it is on; a page with a best passes
 *   `finishEnd(finish)`.
 * - `derive`: what the game does in reply to a move or a timer, from one
 *   state to the next: a pure function, whose keys name what happened
 *   uniquely within the game (`open:31`, `turn:4`). It never gives the end,
 *   which is `end`'s alone. A pure input with no consequence, such as a flag
 *   that may come and go on one cell, is played in its handler instead,
 *   since its key could not be unique.
 *
 * The first state is only a baseline, so a refresh, or a finished daily
 * puzzle restored from this device, plays nothing. The end plays once,
 * standing alone on its change. Belongs in the component that holds one
 * game, mounted afresh for each.
 */
export function useSoloSounds<Game, Bank extends typeof SOLO_BANK>(
  game: Game,
  end: SoloEnd | null,
  {
    bank,
    derive,
  }: {
    bank: Bank;
    derive?: DeriveSounds<Game, keyof Bank & string, SteppedId<Bank>>;
  },
): PlaySound<keyof Bank & string, SteppedId<Bank>> {
  const play = useSounds(bank);
  const view = useMemo(() => ({ game, end }), [game, end]);
  // Every id the game's derive gives is in its bank, with its step.
  const rules = useMemo(
    () => deriveSoloSounds(derive as DeriveSounds<Game, string> | undefined),
    [derive],
  );
  useStateSounds(view, {
    derive: rules,
    play: play as unknown as PlaySound<string>,
    isNewGame: sameGame,
    select: endAlone,
  });
  return play;
}
