import type {
  DoodleChainEntry,
  DoodleChainReveal,
  DoodleChainRoomState,
} from '../../../shared/wire-types';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { doodleChainSounds } from '../audio/generated/doodle-chain';
import { drawAndGuessSounds } from '../audio/generated/draw-and-guess';
import { uiSounds } from '../audio/generated/ui';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';

/*
 * What a Doodle Chain room sounds like, beyond what every room does
 * (`room/sounds.ts`). Everybody works at once, so there is no turn to a
 * player, but each step after the first arrives as a go of their own: the
 * first is the game's start, which every player hears alike, and a player
 * who sits a step out is not called. The viewer's Done is a stamp, played
 * where it is pressed; everybody else's is a pip, merged. A step ends with
 * the books passing on, and a player still working hears their time up. The
 * reveal is the host's: each entry that appears turns a page, a heart
 * somebody else gives pops (the viewer's, where it is pressed), and the last
 * Next closes the album, which is the game's own end (`OWN_ENDING` in
 * `room/sounds.ts`). The last seconds of a step tick for a player not yet
 * Done (`actingDeadline`).
 */

/** What the player does with their own hands, in a step. */
export const DOODLE_CHAIN_HANDS_BANK = {
  'room-stamp': ROOM_SOUNDS['room-stamp'],
  'ui-tap': uiSounds['ui-tap'],
  'ui-undo': uiSounds['ui-undo'],
  'draw-and-guess-pencil': drawAndGuessSounds['draw-and-guess-pencil'],
  'draw-and-guess-clear': drawAndGuessSounds['draw-and-guess-clear'],
  'doodle-chain-heart': doodleChainSounds['doodle-chain-heart'],
} satisfies SoundBank;

/** The room's bank and Doodle Chain's own. */
export const DOODLE_CHAIN_BANK = {
  ...ROOM_SOUNDS,
  ...DOODLE_CHAIN_HANDS_BANK,
  ...doodleChainSounds,
} satisfies SoundBank;

type Id = keyof typeof DOODLE_CHAIN_BANK & string;
type Stepped = SteppedId<typeof DOODLE_CHAIN_BANK>;
type Event = SoundEvent<Id, Stepped>;

/** How long after the books pass on a player's time up is heard. */
export const TIME_UP_AFTER_MS = 250;

/** The phases a step is worked in, with a clock. */
const WORKING: ReadonlySet<DoodleChainRoomState['phase']> = new Set([
  'write',
  'draw',
  'describe',
]);

const working = (state: DoodleChainRoomState) =>
  state.isGameStarted && WORKING.has(state.phase);

/**
 * Names a step: the steps of a game never come round again, and it is the
 * same for all of one, whether the viewer has pressed Done or taken it back.
 */
export const turnOf = (state: DoodleChainRoomState) => String(state.step);

/**
 * Whether the viewer is called to the step in play as a go of their own: a
 * step they have a task in, after the first, whose start every player hears
 * as the game's (the room's start plays only where no go opens the game).
 * The caller leaves out a spectator and a connection that is down.
 */
export const calledToStep = (state: DoodleChainRoomState) =>
  working(state) &&
  state.step >= 2 &&
  state.task !== undefined &&
  !state.task.sitsOut;

/** The entry of `reveal` that `chain` and `step` name, if it is shown. */
const shown = (reveal: DoodleChainReveal, chain: number, step: number) =>
  reveal.entries[chain]?.find((entry) => entry.step === step);

/** What the viewer's own heart on `entry` adds to its count: 1, or 0. */
const ownHeart = (reveal: DoodleChainReveal, entry: DoodleChainEntry) =>
  reveal.hearts[entry.chain] === entry.step ? 1 : 0;

/** The hearts `entry` has from everybody but the viewer. */
const othersHearts = (reveal: DoodleChainReveal, entry: DoodleChainEntry) =>
  entry.hearts - ownHeart(reveal, entry);

/** Who plays, in the order of play. */
const playersOf = (state: DoodleChainRoomState) =>
  state.order.map((player) => player.playerId).join();

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * whose steps started again, with other steps or other players, where the
 * reveal shows fewer entries than before, which only grow, or where an entry
 * shown before reads otherwise, or the words or drawing the viewer was given
 * for the same step.
 */
export const isNewDoodleChainGame: IsNewGame<DoodleChainRoomState> = (
  prev,
  next,
) => {
  if (
    next.step < prev.step ||
    next.steps !== prev.steps ||
    playersOf(next) !== playersOf(prev)
  ) {
    return true;
  }
  if (prev.reveal && next.reveal) {
    if (next.reveal.total < prev.reveal.total) return true;
    const before = prev.reveal.entries[0]?.[0];
    const after = before && shown(next.reveal, before.chain, before.step);
    if (before && after) {
      return JSON.stringify(after.content) !== JSON.stringify(before.content);
    }
  }
  const given = prev.task?.given;
  const now = next.task?.given;
  return (
    next.step === prev.step &&
    given !== undefined &&
    now !== undefined &&
    JSON.stringify(given.content) !== JSON.stringify(now.content)
  );
};

/**
 * The clock `viewer` must act against, named, or null: a step they have a
 * task in and have not pressed Done on. Done stops the ticks, and Keep
 * editing starts them again where the clock stands. A spectator, a player
 * sitting the step out, the books passing on and the reveal have none.
 */
export function actingDeadline(
  state: DoodleChainRoomState,
  viewer: string,
): string | null {
  return working(state) &&
    state.task !== undefined &&
    !state.task.sitsOut &&
    viewer in state.playerList &&
    !state.table[viewer]?.done
    ? `${turnOf(state)}:${state.phase}`
    : null;
}

/**
 * What a Doodle Chain snapshot adds for `viewer`: only what moves a step or
 * the reveal on, so a snapshot from earlier in it adds nothing. Every key
 * names its step, or how many entries the reveal has shown.
 *
 * - The step ends: the books pass on, for everybody; and a player who had
 *   not pressed Done when the clock ran out hears their time up.
 * - While a step runs: somebody else's Done, softer; the step's last Done
 *   is heard as the step ending.
 * - In the reveal: a page turns for each entry the host shows; a heart
 *   somebody else gave, once for an entry's count of hearts, so a heart
 *   given, taken back and given again is heard the first time only.
 * - The reveal ends: the album closes.
 */
export function deriveDoodleChainSounds(
  viewer: string,
): DeriveSounds<DoodleChainRoomState, Id, Stepped> {
  return (prev, next) => {
    const events: Event[] = [];

    if (!next.isGameStarted) {
      if (prev.isGameStarted && prev.phase === 'reveal') {
        events.push({ sound: 'doodle-chain-album', key: 'album' });
      }
      return events;
    }
    const step = next.step;
    const sameStep = prev.isGameStarted && prev.step === step;
    // Only a game moving on is heard: a snapshot from before `prev`, or from
    // another game, holds nothing the viewer has not been through.
    if (prev.isGameStarted ? step < prev.step : step > 1) return events;
    if (sameStep && prev.phase === 'passing' && working(next)) return events;

    if (next.phase === 'passing') {
      if (sameStep && prev.phase === 'passing') return events;
      events.push({ sound: 'doodle-chain-pass', key: `pass:${step}` });
      const task = prev.task;
      if (
        next.stepEnd === 'time' &&
        sameStep &&
        working(prev) &&
        task &&
        !task.sitsOut &&
        viewer in prev.playerList &&
        !prev.table[viewer]?.done
      ) {
        events.push({
          sound: 'room-time-up',
          key: `time-up:${step}`,
          delayMs: TIME_UP_AFTER_MS,
        });
      }
      return events;
    }

    if (working(next)) {
      for (const [id, seat] of Object.entries(next.table)) {
        if (id === viewer || !seat.done || seat.sitsOut) continue;
        if (sameStep && prev.table[id]?.done) continue;
        events.push({
          sound: 'room-pip',
          key: `done:${step}:${id}`,
          other: true,
        });
      }
      return events;
    }

    const reveal = next.reveal;
    if (next.phase !== 'reveal' || !reveal) return events;
    const was =
      prev.isGameStarted && prev.phase === 'reveal' ? prev.reveal : undefined;
    if (!was || reveal.total > was.total) {
      events.push({ sound: 'doodle-chain-page', key: `page:${reveal.total}` });
    }
    if (was) {
      for (const entry of reveal.entries.flat()) {
        // An entry only just shown has had no time to be given a heart.
        const before = shown(was, entry.chain, entry.step);
        const hearts = othersHearts(reveal, entry);
        if (!before || hearts <= othersHearts(was, before)) continue;
        events.push({
          sound: 'doodle-chain-heart',
          key: `heart:${entry.chain}.${entry.step}:${hearts}`,
          other: true,
        });
      }
    }
    return events;
  };
}

/** What `RoomLayout` hears a Doodle Chain room by, beside the room's own. */
export const DOODLE_CHAIN_SOUNDS = gameSounds({
  bank: DOODLE_CHAIN_BANK,
  derive: deriveDoodleChainSounds,
  isNewGame: isNewDoodleChainGame,
  turnOf,
});
