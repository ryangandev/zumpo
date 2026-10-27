import type { GomokuRoomState } from '../../../shared/wire-types';
import type { IsNewGame } from '../audio';
import { gameSounds } from '../room/sounds';

/*
 * What a Gomoku room sounds like, beyond what every room does
 * (`room/sounds.ts`): so far only how the room tells its goes and its games
 * apart, for "your turn". The game's own sounds join here.
 */

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

/** What `RoomLayout` hears a Gomoku room by, beside the room's own. */
export const GOMOKU_SOUNDS = gameSounds({
  isNewGame: isNewGomokuGame,
  turnOf,
});
