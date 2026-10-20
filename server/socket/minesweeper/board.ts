import type {
  MinesweeperCellView,
  MinesweeperDifficulty,
} from '../../models/types.js';
import { getRandomInt } from '../../libs/utils.js';
import {
  BOARD_SIZES,
  HIDDEN,
  KNOWN_MINE,
  neighboursOf,
} from '../../../shared/minesweeper.js';
import { itemAt } from '../../../shared/list.js';

/**
 * The minefield: the hidden layout, and the public view of it.
 *
 * Two conventions worth stating once, because everything else here assumes
 * them:
 *
 * - **Cells are a flat row-major array.** `index = y * width + x`. A board is
 *   at most 480 cells and goes over the wire every round, so it travels as one
 *   array of small numbers rather than 480 objects.
 * - **The public view is the only thing a client ever sees.** `-1` hidden,
 *   `0`–`8` revealed with that many mines adjacent, `9` a mine somebody hit.
 *   The mine layout never leaves the process, which matters more here than in
 *   Draw & Guess: a leaked word spoils a turn, a leaked minefield spoils the
 *   entire game and cannot be re-rolled.
 */

interface Board {
  width: number;
  height: number;
  totalMines: number;
  /** Server-private. True where a mine is. */
  mines: boolean[];
  /** Server-private. Mines adjacent to each cell, precomputed once. */
  adjacent: number[];
  revealed: boolean[];
  /** A mine somebody hit. Public, and a constraint the solver uses. */
  hitMines: boolean[];
}

/**
 * A fresh board with its mines already placed.
 *
 * **There is no first-click safety**, which inverts the single-player
 * convention on purpose. That guarantee exists so an opening click cannot end
 * the game - and here a mine does not end anything, so the reason for it is
 * gone. Keeping it would also make the first player's score a lie: risk is
 * scored from public information, which says the opening cell is as dangerous
 * as the board's density, and it would not have been.
 *
 * Nor is the board checked for solvability. Modern single-player generators
 * guarantee a board can be cleared without guessing; here guessing is the
 * scoring mechanism, so a board that forces one is working as intended.
 */
const createBoard = (difficulty: MinesweeperDifficulty): Board => {
  const { width, height, mines: totalMines } = BOARD_SIZES[difficulty];
  const size = width * height;

  const mines = Array.from({ length: size }, () => false);
  let placed = 0;
  while (placed < totalMines) {
    const at = getRandomInt(0, size);
    if (mines[at]) continue;
    mines[at] = true;
    placed++;
  }

  const adjacent = Array.from({ length: size }, () => 0);
  for (let index = 0; index < size; index++) {
    if (mines[index]) continue;
    adjacent[index] = neighboursOf({ width, height }, index).filter(
      (neighbour) => mines[neighbour],
    ).length;
  }

  return {
    width,
    height,
    totalMines,
    mines,
    adjacent,
    revealed: Array.from({ length: size }, () => false),
    hitMines: Array.from({ length: size }, () => false),
  };
};

/** What every client is allowed to see. Never the layout. */
const publicView = (board: Board): MinesweeperCellView[] => {
  const size = board.width * board.height;
  const view = Array.from({ length: size }, () => HIDDEN);

  for (let index = 0; index < size; index++) {
    if (board.hitMines[index]) view[index] = KNOWN_MINE;
    else if (board.revealed[index]) view[index] = itemAt(board.adjacent, index);
    else view[index] = HIDDEN;
  }

  return view;
};

/** A cell nobody has resolved yet - still worth picking. */
const isHidden = (board: Board, index: number): boolean =>
  !board.revealed[index] && !board.hitMines[index];

const hiddenIndexes = (board: Board): number[] => {
  const out: number[] = [];
  for (let index = 0; index < board.width * board.height; index++) {
    if (isHidden(board, index)) out.push(index);
  }
  return out;
};

/**
 * Uncovers a safe cell, cascading through the zeroes as single-player
 * Minesweeper does.
 *
 * The cascade is free: only the cell that was actually picked is scored, and
 * everything it opens up is a gift to the whole room. Rewarding cascade size
 * would make the early game a hunt for the big opening, which is mostly luck.
 *
 * Returns every index this uncovered, the picked one first.
 */
const revealFrom = (board: Board, index: number): number[] => {
  if (!isHidden(board, index)) return [];

  const opened: number[] = [];
  const queue = [index];

  while (queue.length > 0) {
    const at = queue.pop()!;
    if (board.revealed[at] || board.hitMines[at]) continue;
    // A cascade must never walk onto a mine, and cannot: it only expands from
    // cells with no adjacent mines.
    if (board.mines[at]) continue;

    board.revealed[at] = true;
    opened.push(at);

    if (board.adjacent[at] !== 0) continue;
    for (const neighbour of neighboursOf(board, at)) {
      if (isHidden(board, neighbour)) queue.push(neighbour);
    }
  }

  return opened;
};

/** Records a mine somebody hit. It becomes common knowledge. */
const markHitMine = (board: Board, index: number): void => {
  board.hitMines[index] = true;
};

const minesFound = (board: Board): number =>
  board.hitMines.reduce((count, hit) => (hit ? count + 1 : count), 0);

/**
 * The board is resolved when nothing is left to pick: every safe cell has been
 * uncovered, or every mine has been hit, or some of each. Either way the game
 * is over, and it always arrives - every round resolves at least one cell.
 */
const isResolved = (board: Board): boolean => hiddenIndexes(board).length === 0;

export {
  createBoard,
  neighboursOf,
  publicView,
  isHidden,
  hiddenIndexes,
  revealFrom,
  markHitMine,
  minesFound,
  isResolved,
};
export type { Board };
