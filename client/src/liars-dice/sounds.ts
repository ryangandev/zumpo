import type {
  LiarsDiceReveal,
  LiarsDiceRoomState,
} from '../../../shared/wire-types';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { liarsDiceSounds } from '../audio/generated/liars-dice';
import { uiSounds } from '../audio/generated/ui';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';
import { SOLO_BANK } from '../solo/sounds';
import { YOU, type SoloGame } from './solo/game';

/*
 * What Liar's Dice sounds like, on your own and in a room: the dice
 * rattling as a round starts, each bid (yours crisp, everybody else's
 * softer), and a call's three beats, Liar, the cups lifting and a die
 * dropping out. The picker's taps are the table's own (`useBidChoice`). In a
 * room, beyond what every room does (`room/sounds.ts`): your go (`turnOf`),
 * and the last seconds of your bid (`actingDeadline`). A call that ends the
 * game is heard as the game's end, which stands alone.
 */

/** What the bid picker plays as the player chooses, on your own or in a room. */
export const LIARS_DICE_PICKER_BANK = {
  'ui-tap': uiSounds['ui-tap'],
} satisfies SoundBank;

/** The room's bank and Liar's Dice's own. */
export const LIARS_DICE_BANK = {
  ...ROOM_SOUNDS,
  ...LIARS_DICE_PICKER_BANK,
  ...liarsDiceSounds,
} satisfies SoundBank;

/** On your own: the solo stingers and Liar's Dice's own. */
export const LIARS_DICE_SOLO_BANK = {
  ...SOLO_BANK,
  ...LIARS_DICE_PICKER_BANK,
  ...liarsDiceSounds,
} satisfies SoundBank;

type Id = keyof typeof LIARS_DICE_BANK & string;
type Stepped = SteppedId<typeof LIARS_DICE_BANK>;
type SoloId = keyof typeof LIARS_DICE_SOLO_BANK & string;
type Event = SoundEvent<Id, Stepped>;

/** How long after Liar the cups lift, and after that a die drops out. */
export const REVEAL_AFTER_MS = 600;
export const LOSE_DIE_AFTER_MS = 1100;

const diceIn = (state: LiarsDiceRoomState) =>
  state.cups.reduce((sum, cup) => sum + cup.diceLeft, 0);

/**
 * Names a roll of the dice: its round, and the dice still in. A round called
 * off because somebody with dice left is rolled again under the same number,
 * with their dice gone, so the dice still in tell its rolls apart.
 */
const rollOf = (state: LiarsDiceRoomState) => `${state.round}.${diceIn(state)}`;

/**
 * Names a go: each bid is one, numbered within its roll. A round called off
 * because somebody with dice left is rolled again under the same number,
 * with their dice gone, so the dice still in tell the rolls of one round
 * apart, and a name never comes round again in a game. A player already out
 * who leaves takes no dice, so the go in play keeps its name.
 */
export const turnOf = (state: LiarsDiceRoomState) =>
  `${rollOf(state)}.${state.bids.length}`;

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * whose rounds started again, with a player the last had not, or with more
 * dice on the table, which within a game only ever go.
 */
export const isNewLiarsDiceGame: IsNewGame<LiarsDiceRoomState> = (
  prev,
  next,
) => {
  const before = new Set(prev.cups.map((cup) => cup.playerId));
  return (
    next.round < prev.round ||
    next.cups.some((cup) => !before.has(cup.playerId)) ||
    diceIn(next) > diceIn(prev)
  );
};

/** The bid `viewer` must make before the clock does, named, or null. */
export function actingDeadline(
  state: LiarsDiceRoomState,
  viewer: string,
): string | null {
  return state.isGameStarted &&
    state.phase === 'bidding' &&
    state.turnPlayerId === viewer
    ? `${turnOf(state)}:bidding`
    : null;
}

/** A bid placed: crisp when it is `viewer`'s own, softer when anybody else's. */
const bidSound = (viewer: string, playerId: string, key: string) =>
  ({
    sound: 'liars-dice-bid',
    key: `bid:${key}`,
    other: playerId !== viewer,
  }) as const;

/**
 * A call's three beats, one after another: Liar (the caller's own is at full
 * level), the cups lifting, and a die dropping out (the loser's own at full
 * level). `round` names the call within the game.
 */
export function callSounds(
  reveal: LiarsDiceReveal,
  viewer: string,
  round: number,
) {
  return [
    {
      sound: 'liars-dice-liar',
      key: `call:${round}`,
      other: reveal.callerId !== viewer,
    },
    {
      sound: 'liars-dice-reveal',
      key: `reveal:${round}`,
      delayMs: REVEAL_AFTER_MS,
    },
    {
      sound: 'liars-dice-lose-die',
      key: `lose:${round}`,
      other: reveal.loserId !== viewer,
      delayMs: LOSE_DIE_AFTER_MS,
    },
  ] as const;
}

/**
 * What a move on your own adds: the dice rattling as a round starts, each
 * bid, and a call's beats. The rounds only grow, and a round's bids with
 * them, so their numbers name what happened. The call that ends the game is
 * the game's end, heard alone.
 */
export const deriveLiarsDiceSolo: DeriveSounds<SoloGame, SoloId> = (
  prev,
  next,
) => {
  const events: SoundEvent<SoloId>[] = [];
  const sameRound = next.round === prev.round;
  if (!sameRound) {
    events.push({ sound: 'liars-dice-roll', key: `roll:${next.round}` });
  }
  const before = sameRound ? prev.bids.length : 0;
  next.bids.slice(before).forEach((bid, index) => {
    events.push(bidSound(YOU, bid.playerId, `${next.round}.${before + index}`));
  });
  if (sameRound && next.reveal !== null && prev.reveal === null) {
    events.push(...callSounds(next.reveal, YOU, next.round));
  }
  return events;
};

/**
 * Whether `next` is a snapshot from before `prev`, or from another game than
 * the one `prev` shows: the rounds only grow within a game, its dice only
 * go, and a game begins on round 1 with no bids. What came before was heard,
 * or is only a baseline, and plays nothing now.
 */
const isStale = (prev: LiarsDiceRoomState, next: LiarsDiceRoomState) =>
  prev.isGameStarted
    ? next.round < prev.round ||
      (next.round === prev.round && diceIn(next) > diceIn(prev))
    : next.round > 1 || next.bids.length > 0;

/**
 * What a Liar's Dice snapshot adds for `viewer`: only what moves a round on,
 * so a snapshot from earlier in the round adds nothing. The dice rattle for a
 * player with dice as a roll begins, and a round called off and rolled again
 * is a new roll; a spectator, or a player already out, has no cup to rattle.
 * A call that ends the game is the game's end, heard alone.
 */
export function deriveLiarsDiceSounds(
  viewer: string,
): DeriveSounds<LiarsDiceRoomState, Id, Stepped> {
  return (prev, next) => {
    const events: Event[] = [];
    if (!next.isGameStarted) return events;
    if (isStale(prev, next)) return events;

    if (next.phase === 'bidding') {
      const roll = rollOf(next);
      const same =
        prev.isGameStarted && prev.phase === 'bidding' && rollOf(prev) === roll;
      const mine = next.cups.find((cup) => cup.playerId === viewer);
      if (!same && mine && mine.diceLeft > 0) {
        events.push({ sound: 'liars-dice-roll', key: `roll:${roll}` });
      }
      const before = same ? prev.bids.length : 0;
      next.bids.slice(before).forEach((bid, index) => {
        events.push(
          bidSound(viewer, bid.playerId, `${roll}.${before + index}`),
        );
      });
    }

    const called =
      next.phase === 'reveal' &&
      !(
        prev.isGameStarted &&
        prev.phase === 'reveal' &&
        prev.round === next.round
      );
    if (called && next.reveal) {
      events.push(...callSounds(next.reveal, viewer, next.round));
    }
    return events;
  };
}

/** What `RoomLayout` hears a Liar's Dice room by, beside the room's own. */
export const LIARS_DICE_SOUNDS = gameSounds({
  bank: LIARS_DICE_BANK,
  derive: deriveLiarsDiceSounds,
  isNewGame: isNewLiarsDiceGame,
  turnOf,
});
