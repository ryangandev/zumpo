import type { MinesweeperRoomState } from '../../../shared/wire-types';
import { HIDDEN } from '../../../shared/minesweeper';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { minesweeperSounds } from '../audio/generated/minesweeper';
import { uiSounds } from '../audio/generated/ui';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';
import { SOLO_BANK } from '../solo/sounds';
import { clearedCells, type SoloGame } from './solo/game';

/*
 * What Minesweeper sounds like. On your own: a cell opened, an opening that
 * clears many at once, a flag planted or lifted, and the board's end. In a
 * room, beyond what every room does (`room/sounds.ts`): your pick locked in,
 * somebody else's, the round's reveal, a mine somebody hit, and the last
 * seconds of the pick (`actingDeadline`).
 */

/** The room's bank and Minesweeper's own. */
export const MINESWEEPER_BANK = {
  ...ROOM_SOUNDS,
  ...minesweeperSounds,
} satisfies SoundBank;

/** On your own: the solo stingers, Minesweeper's own, and a mode's tap. */
export const MINESWEEPER_SOLO_BANK = {
  ...SOLO_BANK,
  ...minesweeperSounds,
  'ui-tap': uiSounds['ui-tap'],
} satisfies SoundBank;

type Id = keyof typeof MINESWEEPER_BANK & string;
type Stepped = SteppedId<typeof MINESWEEPER_BANK>;
type SoloId = keyof typeof MINESWEEPER_SOLO_BANK & string;

/**
 * What a move on your own opened: one cell, or an opening of many, heard
 * once however many. The cells cleared only grow, so their count names the
 * move. A mine, and the last safe cell, are the board's end.
 */
export const deriveMinesweeperSolo: DeriveSounds<SoloGame, SoloId> = (
  prev,
  next,
) => {
  const before = clearedCells(prev);
  const after = clearedCells(next);
  if (after <= before) return [];
  return [
    {
      sound: after - before > 1 ? 'minesweeper-cascade' : 'minesweeper-open',
      key: `open:${after}`,
    },
  ];
};

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * whose rounds started again, on another board, or where a cell open before
 * is hidden or reads otherwise, since within a game a cell once open stays
 * as it is.
 */
export const isNewMinesweeperGame: IsNewGame<MinesweeperRoomState> = (
  prev,
  next,
) =>
  next.round < prev.round ||
  next.difficulty !== prev.difficulty ||
  prev.board.some(
    (cell, index) => cell !== HIDDEN && next.board[index] !== cell,
  );

/** The pick `viewer` must make before the clock does, named, or null. */
export function actingDeadline(
  state: MinesweeperRoomState,
  viewer: string,
): string | null {
  return state.isGameStarted &&
    state.phase === 'picking' &&
    state.myPick === null &&
    viewer in state.playerList
    ? `${state.round}:picking`
    : null;
}

/**
 * What a Minesweeper snapshot adds for `viewer`: only what moves a round on.
 * The last pick and the round's end arrive in one snapshot, and are heard as
 * the reveal; a mine hit in it pops once however many hit one, at full level
 * only for a viewer who hit it. A pick the clock made for the viewer is
 * their time up, in the reveal's place.
 */
export function deriveMinesweeperSounds(
  viewer: string,
): DeriveSounds<MinesweeperRoomState, Id, Stepped> {
  return (prev, next) => {
    const events: SoundEvent<Id, Stepped>[] = [];
    if (!next.isGameStarted) return events;
    const round = next.round;
    const sameRound = prev.isGameStarted && prev.round === round;

    if (next.phase === 'picking') {
      const picking = sameRound && prev.phase === 'picking';
      if (next.myPick !== null && !(picking && prev.myPick !== null)) {
        events.push({ sound: 'room-stamp', key: `pick:${round}` });
      }
      for (const id of next.lockedIn) {
        if (id === viewer || (picking && prev.lockedIn.includes(id))) continue;
        events.push({
          sound: 'room-pip',
          key: `locked:${round}:${id}`,
          other: true,
        });
      }
      return events;
    }

    if (next.phase !== 'reveal' || (sameRound && prev.phase === 'reveal')) {
      return events;
    }
    const own = next.lastRound.find((pick) => pick.playerId === viewer);
    events.push({
      sound: own?.autoPlayed ? 'room-time-up' : 'room-reveal',
      key: `reveal:${round}`,
    });
    const hits = next.lastRound.filter((pick) => pick.hitMine);
    if (hits.length > 0) {
      events.push({
        sound: 'minesweeper-mine',
        key: `mine:${round}`,
        other: !hits.some((pick) => pick.playerId === viewer),
      });
    }
    return events;
  };
}

/** What `RoomLayout` hears a Minesweeper room by, beside the room's own. */
export const MINESWEEPER_SOUNDS = gameSounds({
  bank: MINESWEEPER_BANK,
  derive: deriveMinesweeperSounds,
  isNewGame: isNewMinesweeperGame,
});
