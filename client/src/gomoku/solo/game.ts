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
  /**
   * Stones ever put down in this game, taken back or not: it only grows, so
   * it names each stone for the sounds, which a take-back would repeat by
   * the moves.
   */
  placed: number;
  /** Who made five; null while playing and for a draw. */
  winner: GomokuColor | null;
  /** Each line of five that won, its points in order along it. */
  winLines: number[][] | null;
  over: boolean;
}

export const newGame = (picks: SoloPicks): SoloGame => ({
  ...picks,
  moves: [],
  placed: 0,
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
  const placed = game.placed + 1;
  const fives = fivesThrough(board, point, color);
  if (fives.length > 0) {
    return {
      ...game,
      moves,
      placed,
      winner: color,
      winLines: fives,
      over: true,
    };
  }
  return { ...game, moves, placed, over: isFull(board) };
}

/** On your turn, once you have a stone down: there is a move to take back. */
export const canTakeBack = (game: SoloGame): boolean =>
  isYourTurn(game) && game.moves.some((move) => move.color === game.color);

/**
 * Takes back your last stone and the computer's answer to it, so it is your
 * turn again where it was. Only on your turn: a finished game stays as it
 * ended, and a room has no take-backs.
 */
export function takeBack(game: SoloGame): SoloGame {
  if (!canTakeBack(game)) return game;
  const yours = game.moves.findLastIndex((move) => move.color === game.color);
  return { ...game, moves: game.moves.slice(0, yours) };
}

export const youWon = (game: SoloGame): boolean =>
  game.over && game.winner === game.color;

export const computerWon = (game: SoloGame): boolean =>
  game.over && game.winner === otherColor(game.color);

export const stonesOn = (game: SoloGame): number => stonesOf(game.moves);
