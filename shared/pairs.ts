import type { PairsBoard } from './wire-types.js';
import { swap } from './list.js';

/**
 * Pairs rules that a room on the server and a game on your own in the
 * browser both need, so the two always deal and read a deck alike. The rules
 * are in docs/games/pairs.md.
 *
 * A deck is a flat row-major array of symbols, each twice: `index = row *
 * side + column`. A symbol is an index into the 18 Zumpo/Pairs symbol
 * variants, in their Figma order.
 */

/** Nine shapes in two colours each. */
export const SYMBOL_COUNT = 18;

export interface PairsBoardSize {
  /** Cards along each side of the square board. */
  side: number;
  pairs: number;
}

export const PAIRS_BOARDS: Readonly<Record<PairsBoard, PairsBoardSize>> = {
  Small: { side: 4, pairs: 8 },
  Large: { side: 6, pairs: 18 },
};

export const BOARDS = Object.keys(PAIRS_BOARDS) as readonly PairsBoard[];

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    swap(shuffled, i, j);
  }
  return shuffled;
}

/**
 * A shuffled deck for `board`: a Large board has every symbol, a Small one
 * draws its eight. The same source deals the same deck, so a challenge link
 * is a seed and a board.
 */
export function dealDeck(board: PairsBoard, random: () => number): number[] {
  const all = Array.from({ length: SYMBOL_COUNT }, (_, symbol) => symbol);
  const symbols = shuffle(all, random).slice(0, PAIRS_BOARDS[board].pairs);
  return shuffle([...symbols, ...symbols], random);
}

/** The longest run of `true`: the most pairs found in a row. */
export function longestStreak(turns: readonly boolean[]): number {
  let longest = 0;
  let current = 0;
  for (const matched of turns) {
    current = matched ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}
