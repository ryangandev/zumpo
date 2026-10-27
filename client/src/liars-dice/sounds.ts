import type { LiarsDiceRoomState } from '../../../shared/wire-types';
import type { IsNewGame } from '../audio';
import { gameSounds } from '../room/sounds';

/*
 * What a Liar's Dice room sounds like, beyond what every room does
 * (`room/sounds.ts`): so far only how the room tells its goes and its games
 * apart, for "your turn". The game's own sounds join here.
 */

/**
 * Names a go: each bid is one, numbered within its roll. A round called off
 * because somebody with dice left is rolled again under the same number,
 * with one cup fewer, and a game never gains a player, so the cups tell the
 * rolls of one round apart and a name never comes round again in a game.
 */
export const turnOf = (state: LiarsDiceRoomState) =>
  `${state.round}.${state.cups.length}.${state.bids.length}`;

const diceIn = (state: LiarsDiceRoomState) =>
  state.cups.reduce((sum, cup) => sum + cup.diceLeft, 0);

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

/** What `RoomLayout` hears a Liar's Dice room by, beside the room's own. */
export const LIARS_DICE_SOUNDS = gameSounds({
  isNewGame: isNewLiarsDiceGame,
  turnOf,
});
