import { describe, expect, it } from 'vitest';
import type { GomokuColor } from '../models/types.js';
import {
  boardOf,
  CENTRE,
  colorToMove,
  fivesThrough,
  isFull,
  lastStoneOf,
  pointAt,
  pointName,
  POINTS,
  rowOf,
  columnOf,
  STAR_POINTS,
  stonesOf,
  type Board,
} from '../../shared/gomoku.js';

/** An empty board with `color` stones on the named points. */
const boardWith = (
  stones: Partial<Record<GomokuColor, readonly string[]>>,
): Board => {
  const board = boardOf([]);
  for (const [color, names] of Object.entries(stones)) {
    for (const name of names) board[named(name)] = color as GomokuColor;
  }
  return board;
};

/** The point a name such as H8 stands for. */
const named = (name: string): number =>
  pointAt('ABCDEFGHIJKLMNO'.indexOf(name[0]!), Number(name.slice(1)));

const names = (lines: number[][]) => lines.map((line) => line.map(pointName));

describe('the points of a Gomoku board', () => {
  it('are read row by row from the top left, and named from the bottom left', () => {
    expect(pointName(0)).toBe('A15');
    expect(pointName(14)).toBe('O15');
    expect(pointName(POINTS - 15)).toBe('A1');
    expect(pointName(POINTS - 1)).toBe('O1');
    expect(pointName(CENTRE)).toBe('H8');
    expect(CENTRE).toBe(112);
    for (let point = 0; point < POINTS; point += 1) {
      expect(pointAt(columnOf(point), rowOf(point))).toBe(point);
    }
  });

  it('mark the centre and the points three in from each corner', () => {
    expect(STAR_POINTS.map(pointName).toSorted()).toEqual(
      ['D12', 'L12', 'H8', 'D4', 'L4'].toSorted(),
    );
  });
});

describe('a board made of moves', () => {
  it('places each stone, skips a turn lost to the clock, and knows whose move it is', () => {
    const moves = [
      { color: 'black', point: CENTRE },
      { color: 'white', point: null },
      { color: 'black', point: named('J9') },
    ] as const;
    const board = boardOf([...moves]);

    expect(board[CENTRE]).toBe('black');
    expect(board[named('J9')]).toBe('black');
    expect(board.filter((stone) => stone !== null)).toHaveLength(2);
    expect(stonesOf([...moves])).toBe(2);
    expect(lastStoneOf([...moves])).toBe(named('J9'));
    expect(lastStoneOf([{ color: 'black', point: null }])).toBeNull();
    expect(colorToMove([...moves])).toBe('white');
    expect(colorToMove([])).toBe('black');
  });
});

describe('five in a row', () => {
  it('is found along a row, at the bottom edge', () => {
    const board = boardWith({ black: ['A1', 'B1', 'C1', 'D1', 'E1'] });
    expect(names(fivesThrough(board, named('C1'), 'black'))).toEqual([
      ['A1', 'B1', 'C1', 'D1', 'E1'],
    ]);
  });

  it('is found down a column, at the right edge', () => {
    const board = boardWith({ white: ['O11', 'O12', 'O13', 'O14', 'O15'] });
    expect(names(fivesThrough(board, named('O15'), 'white'))).toEqual([
      ['O11', 'O12', 'O13', 'O14', 'O15'],
    ]);
  });

  it('is found along a rising diagonal, from the corner', () => {
    const board = boardWith({ black: ['A1', 'B2', 'C3', 'D4', 'E5'] });
    expect(names(fivesThrough(board, named('A1'), 'black'))).toEqual([
      ['A1', 'B2', 'C3', 'D4', 'E5'],
    ]);
  });

  it('is found along a falling diagonal, into the top right corner', () => {
    const board = boardWith({ white: ['K15', 'L14', 'M13', 'N12', 'O11'] });
    expect(names(fivesThrough(board, named('M13'), 'white'))).toEqual([
      ['K15', 'L14', 'M13', 'N12', 'O11'],
    ]);
  });

  it('counts an overline of six or more', () => {
    const board = boardWith({
      black: ['C8', 'D8', 'E8', 'F8', 'G8', 'H8'],
    });
    expect(names(fivesThrough(board, named('E8'), 'black'))).toEqual([
      ['C8', 'D8', 'E8', 'F8', 'G8', 'H8'],
    ]);
  });

  it('finds both lines when one stone finishes two', () => {
    const board = boardWith({
      black: ['D8', 'E8', 'F8', 'G8', 'H8', 'H4', 'H5', 'H6', 'H7'],
    });
    expect(names(fivesThrough(board, named('H8'), 'black'))).toEqual([
      ['D8', 'E8', 'F8', 'G8', 'H8'],
      ['H4', 'H5', 'H6', 'H7', 'H8'],
    ]);
  });

  it('is not four, a broken line, the other colour, or a line that wraps round the edge', () => {
    const four = boardWith({ black: ['D8', 'E8', 'F8', 'G8'] });
    expect(fivesThrough(four, named('G8'), 'black')).toEqual([]);

    const broken = boardWith({ black: ['D8', 'E8', 'G8', 'H8', 'J8'] });
    expect(fivesThrough(broken, named('E8'), 'black')).toEqual([]);

    const blocked = boardWith({
      black: ['D8', 'E8', 'G8', 'H8'],
      white: ['F8'],
    });
    expect(fivesThrough(blocked, named('E8'), 'black')).toEqual([]);

    // N1 O1 and then A2 B2 C2 are consecutive points, not a line.
    const wrapped = boardWith({ black: ['N1', 'O1', 'A2', 'B2', 'C2'] });
    expect(fivesThrough(wrapped, named('O1'), 'black')).toEqual([]);
    expect(fivesThrough(wrapped, named('A2'), 'black')).toEqual([]);
  });

  it('judges a stone before it is placed, as the point it would go on', () => {
    const board = boardWith({ black: ['D8', 'E8', 'G8', 'H8'] });
    expect(names(fivesThrough(board, named('F8'), 'black'))).toEqual([
      ['D8', 'E8', 'F8', 'G8', 'H8'],
    ]);
  });
});

describe('a full board', () => {
  it('is full only when every point holds a stone', () => {
    const board: Board = Array.from({ length: POINTS }, () => 'black');
    expect(isFull(board)).toBe(true);
    board[CENTRE] = null;
    expect(isFull(board)).toBe(false);
  });
});
