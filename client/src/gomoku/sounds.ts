import type { GomokuRoomState } from '../../../shared/wire-types';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { gomokuSounds } from '../audio/generated/gomoku';
import { uiSounds } from '../audio/generated/ui';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';
import { SOLO_BANK } from '../solo/sounds';
import type { SoloGame } from './solo/game';

/*
 * What Gomoku sounds like, on your own and in a room: a faint stone put down
 * by a first tap on a touch screen, played where it is tapped, and each
 * stone placed, yours crisp and your opponent's, or the computer's, softer,
 * so an answer never startles. A stone that makes five is the game's end:
 * the five lights (`gomoku-five`, beside the end), then the room's win or
 * kind cadence, or the solo stinger, follows. The stone that hands you the
 * go plays beside your "your turn" (`beside`).
 * In a room, beyond what every room does (`room/sounds.ts`): your go
 * (`turnOf`), a warning when your first lost turn leaves one more to lose
 * the game, and the last seconds of your move (`actingDeadline`). Nothing
 * sounds a threat on the board: the warning is the clock's alone, which the
 * screen already says to the one it is meant for.
 */

/** The room's bank and Gomoku's own. */
export const GOMOKU_BANK = {
  ...ROOM_SOUNDS,
  ...gomokuSounds,
} satisfies SoundBank;

/** On your own: the solo stingers, Gomoku's own, and a take-back. */
export const GOMOKU_SOLO_BANK = {
  ...SOLO_BANK,
  ...gomokuSounds,
  'ui-undo': uiSounds['ui-undo'],
} satisfies SoundBank;

type Id = keyof typeof GOMOKU_BANK & string;
type Stepped = SteppedId<typeof GOMOKU_BANK>;
type SoloId = keyof typeof GOMOKU_SOLO_BANK & string;

/**
 * Names a go: how many turns the game has had, stones and turns lost to the
 * clock alike, so a name never comes round again within one game.
 */
export const turnOf = (state: GomokuRoomState) => String(state.moves.length);

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * by its number or by who plays which colour (a new pair counts from 1
 * again).
 */
export const isNewGomokuGame: IsNewGame<GomokuRoomState> = (prev, next) =>
  next.gameNumber !== prev.gameNumber ||
  next.colors?.black.playerId !== prev.colors?.black.playerId ||
  next.colors?.white.playerId !== prev.colors?.white.playerId;

/** The move `viewer` must make before the clock does, named, or null. */
export function actingDeadline(
  state: GomokuRoomState,
  viewer: string,
): string | null {
  return state.isGameStarted &&
    state.phase === 'playing' &&
    state.turnPlayerId === viewer
    ? `${turnOf(state)}:playing`
    : null;
}

/** A stone is named by its number in the game, which only grows. */
const stoneKey = (index: number) => `stone:${index}`;

/**
 * A stone on your own, the computer's softer than yours. `placed` names it,
 * since the moves go down with a take-back and come round again; the move
 * that makes five is the game's end, heard alone.
 */
export const deriveGomokuSolo: DeriveSounds<SoloGame, SoloId> = (
  prev,
  next,
) => {
  if (next.placed <= prev.placed) return [];
  const mine = next.moves.at(-1)?.color === next.color;
  const events: SoundEvent<SoloId>[] = [
    { sound: 'gomoku-stone', key: stoneKey(next.placed), other: !mine },
  ];
  if (next.winLines?.length) {
    events.push({ sound: 'gomoku-five', key: 'five', beside: true });
  }
  return events;
};

/**
 * What a Gomoku snapshot adds for `viewer`: each new stone, the opponent's
 * and a spectator's softer; and the warning when the viewer's own turn was
 * lost to the clock and the next one would lose them the game. A stone that
 * makes five is heard as the five, beside the game's end; the second lost
 * turn is the game's end, heard alone. A turn the opponent loses is silent: it is their go passing to the
 * viewer, whose "your turn" says so.
 */
export function deriveGomokuSounds(
  viewer: string,
): DeriveSounds<GomokuRoomState, Id, Stepped> {
  return (prev, next) => {
    const events: SoundEvent<Id, Stepped>[] = [];
    // The five that ended the game, lit beside the end stinger, which follows.
    if (prev.isGameStarted && !next.isGameStarted && next.winLines?.length) {
      events.push({
        sound: 'gomoku-five',
        key: `five:${next.gameNumber}`,
        beside: true,
      });
    }
    if (!next.isGameStarted || !next.colors) return events;
    // Only a game moving on is heard: a snapshot from earlier in it, or from
    // another game, holds no stone the viewer has not been through.
    if (!prev.isGameStarted && next.moves.length > 0) return events;
    const before = prev.isGameStarted ? prev.moves.length : 0;
    next.moves.slice(before).forEach((move, offset) => {
      const index = before + offset;
      const player = next.colors?.[move.color].playerId;
      if (move.point !== null) {
        // The stone that hands the viewer the go plays beside their
        // "your turn".
        const handsGo =
          player !== viewer &&
          index === next.moves.length - 1 &&
          next.turnPlayerId === viewer;
        events.push({
          sound: 'gomoku-stone',
          key: stoneKey(index),
          other: player !== viewer,
          ...(handsGo && { beside: true }),
        });
      } else if (player === viewer && next.missedTurns[viewer] === 1) {
        events.push({ sound: 'gomoku-warning', key: `warning:${index}` });
      }
    });
    return events;
  };
}

/** What `RoomLayout` hears a Gomoku room by, beside the room's own. */
export const GOMOKU_SOUNDS = gameSounds({
  bank: GOMOKU_BANK,
  derive: deriveGomokuSounds,
  isNewGame: isNewGomokuGame,
  turnOf,
});
