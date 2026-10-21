import type { Page } from '@playwright/test';
import { expect, labelsIn } from '../fixtures';

/**
 * Playing Minesweeper on your own as a player does: by what the cells'
 * labels say, deducing what it can and guessing carefully when it cannot.
 */

/** A cell as its label reads: still hidden, flagged, or opened. */
type Seen = 'hidden' | 'flag' | number;

interface Board {
  width: number;
  height: number;
  mines: number;
  cells: Seen[];
}

const MINES: Record<string, number> = { '9x9': 10, '16x16': 40, '30x16': 99 };

const LABEL = /^Row (\d+), column (\d+): (.+)$/;

/** Every cell on the board, as its label reads. */
async function boardOf(page: Page): Promise<Board> {
  const grid = page.getByRole('grid', { name: /^Board, / });
  const [, width = 0, height = 0] = /(\d+) by (\d+)/
    .exec((await grid.getAttribute('aria-label'))!)!
    .map(Number);
  const labels = await labelsIn(grid, '[aria-label^="Row "]');
  const cells: Seen[] = Array.from({ length: width * height }, () => 0);
  for (const label of labels) {
    const [, row, column, text] = LABEL.exec(label)!;
    cells[(Number(row) - 1) * width + Number(column) - 1] =
      text === 'hidden'
        ? 'hidden'
        : text === 'flagged'
          ? 'flag'
          : text === 'empty'
            ? 0
            : parseInt(text!, 10);
  }
  return { width, height, mines: MINES[`${width}x${height}`]!, cells };
}

function neighbours({ width, height }: Board, index: number): number[] {
  const row = Math.floor(index / width);
  const column = index % width;
  const found: number[] = [];
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = column - 1; c <= column + 1; c++) {
      if ((r !== row || c !== column) && r >= 0 && r < height) {
        if (c >= 0 && c < width) found.push(r * width + c);
      }
    }
  }
  return found;
}

/** What one opened number says: `mines` of these hidden cells are mines. */
interface Constraint {
  cells: number[];
  mines: number;
}

function constraintsOf(board: Board): Constraint[] {
  const found: Constraint[] = [];
  board.cells.forEach((seen, index) => {
    if (typeof seen !== 'number' || seen === 0) return;
    const around = neighbours(board, index);
    const cells = around.filter((n) => board.cells[n] === 'hidden');
    const flags = around.filter((n) => board.cells[n] === 'flag').length;
    if (cells.length) found.push({ cells, mines: seen - flags });
  });
  return found;
}

/**
 * The cells the numbers prove safe or mined: each number on its own, then
 * each pair of numbers where one's hidden cells hold the other's.
 */
function deduce(board: Board): { safe: Set<number>; mines: Set<number> } {
  const safe = new Set<number>();
  const mines = new Set<number>();
  const constraints = constraintsOf(board);
  const settle = (cells: number[], count: number) => {
    if (count === 0) cells.forEach((cell) => safe.add(cell));
    else if (count === cells.length) cells.forEach((cell) => mines.add(cell));
  };
  for (const { cells, mines: count } of constraints) settle(cells, count);
  for (const a of constraints) {
    for (const b of constraints) {
      if (a === b || a.cells.length >= b.cells.length) continue;
      if (!a.cells.every((cell) => b.cells.includes(cell))) continue;
      settle(
        b.cells.filter((cell) => !a.cells.includes(cell)),
        b.mines - a.mines,
      );
    }
  }
  return { safe, mines };
}

/** How likely each hidden cell is to be a mine, by a rough count. */
function risks(board: Board): Map<number, number> {
  const risk = new Map<number, number>();
  for (const { cells, mines } of constraintsOf(board)) {
    for (const cell of cells) {
      risk.set(cell, Math.max(risk.get(cell) ?? 0, mines / cells.length));
    }
  }
  const hidden = board.cells.flatMap((seen, index) =>
    seen === 'hidden' ? [index] : [],
  );
  const flags = board.cells.filter((seen) => seen === 'flag').length;
  const density = (board.mines - flags) / Math.max(hidden.length, 1);
  for (const cell of hidden) if (!risk.has(cell)) risk.set(cell, density);
  return risk;
}

/** The hidden cell `better` picks over every other. */
function pick(board: Board, better: (a: number, b: number) => boolean) {
  const risk = risks(board);
  return [...risk.keys()].reduce((best, cell) =>
    better(risk.get(cell)!, risk.get(best)!) ? cell : best,
  );
}

function hiddenAt(page: Page, board: Board, index: number) {
  const row = Math.floor(index / board.width) + 1;
  const column = (index % board.width) + 1;
  return page.getByRole('gridcell', {
    name: `Row ${row}, column ${column}: hidden`,
    exact: true,
  });
}

/** Opens a cell, unless the last one opened it already. */
async function open(page: Page, board: Board, index: number) {
  const button = hiddenAt(page, board, index);
  if (await button.count()) await button.click();
}

/** Opens the middle of the board: a first click is always safe. */
export async function openMiddle(page: Page) {
  const board = await boardOf(page);
  await open(
    page,
    board,
    Math.floor(board.height / 2) * board.width + Math.floor(board.width / 2),
  );
}

/**
 * Flags every mine and opens every safe cell the numbers prove, again and
 * again, until they prove nothing more or `passes` have been played. Says
 * whether it did anything.
 */
export async function playSure(
  page: Page,
  passes = Infinity,
): Promise<boolean> {
  let played = false;
  for (let pass = 0; pass < passes; pass++) {
    const board = await boardOf(page);
    const { safe, mines } = deduce(board);
    if (!safe.size && !mines.size) return played;
    for (const mine of mines) {
      await hiddenAt(page, board, mine).click({ button: 'right' });
    }
    for (const cell of safe) await open(page, board, cell);
    played = true;
  }
  return played;
}

/** The mines the numbers prove, by place. */
export async function provenMines(page: Page): Promise<number[]> {
  return [...deduce(await boardOf(page)).mines];
}

/** A hidden cell, by its place. */
export async function hiddenCell(page: Page, index: number) {
  return hiddenAt(page, await boardOf(page), index);
}

/** Opens the hidden cell least likely to hold a mine. */
async function guess(page: Page) {
  const board = await boardOf(page);
  await open(
    page,
    board,
    pick(board, (a, b) => a < b),
  );
}

/** Opens the riskiest hidden cells until one is a mine. */
export async function hitAMine(page: Page) {
  const lost = page.getByText('You hit a mine');
  while (!(await lost.isVisible())) {
    const board = await boardOf(page);
    await open(
      page,
      board,
      pick(board, (a, b) => a > b),
    );
  }
}

/**
 * Plays boards until one is cleared: everything the numbers prove, then the
 * safest guess, and a new board after a mine.
 */
export async function clearABoard(page: Page) {
  const cleared = page.getByRole('heading', { name: /^Cleared in / });
  const lost = page.getByText('You hit a mine');
  for (let tries = 0; tries < 30; tries++) {
    await openMiddle(page);
    while (!(await cleared.isVisible()) && !(await lost.isVisible())) {
      if (!(await playSure(page))) await guess(page);
    }
    if (await cleared.isVisible()) return;
    await page.getByRole('button', { name: 'Try again' }).first().click();
  }
  await expect(cleared, 'a board cleared in thirty tries').toBeVisible();
}
