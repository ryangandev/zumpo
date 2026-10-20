import { describe, expect, it } from 'vitest';
import { pointsForPick } from '../socket/minesweeper/scoring.js';
import {
  createBoard,
  hiddenIndexes,
  isResolved,
  markHitMine,
  publicView,
  revealFrom,
} from '../socket/minesweeper/board.js';
import { BOARD_SIZES, neighboursOf } from '../../shared/minesweeper.js';

const safe = (
  risk: number,
  extra: Partial<Parameters<typeof pointsForPick>[0]> = {},
) =>
  pointsForPick({
    risk,
    hitMine: false,
    sharedWith: 1,
    autoPlayed: false,
    ...extra,
  });

const mine = (
  risk: number,
  extra: Partial<Parameters<typeof pointsForPick>[0]> = {},
) =>
  pointsForPick({
    risk,
    hitMine: true,
    sharedWith: 1,
    autoPlayed: false,
    ...extra,
  });

describe('what a safe pick pays', () => {
  it('pays something for a cell you could prove was safe', () => {
    // Otherwise nobody would ever clear the free cells, and the board would be
    // solved entirely by guessing.
    expect(safe(0)).toBe(10);
  });

  it('pays more the more the cell might have killed you', () => {
    expect(safe(0.25)).toBe(33);
    expect(safe(0.5)).toBe(55);
    expect(safe(1)).toBe(100);
  });
});

describe('what a mine costs', () => {
  /*
   * The inversion is the point: the penalty grows as the risk falls, so you are
   * punished for misreading the board rather than for being unlucky.
   */
  it('costs most when you should have known better', () => {
    expect(mine(0)).toBe(-120);
    expect(mine(0.05)).toBe(-115);
  });

  it('costs least on a forced coin-flip', () => {
    expect(mine(0.5)).toBe(-70);
    expect(mine(1)).toBe(-20);
  });

  it('costs more for a careless death than a bold one', () => {
    expect(mine(0.05)).toBeLessThan(mine(0.5));
    expect(mine(0.5)).toBeLessThan(mine(0.9));
  });
});

/*
 * Safe play should be optimal and gambling should be what you do when you are
 * behind: the leader consolidates, the trailer has to swing. That is the whole
 * comeback structure, and it lives entirely in these two curves.
 */
const expectedValue = (risk: number) =>
  (1 - risk) * safe(risk) + risk * mine(risk);

describe('the expected value of a pick', () => {
  it('falls as the risk rises', () => {
    const values = [0, 0.1, 0.25, 0.5, 0.75, 0.9].map(expectedValue);

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]!);
    }
  });

  it('is positive only for cells you have good reason to trust', () => {
    expect(expectedValue(0)).toBeGreaterThan(0);
    expect(expectedValue(0.5)).toBeLessThan(0);
  });
});

describe('two players picking the same cell', () => {
  it('splits the reward between them', () => {
    expect(safe(0.5, { sharedWith: 2 })).toBe(Math.round(55 / 2));
    expect(safe(0.5, { sharedWith: 3 })).toBe(Math.round(55 / 3));
  });

  /*
   * ...but not the penalty. Splitting that too would let a crowd pile onto a
   * coin-flip and each pay a third of the price, which is exactly backwards:
   * the reward is for claiming a cell, the penalty is for the decision.
   */
  it('makes each of them pay the full penalty', () => {
    expect(mine(0.5, { sharedWith: 3 })).toBe(mine(0.5));
  });

  it('leaves crowding a risky cell worse than crowding a safe one', () => {
    const contestedSafe = (1 - 0.05) * safe(0.05, { sharedWith: 2 });
    const contestedRisky =
      0.6 * mine(0.6, { sharedWith: 2 }) + 0.4 * safe(0.6, { sharedWith: 2 });

    expect(contestedSafe).toBeGreaterThan(contestedRisky);
  });
});

describe('a pick the server had to make for you', () => {
  it('forfeits the base, so being present is worth something', () => {
    expect(safe(0, { autoPlayed: true })).toBe(0);
    expect(safe(0.5, { autoPlayed: true })).toBe(45);
    expect(safe(0.5, { autoPlayed: true })).toBeLessThan(safe(0.5));
  });

  it('still costs the same if the safest cell was a mine anyway', () => {
    expect(mine(0.4, { autoPlayed: true })).toBe(mine(0.4));
  });
});

describe('the board itself', () => {
  it('places exactly the mines each difficulty asks for', () => {
    for (const [name, spec] of Object.entries(BOARD_SIZES)) {
      const board = createBoard(name as keyof typeof BOARD_SIZES);

      expect(board.width).toBe(spec.width);
      expect(board.height).toBe(spec.height);
      expect(board.mines.filter(Boolean)).toHaveLength(spec.mines);
    }
  });

  it('counts every cell’s neighbours the way the numbers claim', () => {
    const board = createBoard('Small');

    for (let index = 0; index < board.width * board.height; index++) {
      if (board.mines[index]) continue;
      const actual = neighboursOf(board, index).filter(
        (at) => board.mines[at],
      ).length;
      expect(board.adjacent[index]).toBe(actual);
    }
  });

  it('cascades through the zeroes and never onto a mine', () => {
    const board = createBoard('Medium');
    const zero = board.adjacent.findIndex(
      (count, index) => count === 0 && !board.mines[index],
    );

    const opened = revealFrom(board, zero);

    expect(opened.length).toBeGreaterThan(1);
    expect(opened[0]).toBe(zero);
    for (const index of opened) expect(board.mines[index]).toBe(false);
  });

  it('never puts the hidden layout in the public view', () => {
    const board = createBoard('Small');
    const view = publicView(board);

    // Everything is hidden until something is revealed, whatever is underneath.
    expect(view.every((cell) => cell === -1)).toBe(true);
    expect(view).toHaveLength(board.width * board.height);
  });

  it('shows a hit mine to everyone, and a revealed cell’s count', () => {
    const board = createBoard('Small');
    const mineAt = board.mines.findIndex(Boolean);
    const safeAt = board.mines.findIndex((isMine) => !isMine);

    markHitMine(board, mineAt);
    revealFrom(board, safeAt);

    const view = publicView(board);
    expect(view[mineAt]).toBe(9);
    expect(view[safeAt]).toBe(board.adjacent[safeAt]);
  });

  /*
   * The game has to end. Every round resolves at least one cell, and a board is
   * over when nothing is left to pick - so termination is a property of the
   * board rather than a rule anybody has to enforce.
   */
  it('is resolved once nothing is left to pick', () => {
    const board = createBoard('Small');
    expect(isResolved(board)).toBe(false);

    for (const index of hiddenIndexes(board)) {
      if (board.mines[index]) markHitMine(board, index);
      else revealFrom(board, index);
    }

    expect(isResolved(board)).toBe(true);
    expect(hiddenIndexes(board)).toEqual([]);
  });
});
