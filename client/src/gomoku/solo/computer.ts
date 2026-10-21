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

/**
 * Each line's shape by its eight points around the middle, read as a number
 * with a digit for each (0 empty, 1 the stone's colour, 2 the other or the
 * edge): the searches read lines far too often to spell each one out.
 */
const shapesByCode = new Int8Array(3 ** (WIDTH - 1)).fill(-1);

/** What a `color` stone on `point` makes along one line. */
function shapeAt(
  board: Board,
  point: number,
  color: GomokuColor,
  direction: readonly [number, number],
): Shape {
  const column = columnOf(point);
  const row = rowOf(point);
  let code = 0;
  for (let step = -REACH; step <= REACH; step += 1) {
    if (step === 0) continue;
    const c = column + step * direction[0];
    const r = row + step * direction[1];
    const stone = isOnBoard(c, r) ? board[pointAt(c, r)] : undefined;
    code = code * 3 + (stone === null ? 0 : stone === color ? 1 : 2);
  }
  let shape = shapesByCode[code]!;
  if (shape < 0) {
    shape = shapeOf(lineAt(board, point, color, direction));
    shapesByCode[code] = shape;
  }
  return shape as Shape;
}

/** How much a `color` stone on `point` is worth to `color`. */
export function scoreAt(
  board: Board,
  point: number,
  color: GomokuColor,
): number {
  let five = false;
  let openFour = false;
  let fours = 0;
  let openThrees = 0;
  let total = 0;
  for (const direction of DIRECTIONS) {
    const shape = shapeAt(board, point, color, direction);
    if (shape === Shape.Five) five = true;
    else if (shape === Shape.OpenFour) openFour = true;
    else if (shape === Shape.Four) fours += 1;
    else if (shape === Shape.OpenThree) openThrees += 1;
    total += SINGLE[shape];
  }
  if (five) return FIVE;
  if (openFour || fours >= 2) return OPEN_FOUR;
  if (fours > 0 && openThrees > 0) return FOUR_AND_THREE;
  if (openThrees >= 2) return TWO_OPEN_THREES;
  return total;
}

/** Whether a `color` stone on `point` makes five. */
const makesFive = (board: Board, point: number, color: GomokuColor) =>
  DIRECTIONS.some(
    (direction) => shapeAt(board, point, color, direction) === Shape.Five,
  );

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
 * The work a search may do, counted in positions looked at, so a move is the
 * same on a fast machine and a slow one; the clock only stops a search that
 * would still freeze a very slow page.
 */
export class Budget {
  #left: number;
  readonly #deadline: number;
  readonly #now: () => number;

  constructor(positions: number, deadline: number, now = performanceNow) {
    this.#left = positions;
    this.#deadline = deadline;
    this.#now = now;
  }

  /** One more position, or OutOfTime when the budget or the clock runs out. */
  spend(): void {
    this.#left -= 1;
    if (this.#left < 0 || this.#now() > this.#deadline) throw new OutOfTime();
  }
}

/**
 * A forced win by fours for `color`, to move: a run of fours the other player
 * must answer, each on the one point that stops it, ending in five or in two
 * fives at once. It looks `depth` of `color`'s moves deep, gives up on a line
 * where an answer makes a four of the other player's, and throws OutOfTime
 * once `budget` runs out.
 */
export function winByFours(
  board: Board,
  color: GomokuColor,
  depth: number,
  budget: Budget,
): number[] | null {
  const other = otherColor(color);
  // The same fours in another order reach the same position: each position
  // that leads nowhere is looked at once, at the most moves it had left.
  const fours: number[] = [];
  const answers: number[] = [];
  const failed = new Map<string, number>();
  const keyOf = () =>
    `${fours.toSorted((a, b) => a - b).join()}/${answers.toSorted((a, b) => a - b).join()}`;
  const search = (left: number): number[] | null => {
    const key = keyOf();
    if ((failed.get(key) ?? -1) >= left) return null;
    budget.spend();
    const candidates = candidatesOf(board);
    const win = candidates.find((point) => makesFive(board, point, color));
    if (win !== undefined) return [win];
    // The other player wins first if they already have a four.
    if (
      left === 0 ||
      candidates.some((point) => makesFive(board, point, other))
    ) {
      failed.set(key, left);
      return null;
    }
    for (const point of candidates) {
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
          fours.push(point);
          answers.push(answer);
          const rest = search(left - 1);
          fours.pop();
          answers.pop();
          board[answer] = null;
          if (rest) found = [point, answer, ...rest];
        }
      }
      board[point] = null;
      if (found) return found;
    }
    failed.set(key, left);
    return null;
  };
  // The shortest win first, so a deep line cannot spend the budget on its way.
  for (let left = 1; left <= depth; left += 1) {
    const found = search(left);
    if (found) return found;
  }
  return null;
}

/** `winByFours` within `positions`: a win, none, or undefined for not known. */
function triedWinByFours(
  board: Board,
  color: GomokuColor,
  positions: number,
  deadline: number,
  now: () => number,
): number[] | null | undefined {
  try {
    return winByFours(
      board,
      color,
      FOURS_DEPTH,
      new Budget(positions, deadline, now),
    );
  } catch (error) {
    if (error instanceof OutOfTime) return undefined;
    throw error;
  }
}

function performanceNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

/** How deep Hard looks for a win by fours, in its own moves. */
const FOURS_DEPTH = 8;
/** The positions Hard may look at for a win by fours of its own, or of yours. */
const FOURS_POSITIONS = 1_500;
/** The same, for each move it might play to stop one of yours. */
const STOP_POSITIONS = 300;
/** How many moves Hard weighs at the root, and at each move after it. */
const ROOT_WIDTH = 12;
const WIDTH_AHEAD = 8;
/** The deepest Hard looks, in stones: its own, yours, its own, yours. */
const MAX_DEPTH = 6;
/** The positions Hard may look at in that search. */
const SEARCH_POSITIONS = 20_000;

/** A won position, ahead of any score the stones could add up to. */
const WON = 100_000_000;

/** What each stone's line is worth to its colour in a position. */
const LINE_VALUE: Readonly<Record<Shape, number>> = {
  [Shape.None]: 0,
  [Shape.Two]: 4,
  [Shape.OpenTwo]: 20,
  [Shape.Three]: 30,
  [Shape.OpenThree]: 200,
  [Shape.Four]: 250,
  [Shape.OpenFour]: 5_000,
  [Shape.Five]: WON,
};

/**
 * How good the stones are for `color`, whose move it is: every stone's
 * shape along each line, its own against the other player's. A four of its
 * own wins, as it plays five next; an open four of theirs, or an open three
 * of its own against no four of theirs, settles the game a move later.
 */
function evaluate(board: Board, color: GomokuColor): number {
  let mine = 0;
  let theirs = 0;
  let myFours = 0;
  let myOpenThrees = 0;
  let theirFours = 0;
  let theirOpenFours = 0;
  for (let point = 0; point < POINTS; point += 1) {
    const stone = board[point];
    if (stone === null || stone === undefined) continue;
    for (const direction of DIRECTIONS) {
      const shape = shapeAt(board, point, stone, direction);
      if (stone === color) {
        mine += LINE_VALUE[shape];
        if (shape >= Shape.Four) myFours += 1;
        else if (shape === Shape.OpenThree) myOpenThrees += 1;
      } else {
        theirs += LINE_VALUE[shape];
        if (shape === Shape.OpenFour) theirOpenFours += 1;
        else if (shape === Shape.Four) theirFours += 1;
      }
    }
  }
  if (myFours > 0) return WON;
  if (theirOpenFours > 0) return -WON;
  if (myOpenThrees > 0 && theirFours === 0) return WON / 2;
  return mine - theirs;
}

/**
 * The moves worth weighing for `color`: its five alone, else the blocks of
 * a five of the other player's, else its best by Medium's scoring.
 */
function movesWorthWeighing(
  board: Board,
  color: GomokuColor,
  width: number,
): number[] {
  const moves = ranked(board, color, DEFENCE);
  const five = moves.find((move) => makesFive(board, move.point, color));
  if (five) return [five.point];
  const other = otherColor(color);
  const blocks = moves.filter((move) => makesFive(board, move.point, other));
  if (blocks.length > 0) return blocks.map((move) => move.point);
  return moves.slice(0, width).map((move) => move.point);
}

/** How good the position is for `color`, to move, `depth` stones ahead. */
function negamax(
  board: Board,
  color: GomokuColor,
  depth: number,
  alpha: number,
  beta: number,
  budget: Budget,
): number {
  budget.spend();
  if (depth === 0) return evaluate(board, color);
  const moves = movesWorthWeighing(board, color, WIDTH_AHEAD);
  if (moves.length === 0) return 0;
  const other = otherColor(color);
  let best = -Infinity;
  for (const point of moves) {
    // A five is worth more the sooner it comes.
    if (makesFive(board, point, color)) return WON + depth;
    board[point] = color;
    const value = -negamax(board, other, depth - 1, -beta, -alpha, budget);
    board[point] = null;
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Hard: a forced win by fours of its own first; then a stop for one of
 * yours; then a search of its twelve best moves, your best answers to each
 * and its best to those, two and then four stones deep, as far as its
 * budget goes. Out of time altogether, it plays Medium's move.
 */
function hardMove(
  board: Board,
  color: GomokuColor,
  random: () => number,
  now: () => number,
): number {
  const deadline = now() + HARD_SEARCH_MS;
  const other = otherColor(color);
  const mine = triedWinByFours(board, color, FOURS_POSITIONS, deadline, now);
  if (mine) return mine[0]!;

  let moves = movesWorthWeighing(board, color, ROOT_WIDTH);
  const theirs = triedWinByFours(board, other, FOURS_POSITIONS, deadline, now);
  if (theirs) {
    // Stopping it: its first stones, or any good move that leaves it none,
    // else one that leaves it none that it can find in time, else its first.
    const stops = [...new Set([...theirs.slice(0, 2), ...moves])];
    const left = new Map(
      stops.map((point) => {
        board[point] = color;
        const still = triedWinByFours(
          board,
          other,
          STOP_POSITIONS,
          deadline,
          now,
        );
        board[point] = null;
        return [point, still] as const;
      }),
    );
    const safe = stops.filter((point) => left.get(point) === null);
    const unknown = stops.filter((point) => left.get(point) === undefined);
    moves = safe.length > 0 ? safe : unknown.length > 0 ? unknown : stops;
  }
  if (moves.length === 1) return moves[0]!;

  const budget = new Budget(SEARCH_POSITIONS, deadline, now);
  let chosen = mediumMove(board, color, random);
  try {
    for (let depth = 2; depth <= MAX_DEPTH; depth += 2) {
      let best = -Infinity;
      let ties: number[] = [];
      const values = new Map<number, number>();
      for (const point of moves) {
        board[point] = color;
        const value = -negamax(
          board,
          other,
          depth - 1,
          -Infinity,
          -best + 1,
          budget,
        );
        board[point] = null;
        values.set(point, value);
        if (value > best) {
          best = value;
          ties = [point];
        } else if (value === best) {
          ties.push(point);
        }
      }
      // Lost whatever it plays, it plays the stubbornest move it knows.
      chosen = best <= -WON / 2 ? ties[0]! : pick(ties, random);
      // The next depth weighs the best of this one first.
      moves = moves.toSorted(
        (a, b) => (values.get(b) ?? 0) - (values.get(a) ?? 0),
      );
    }
    return chosen;
  } catch (error) {
    if (error instanceof OutOfTime) return chosen;
    throw error;
  }
}

/**
 * The computer's move for `color` after `moves`, at `level`. At every level
 * it plays its own five and blocks a four of yours; Easy weighs only its own
 * lines and picks among its four best, Medium plays its best, and Hard
 * searches ahead.
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
      // Its own lines alone: of yours, it stops only the four above.
      return pick(ranked(board, color, 0).slice(0, 4), random).point;
    case 'medium':
      return mediumMove(board, color, random);
    case 'hard':
      return hardMove(board, color, random, now);
  }
}
