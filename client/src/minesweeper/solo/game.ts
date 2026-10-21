import { itemAt, swap } from '../../../../shared/list';
import type { MinesweeperDifficulty } from '../../../../shared/wire-types';
import { BOARD_SIZES, neighboursOf } from '../../../../shared/minesweeper';

/**
 * Minesweeper on your own: classic rules, in the browser. Every function
 * returns a new game and leaves the one it was given alone, so React state
 * can hold it as is. The rules are in docs/games/minesweeper.md.
 */

export type SoloStatus = 'ready' | 'playing' | 'lost' | 'won';

export interface SoloGame {
  difficulty: MinesweeperDifficulty;
  width: number;
  height: number;
  mines: number;
  /** Where the mines are; empty until the first click lays them. */
  layout: readonly boolean[];
  /** Mines around each cell; empty until the first click. */
  adjacent: readonly number[];
  open: readonly boolean[];
  flags: readonly boolean[];
  status: SoloStatus;
  /** The mine that ended a lost game. */
  hit: number | null;
  /** Milliseconds since the epoch: the first click, and the end. */
  startedAt: number | null;
  endedAt: number | null;
}

/** What a player sees of a cell. */
export type SoloCell =
  | 'hidden'
  | 'flag'
  /** A flag with no mine under it, shown once the game is lost. */
  | 'wrong-flag'
  | 'mine'
  | 'hit'
  | number;

export function newGame(difficulty: MinesweeperDifficulty): SoloGame {
  const { width, height, mines } = BOARD_SIZES[difficulty];
  const size = width * height;
  return {
    difficulty,
    width,
    height,
    mines,
    layout: [],
    adjacent: [],
    open: Array.from({ length: size }, () => false),
    flags: Array.from({ length: size }, () => false),
    status: 'ready',
    hit: null,
    startedAt: null,
    endedAt: null,
  };
}

const over = (game: SoloGame) =>
  game.status === 'lost' || game.status === 'won';

/**
 * Lays the mines anywhere but the first click and its neighbours, so the first
 * click always opens an area. `random` returns [0, 1), as Math.random does.
 */
function layMines(
  game: SoloGame,
  first: number,
  random: () => number,
): Pick<SoloGame, 'layout' | 'adjacent'> {
  const size = game.width * game.height;
  const keepClear = new Set([first, ...neighboursOf(game, first)]);
  const candidates: number[] = [];
  for (let index = 0; index < size; index++) {
    if (!keepClear.has(index)) candidates.push(index);
  }
  // A partial Fisher-Yates: the first `mines` candidates are a uniform draw.
  for (let i = 0; i < game.mines; i++) {
    const j = i + Math.floor(random() * (candidates.length - i));
    swap(candidates, i, j);
  }
  const layout = Array.from({ length: size }, () => false);
  for (const index of candidates.slice(0, game.mines)) layout[index] = true;
  const adjacent = layout.map(
    (_, index) =>
      neighboursOf(game, index).filter((neighbour) => layout[neighbour]).length,
  );
  return { layout, adjacent };
}

/** Opens cells from `start`, through every cell with no mines around it. */
function flood(game: SoloGame, open: boolean[], start: number): void {
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.pop()!;
    if (open[at] || game.flags[at] || game.layout[at]) continue;
    open[at] = true;
    if (game.adjacent[at] !== 0) continue;
    queue.push(...neighboursOf(game, at));
  }
}

/** Opens `cells` at once: a click opens one, a chord several. */
function openCells(
  game: SoloGame,
  cells: readonly number[],
  now: number,
): SoloGame {
  const hit = cells.find((index) => game.layout[index]);
  if (hit !== undefined) {
    return { ...game, status: 'lost', hit, endedAt: now };
  }
  const open = [...game.open];
  for (const index of cells) flood(game, open, index);
  const safeLeft = open.some((isOpen, index) => !isOpen && !game.layout[index]);
  if (safeLeft) return { ...game, open };
  return {
    ...game,
    open,
    // Every mine is flagged for you on a win.
    flags: [...game.layout],
    status: 'won',
    endedAt: now,
  };
}

/** A click on a hidden cell. The first one lays the mines and starts the clock. */
export function reveal(
  game: SoloGame,
  index: number,
  now: number,
  random: () => number = Math.random,
): SoloGame {
  if (over(game) || game.open[index] || game.flags[index]) return game;
  const started =
    game.status === 'ready'
      ? {
          ...game,
          ...layMines(game, index, random),
          status: 'playing' as const,
          startedAt: now,
        }
      : game;
  return openCells(started, [index], now);
}

/** Plants a flag on a hidden cell, or takes one off. */
export function toggleFlag(game: SoloGame, index: number): SoloGame {
  if (over(game) || game.open[index]) return game;
  const flags = [...game.flags];
  flags[index] = !flags[index];
  return { ...game, flags };
}

/**
 * A click on an opened number whose flags add up to it opens the rest of its
 * neighbours. Anything else does nothing.
 */
export function chord(game: SoloGame, index: number, now: number): SoloGame {
  if (game.status !== 'playing' || !game.open[index]) return game;
  const neighbours = neighboursOf(game, index);
  const flagged = neighbours.filter((neighbour) => game.flags[neighbour]);
  if (game.adjacent[index] === 0 || flagged.length !== game.adjacent[index]) {
    return game;
  }
  const rest = neighbours.filter(
    (neighbour) => !game.open[neighbour] && !game.flags[neighbour],
  );
  return rest.length === 0 ? game : openCells(game, rest, now);
}

export function cellAt(game: SoloGame, index: number): SoloCell {
  if (game.open[index]) return itemAt(game.adjacent, index);
  if (game.status === 'lost') {
    if (index === game.hit) return 'hit';
    if (game.flags[index]) return game.layout[index] ? 'flag' : 'wrong-flag';
    if (game.layout[index]) return 'mine';
  }
  return game.flags[index] ? 'flag' : 'hidden';
}

/** Mines minus flags: what the turn bar counts down. Can go below zero. */
export function minesLeft(game: SoloGame): number {
  return game.mines - game.flags.filter(Boolean).length;
}

/** The cells without a mine: what clearing the board means. */
export const safeCells = (game: SoloGame): number =>
  game.width * game.height - game.mines;

/** The safe cells opened so far; a mine is never opened, even the one hit. */
export const clearedCells = (game: SoloGame): number =>
  game.open.filter(Boolean).length;

/** Milliseconds on the clock at `now`. */
export function elapsed(game: SoloGame, now: number): number {
  if (game.startedAt === null) return 0;
  return (game.endedAt ?? now) - game.startedAt;
}
