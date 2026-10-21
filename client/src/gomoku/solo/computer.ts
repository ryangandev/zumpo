import {
  boardOf,
  CENTRE,
  columnOf,
  DIRECTIONS,
  isOnBoard,
  otherColor,
  pointAt,
  POINTS,
  rowOf,
  type Board,
} from '../../../../shared/gomoku';
import type { GomokuColor, GomokuMove } from '../../../../shared/wire-types';

/**
 * The computer on your own (docs/games/gomoku.md#the-computer). It reads the
 * board as people do, as lines of stones with open or blocked ends, and never
 * searches the whole game. It is the browser's alone: the server never plays
 * for anybody.
 */

export type GomokuLevel = 'easy' | 'medium' | 'hard';

export const LEVELS: readonly GomokuLevel[] = ['easy', 'medium', 'hard'];

export const isLevel = (value: unknown): value is GomokuLevel =>
  LEVELS.some((level) => level === value);

/** The least the computer takes over a move, so each stone is seen landing. */
export const THINKING_MS = 500;

/** The most Hard searches for, before it settles for Medium's move. */
export const HARD_SEARCH_MS = 800;

/** What a stone makes along one line through it, weakest first. */
const enum Shape {
  None,
  Two,
  OpenTwo,
  Three,
  OpenThree,
  Four,
  OpenFour,
  Five,
}

/**
 * The scores fall steeply: a five outweighs everything, an open four any
 * number of threes, and two threats at once count as nearly an open four.
 */
const FIVE = 1_000_000;
const OPEN_FOUR = 100_000;
const FOUR_AND_THREE = 60_000;
const TWO_OPEN_THREES = 40_000;
const SINGLE: Readonly<Record<Shape, number>> = {
  [Shape.None]: 0,
  [Shape.Two]: 60,
  [Shape.OpenTwo]: 400,
  [Shape.Three]: 800,
  [Shape.OpenThree]: 5_000,
  [Shape.Four]: 6_000,
  [Shape.OpenFour]: OPEN_FOUR,
  [Shape.Five]: FIVE,
};

/** Defence is weighed a little below attack, so it would rather make its own four. */
const DEFENCE = 0.9;

/** Points either side of a stone that a line is read over. */
const REACH = 4;
const WIDTH = 2 * REACH + 1;

// A line through a stone, read from one end: X the stone's colour (the stone
// itself in the middle), O the other colour or the edge, _ an empty point.
type Line = string;

const shapes = new Map<Line, Shape>();

/** The empty points of a line that a stone on would make five through the middle. */
function fivePoints(line: Line): number[] {
  const found = new Set<number>();
  for (let start = 0; start <= REACH; start += 1) {
    const window = line.slice(start, start + 5);
    if (window.length < 5 || window.includes('O')) continue;
    const empty = window.indexOf('_');
    if (empty >= 0 && window.lastIndexOf('_') === empty) {
      found.add(start + empty);
    }
  }
  return [...found];
}

function isFive(line: Line): boolean {
  let run = 1;
  for (let i = REACH - 1; i >= 0 && line[i] === 'X'; i -= 1) run += 1;
  for (let i = REACH + 1; i < WIDTH && line[i] === 'X'; i += 1) run += 1;
  return run >= 5;
}

const withStone = (line: Line, at: number): Line =>
  `${line.slice(0, at)}X${line.slice(at + 1)}`;

/**
 * What the middle stone makes along its line. A four can become five in one
 * way, an open four in two; a three can become a four with one more stone,
 * an open three an open four; and so on down. Every line is worked out once.
 */
function shapeOf(line: Line): Shape {
  const known = shapes.get(line);
  if (known !== undefined) return known;
  let shape = Shape.None;
  if (isFive(line)) {
    shape = Shape.Five;
  } else {
    const fives = fivePoints(line).length;
    if (fives >= 2) shape = Shape.OpenFour;
    else if (fives === 1) shape = Shape.Four;
    else {
      // The best this line becomes with one more stone, one shape down.
      let best = Shape.None;
      for (let at = 0; at < WIDTH; at += 1) {
        if (line[at] !== '_') continue;
        const next = shapeOf(withStone(line, at));
        if (next > best) best = next;
      }
      shape =
        best === Shape.OpenFour
          ? Shape.OpenThree
          : best === Shape.Four
            ? Shape.Three
            : best === Shape.OpenThree
              ? Shape.OpenTwo
              : best === Shape.Three
                ? Shape.Two
                : Shape.None;
    }
  }
  shapes.set(line, shape);
  return shape;
}

/** The line through `point` in one direction, with `color` on `point`. */
function lineAt(
  board: Board,
  point: number,
  color: GomokuColor,
  [dc, dr]: readonly [number, number],
): Line {
  const column = columnOf(point);
  const row = rowOf(point);
  let line = '';
  for (let step = -REACH; step <= REACH; step += 1) {
    if (step === 0) {
      line += 'X';
      continue;
    }
    const c = column + step * dc;
    const r = row + step * dr;
    if (!isOnBoard(c, r)) {
      line += 'O';
      continue;
    }
    const stone = board[pointAt(c, r)];
    line += stone === null ? '_' : stone === color ? 'X' : 'O';
  }
  return line;
}

/** What a `color` stone on `point` makes along each of the four lines. */
const shapesAt = (board: Board, point: number, color: GomokuColor) =>
  DIRECTIONS.map((direction) =>
    shapeOf(lineAt(board, point, color, direction)),
  );

/** How much a `color` stone on `point` is worth to `color`. */
export function scoreAt(
  board: Board,
  point: number,
  color: GomokuColor,
): number {
  const made = shapesAt(board, point, color);
  const count = (shape: Shape) => made.filter((s) => s === shape).length;
  if (count(Shape.Five) > 0) return FIVE;
  const fours = count(Shape.Four);
  const openThrees = count(Shape.OpenThree);
  if (count(Shape.OpenFour) > 0 || fours >= 2) return OPEN_FOUR;
  if (fours > 0 && openThrees > 0) return FOUR_AND_THREE;
  if (openThrees >= 2) return TWO_OPEN_THREES;
  return made.reduce((total, shape) => total + SINGLE[shape], 0);
}

/** Whether a `color` stone on `point` makes five. */
const makesFive = (board: Board, point: number, color: GomokuColor) =>
  shapesAt(board, point, color).includes(Shape.Five);

/** The points a `color` stone would make five on next, after one on `point`. */
function threatsFrom(
  board: Board,
  point: number,
  color: GomokuColor,
): number[] {
  const column = columnOf(point);
  const row = rowOf(point);
  const found = new Set<number>();
  for (const direction of DIRECTIONS) {
    const line = lineAt(board, point, color, direction);
    for (const at of fivePoints(line)) {
      const step = at - REACH;
      found.add(
        pointAt(column + step * direction[0], row + step * direction[1]),
      );
    }
  }
  return [...found];
}

/** The empty points within two of a stone; on an empty board, the centre. */
export function candidatesOf(board: Board): number[] {
  const near = new Set<number>();
  for (let point = 0; point < POINTS; point += 1) {
    if (board[point] === null) continue;
    const column = columnOf(point);
    const row = rowOf(point);
    for (let dc = -2; dc <= 2; dc += 1) {
      for (let dr = -2; dr <= 2; dr += 1) {
        const c = column + dc;
        const r = row + dr;
        if (!isOnBoard(c, r)) continue;
        const next = pointAt(c, r);
        if (board[next] === null) near.add(next);
      }
    }
  }
  if (near.size === 0 && board[CENTRE] === null) return [CENTRE];
  return [...near];
}

interface Scored {
  point: number;
  score: number;
}

/** Every candidate, best first: attack in full, defence at `defence`. */
function ranked(board: Board, color: GomokuColor, defence: number): Scored[] {
  const other = otherColor(color);
  return candidatesOf(board)
    .map((point) => ({
      point,
      score:
        scoreAt(board, point, color) + defence * scoreAt(board, point, other),
    }))
    .toSorted((a, b) => b.score - a.score);
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/** Medium's move: the best, or one within a few percent of it. */
function mediumMove(
  board: Board,
  color: GomokuColor,
  random: () => number,
): number {
  const moves = ranked(board, color, DEFENCE);
  const best = moves[0]?.score ?? 0;
  return pick(
    moves.filter((move) => move.score >= best * 0.97),
    random,
  ).point;
}

/** The point that wins at once, or blocks a five next move; else null. */
function forcedMove(board: Board, color: GomokuColor): number | null {
  const candidates = candidatesOf(board);
  const win = candidates.find((point) => makesFive(board, point, color));
  if (win !== undefined) return win;
  const other = otherColor(color);
  const blocks = candidates.filter((point) => makesFive(board, point, other));
  if (blocks.length === 0) return null;
  // Two fives to stop cannot both be; block the one that also helps most.
  return blocks
    .map((point) => ({ point, score: scoreAt(board, point, color) }))
    .toSorted((a, b) => b.score - a.score)[0]!.point;
}

class OutOfTime extends Error {}

/**
 * A forced win by fours for `color`, to move: a run of fours the other player
 * must answer, each on the one point that stops it, ending in five or in two
 * fives at once. It looks `depth` of `color`'s moves deep, and gives up on a
 * line where an answer makes a four of the other player's.
 */
export function winByFours(
  board: Board,
  color: GomokuColor,
  depth: number,
  deadline: number,
  now: () => number = performanceNow,
): number[] | null {
  const other = otherColor(color);
  const search = (left: number): number[] | null => {
    if (now() > deadline) throw new OutOfTime();
    // The other player wins first if they already have a four.
    const theirs = candidatesOf(board).some((point) =>
      makesFive(board, point, other),
    );
    for (const point of candidatesOf(board)) {
      if (makesFive(board, point, color)) return [point];
      if (theirs || left === 0) continue;
      board[point] = color;
      const threats = threatsFrom(board, point, color);
      let found: number[] | null = null;
      if (threats.length >= 2) {
        found = [point];
      } else if (threats.length === 1) {
        const answer = threats[0]!;
        // An answer that makes five, or a four of theirs, ends the line.
        if (
          !makesFive(board, answer, other) &&
          threatsFrom(board, answer, other).length === 0
        ) {
          board[answer] = other;
          const rest = search(left - 1);
          board[answer] = null;
          if (rest) found = [point, answer, ...rest];
        }
      }
      board[point] = null;
      if (found) return found;
    }
    return null;
  };
  return search(depth);
}

function performanceNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

/** How deep Hard looks for a win by fours, in its own moves. */
const FOURS_DEPTH = 8;
/** How many of its best moves Hard looks two moves ahead from. */
const LOOK_AHEAD = 10;
/** How many of your best replies it weighs to each. */
const REPLIES = 3;

/**
 * Hard: a forced win by fours of its own first; then a block of yours; then
 * Medium's ten best moves, each judged by your best reply and its best
 * answer to that.
 */
function hardMove(
  board: Board,
  color: GomokuColor,
  random: () => number,
  now: () => number,
): number {
  const deadline = now() + HARD_SEARCH_MS;
  const other = otherColor(color);
  const fallback = mediumMove(board, color, random);
  try {
    const mine = winByFours(board, color, FOURS_DEPTH, deadline, now);
    if (mine) return mine[0]!;

    const moves = ranked(board, color, DEFENCE).slice(0, LOOK_AHEAD);
    const theirs = winByFours(board, other, FOURS_DEPTH, deadline, now);
    if (theirs) {
      // Stopping it: its first stones, or any good move that leaves it none.
      const stops = [
        ...new Set([...theirs.slice(0, 2), ...moves.map((m) => m.point)]),
      ];
      for (const point of stops) {
        board[point] = color;
        const still = winByFours(board, other, FOURS_DEPTH, deadline, now);
        board[point] = null;
        if (!still) return point;
      }
    }

    let best = -Infinity;
    let chosen: number[] = [];
    for (const move of moves) {
      board[move.point] = color;
      let worst = Infinity;
      for (const reply of ranked(board, other, DEFENCE).slice(0, REPLIES)) {
        if (now() > deadline) throw new OutOfTime();
        board[reply.point] = other;
        const answer = makesFive(board, reply.point, other)
          ? -FIVE
          : (ranked(board, color, DEFENCE)[0]?.score ?? 0) / 2;
        board[reply.point] = null;
        worst = Math.min(worst, answer - reply.score);
      }
      board[move.point] = null;
      const value = move.score + (worst === Infinity ? 0 : worst);
      if (value > best + 1e-6) {
        best = value;
        chosen = [move.point];
      } else if (Math.abs(value - best) <= 1e-6) {
        chosen.push(move.point);
      }
    }
    return chosen.length > 0 ? pick(chosen, random) : fallback;
  } catch (error) {
    if (error instanceof OutOfTime) return fallback;
    throw error;
  }
}

/**
 * The computer's move for `color` after `moves`, at `level`. At every level
 * it plays its own five and blocks yours; Easy weighs defence at half and
 * picks among its four best, Medium plays its best, and Hard looks ahead.
 */
export function chooseMove(
  moves: readonly GomokuMove[],
  color: GomokuColor,
  level: GomokuLevel,
  random: () => number = Math.random,
  now: () => number = performanceNow,
): number {
  const board = boardOf(moves);
  const forced = forcedMove(board, color);
  if (forced !== null) return forced;
  switch (level) {
    case 'easy':
      return pick(ranked(board, color, 0.5).slice(0, 4), random).point;
    case 'medium':
      return mediumMove(board, color, random);
    case 'hard':
      return hardMove(board, color, random, now);
  }
}
