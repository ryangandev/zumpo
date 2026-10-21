import {
  boardOf,
  colorToMove,
  fivesThrough,
  isFull,
  isPoint,
  otherColor,
  stonesOf,
} from '../../../../shared/gomoku';
import type { GomokuColor, GomokuMove } from '../../../../shared/wire-types';
import type { GomokuLevel } from './computer';

/** What you pick before a game on your own. */
export interface SoloPicks {
  level: GomokuLevel;
  /** Your stones; Black moves first. */
  color: GomokuColor;
}

/** A game on your own against the computer, from the first stone to the last. */
export interface SoloGame extends SoloPicks {
  moves: GomokuMove[];
  /** Who made five; null while playing and for a draw. */
  winner: GomokuColor | null;
  /** Each line of five that won, its points in order along it. */
  winLines: number[][] | null;
  over: boolean;
}

export const newGame = (picks: SoloPicks): SoloGame => ({
  ...picks,
  moves: [],
  winner: null,
  winLines: null,
  over: false,
});

/** Whose stone goes down next. */
export const toMove = (game: SoloGame): GomokuColor => colorToMove(game.moves);

export const isYourTurn = (game: SoloGame): boolean =>
  !game.over && toMove(game) === game.color;

/**
 * The game after the next stone goes on `point`, judged as a room's server
 * judges it: five or more in a row wins, a full board is a draw. A stone on a
 * taken point, off the board or after the end changes nothing.
 */
export function play(game: SoloGame, point: number): SoloGame {
  if (game.over || !isPoint(point)) return game;
  const board = boardOf(game.moves);
  if (board[point] !== null) return game;
  const color = toMove(game);
  board[point] = color;
  const moves = [...game.moves, { color, point }];
  const fives = fivesThrough(board, point, color);
  if (fives.length > 0) {
    return { ...game, moves, winner: color, winLines: fives, over: true };
  }
  return { ...game, moves, over: isFull(board) };
}

export const youWon = (game: SoloGame): boolean =>
  game.over && game.winner === game.color;

export const computerWon = (game: SoloGame): boolean =>
  game.over && game.winner === otherColor(game.color);

export const stonesOn = (game: SoloGame): number => stonesOf(game.moves);
