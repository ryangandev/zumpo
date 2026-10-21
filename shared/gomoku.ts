import type { GomokuColor, GomokuMove } from './wire-types.js';

/**
 * Gomoku rules that a room on the server and a game on your own in the
 * browser both need, so the two always judge a board alike. The rules are in
 * docs/games/gomoku.md.
 *
 * A point is a number from 0 to 224, read row by row from the top left; a
 * point's name is its column letter, A to O from the left, and its row
 * number, 1 to 15 from the bottom, as on a printed board.
 */

/** Lines across the board, and down it. */
export const SIZE = 15;
/** Points on the board. */
export const POINTS = SIZE * SIZE;
/** In a row wins: this many or more. */
export const FIVE = 5;
/** How long a player has to place a stone in a room. */
export const TURN_SECONDS = 30;
/** Lost turns in a row that lose the game. */
export const MISSED_TURNS_TO_LOSE = 2;

const COLUMNS = 'ABCDEFGHIJKLMNO';

/** The column of a point, from 0 for A. */
export const columnOf = (point: number): number => point % SIZE;

/** The row of a point, from 1 at the bottom. */
export const rowOf = (point: number): number => SIZE - Math.floor(point / SIZE);

/** The point at a column (from 0) and a row (from 1 at the bottom). */
export const pointAt = (column: number, row: number): number =>
  (SIZE - row) * SIZE + column;

/** Whether a column and row are on the board. */
export const isOnBoard = (column: number, row: number): boolean =>
  column >= 0 && column < SIZE && row >= 1 && row <= SIZE;

/** Whether a number is a point. */
export const isPoint = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value < POINTS;

/** A point's name, such as H8. */
export const pointName = (point: number): string =>
  `${COLUMNS.charAt(columnOf(point))}${rowOf(point)}`;

/** The centre point, H8, where the computer opens. */
export const CENTRE = pointAt(7, 8);

/** The points marked with a dot: the centre, and three in from each corner. */
export const STAR_POINTS: readonly number[] = [
  pointAt(3, 12),
  pointAt(11, 12),
  CENTRE,
  pointAt(3, 4),
  pointAt(11, 4),
];

/** Black moves first; the other colour of each. */
export const otherColor = (color: GomokuColor): GomokuColor =>
  color === 'black' ? 'white' : 'black';

/** Whose colour moves next, after these moves. */
export const colorToMove = (moves: readonly GomokuMove[]): GomokuColor =>
  moves.length % 2 === 0 ? 'black' : 'white';

/** What is on each point: a stone's colour, or null. */
export type Board = (GomokuColor | null)[];

/** The board these moves make. A turn lost to the clock places nothing. */
export const boardOf = (moves: readonly GomokuMove[]): Board => {
  const board: Board = Array.from({ length: POINTS }, () => null);
  for (const { color, point } of moves) {
    if (point !== null) board[point] = color;
  }
  return board;
};

/** Stones on the board. */
export const stonesOf = (moves: readonly GomokuMove[]): number =>
  moves.filter((move) => move.point !== null).length;

/** The last stone placed, or null before the first. */
export const lastStoneOf = (moves: readonly GomokuMove[]): number | null =>
  moves.findLast((move) => move.point !== null)?.point ?? null;

/**
 * The four directions a line can run in, as a step in columns and rows: along
 * a row, down a column, and the two diagonals.
 */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/**
 * The run of `color` stones through `point` in one direction, as points in
 * order along it from one end to the other. `point` itself counts whatever is
 * on it, so a move can be judged before it is placed.
 */
export const runThrough = (
  board: Board,
  point: number,
  color: GomokuColor,
  [dc, dr]: readonly [number, number],
): number[] => {
  const column = columnOf(point);
  const row = rowOf(point);
  const walk = (sign: number): number[] => {
    const points: number[] = [];
    for (let step = 1; ; step += 1) {
      const c = column + sign * step * dc;
      const r = row + sign * step * dr;
      if (!isOnBoard(c, r) || board[pointAt(c, r)] !== color) return points;
      points.push(pointAt(c, r));
    }
  };
  return [...walk(-1).toReversed(), point, ...walk(1)];
};

/**
 * Every line of five or more `color` stones that a stone on `point` makes, in
 * order along each line; empty when it makes none. Freestyle: an overline of
 * six or more is a five too.
 */
export const fivesThrough = (
  board: Board,
  point: number,
  color: GomokuColor,
): number[][] =>
  DIRECTIONS.map((direction) =>
    runThrough(board, point, color, direction),
  ).filter((run) => run.length >= FIVE);

/** Whether every point holds a stone. */
export const isFull = (board: Board): boolean =>
  board.every((stone) => stone !== null);
