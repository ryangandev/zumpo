import { describe, expect, it } from 'vitest';
import { CENTRE, pointAt, pointName } from '../../../../shared/gomoku';
import type { GomokuColor, GomokuMove } from '../../../../shared/wire-types';
import { chooseMove, LEVELS, winByFours } from './computer';
import { boardOf } from '../../../../shared/gomoku';

/** Moves from point names, Black first: "H8 J9 H9…". */
function movesOf(names: string): GomokuMove[] {
  return names
    .split(' ')
    .filter(Boolean)
    .map((name, index) => ({
      color: (index % 2 === 0 ? 'black' : 'white') as GomokuColor,
      point: pointAt(name.charCodeAt(0) - 65, Number(name.slice(1))),
    }));
}

const named = (point: number) => pointName(point);
/** A random source that always picks the first of its choices. */
const first = () => 0;
/** Far in the future: the search never runs out of time. */
const never = () => 0;

describe('the computer', () => {
  it('opens on the centre at every level', () => {
    for (const level of LEVELS) {
      expect(chooseMove([], 'black', level, first, never)).toBe(CENTRE);
    }
  });

  it('plays a stone next to the only one on the board', () => {
    const point = chooseMove(movesOf('H8'), 'white', 'medium', first, never);
    expect(Math.abs((point % 15) - 7)).toBeLessThanOrEqual(2);
    expect(Math.abs(Math.floor(point / 15) - 7)).toBeLessThanOrEqual(2);
  });

  it('makes its own five at every level, before blocking yours', () => {
    // White has four from A1 to D1; Black has four from D8 to G8.
    const moves = movesOf('D8 A1 E8 B1 F8 C1 G8 D1 A15');
    for (const level of LEVELS) {
      expect(named(chooseMove(moves, 'white', level, first, never))).toBe('E1');
    }
  });

  it('blocks a four of yours at every level', () => {
    // Black has four from D8 to G8, closed at C8; White has nothing.
    const moves = movesOf('D8 C8 E8 A1 F8 A3 G8');
    for (const level of LEVELS) {
      expect(named(chooseMove(moves, 'white', level, first, never))).toBe('H8');
    }
  });

  it('blocks an open three at Medium and Hard', () => {
    // Black has E8 F8 G8, open at both ends.
    const moves = movesOf('E8 A1 F8 A3 G8');
    for (const level of ['medium', 'hard'] as const) {
      expect(['D8', 'H8', 'C8', 'I8']).toContain(
        named(chooseMove(moves, 'white', level, first, never)),
      );
    }
  });

  it('makes an open four of its own over blocking a three', () => {
    // White has an open three on row 3; Black has an open three on row 8.
    const moves = movesOf('E8 E3 F8 F3 G8 G3 A15');
    expect(['D3', 'H3']).toContain(
      named(chooseMove(moves, 'white', 'medium', first, never)),
    );
  });

  it('finds a forced win by fours, and plays it at Hard', () => {
    // Black's fours on row 8 and column H meet: H8 makes a four each way
    // from scattered stones, which nothing can answer twice.
    const moves = movesOf('E8 A1 F8 A3 G8 C1 H11 A5 H10 C3 H9 O15');
    const board = boardOf(moves);
    const win = winByFours(board, 'black', 8, Number.POSITIVE_INFINITY);
    expect(win).not.toBeNull();
    expect(chooseMove(moves, 'black', 'hard', first, never)).toBe(win?.[0]);
  });

  it('gives up a slow search at Hard for Medium’s move', () => {
    let clock = 0;
    // Each look at the clock is a second later.
    const slow = () => (clock += 1_000);
    const moves = movesOf('H8 J9 H9 J10');
    const point = chooseMove(moves, 'black', 'hard', first, slow);
    expect(boardOf(moves)[point]).toBeNull();
  });
});
