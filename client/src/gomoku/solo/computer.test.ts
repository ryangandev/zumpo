import { describe, expect, it } from 'vitest';
import { CENTRE, pointAt, pointName } from '../../../../shared/gomoku';
import type { GomokuColor, GomokuMove } from '../../../../shared/wire-types';
import {
  Budget,
  chooseMove,
  LEVELS,
  winByFours,
  type GomokuLevel,
} from './computer';
import { boardOf } from '../../../../shared/gomoku';
import { newGame, play, toMove } from './game';

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
/** A clock that stands still: the search runs out of work, never of time. */
const never = () => 0;

/** A random source from a seed, so a game plays the same on every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The level that wins a whole game, `black` against `white`, or null. */
function winnerOf(
  black: GomokuLevel,
  white: GomokuLevel,
  seed: number,
): GomokuLevel | null {
  const random = seeded(seed);
  let game = newGame({ level: 'medium', color: 'black' });
  while (!game.over) {
    const color = toMove(game);
    const level = color === 'black' ? black : white;
    game = play(game, chooseMove(game.moves, color, level, random, never));
  }
  if (game.winner === null) return null;
  return game.winner === 'black' ? black : white;
}

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
    const win = winByFours(board, 'black', 8, new Budget(Infinity, Infinity));
    expect(win).not.toBeNull();
    expect(chooseMove(moves, 'black', 'hard', first, never)).toBe(win?.[0]);
  });

  it('gives up a slow search at Hard for Medium’s move', () => {
    let clock = 0;
    // Each look at the clock is a second later.
    const slow = () => (clock += 1_000);
    const moves = movesOf('H8 J9 H9 J10');
    expect(chooseMove(moves, 'black', 'hard', first, slow)).toBe(
      chooseMove(moves, 'black', 'medium', first, never),
    );
  });
});

describe('the levels', () => {
  it('Medium beats Easy, with either colour', () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      expect(winnerOf('medium', 'easy', seed)).toBe('medium');
      expect(winnerOf('easy', 'medium', seed)).toBe('medium');
    }
  });

  // A whole game of Hard's searches: seconds, not milliseconds.
  it('Hard beats Medium, with either colour', { timeout: 120_000 }, () => {
    expect(winnerOf('hard', 'medium', 1)).toBe('hard');
    expect(winnerOf('medium', 'hard', 2)).toBe('hard');
  });
});
