import {
  CODE_LENGTH,
  checkGuess,
  markGuess,
  MAX_GUESSES,
} from '../../../../shared/code-breaker';
import type { CodeBoardRow } from '../../ui';
import { deleteDigit, EMPTY_DRAFT, typeDigit, type Draft } from '../draft';

/**
 * A code on your own, the daily one or a practice one, in the browser. Every
 * function returns a new game and leaves the one it was given alone, so React
 * state can hold it as is. The rules are in docs/games/code-breaker.md.
 */
export interface SoloGame {
  code: string;
  /** Guesses made, first first. */
  guesses: readonly string[];
  /** The row being typed. */
  draft: Draft;
}

export const newGame = (
  code: string,
  guesses: readonly string[] = [],
): SoloGame => ({ code, guesses, draft: EMPTY_DRAFT });

export const rowsOf = (game: SoloGame): CodeBoardRow[] =>
  game.guesses.map((guess) => ({ guess, mark: markGuess(guess, game.code) }));

export const isWon = (game: SoloGame): boolean =>
  game.guesses.at(-1) === game.code;

export const isOver = (game: SoloGame): boolean =>
  isWon(game) || game.guesses.length >= MAX_GUESSES;

export function typeKey(game: SoloGame, digit: string): SoloGame {
  if (isOver(game)) return game;
  return { ...game, draft: typeDigit(game.draft, digit) };
}

export function deleteKey(game: SoloGame): SoloGame {
  if (isOver(game)) return game;
  return { ...game, draft: deleteDigit(game.draft) };
}

/**
 * Enter: the typed row becomes a guess, or is turned back with the reason and
 * stays as typed, costing nothing.
 */
export function submit(game: SoloGame): SoloGame {
  if (isOver(game)) return game;
  const problem = checkGuess(game.draft.typed, game.guesses);
  if (problem) return { ...game, draft: { ...game.draft, problem } };
  return {
    ...game,
    guesses: [...game.guesses, game.draft.typed],
    draft: EMPTY_DRAFT,
  };
}

/** How many guesses a finished game took; null when it was missed. */
export const guessesToCrack = (game: SoloGame): number | null =>
  isWon(game) ? game.guesses.length : null;

const DIGITS = [...'0123456789'];

/**
 * The digits the marks settle on their face, for the turn bar: a guess with
 * no pegs rules its four digits out, and one whose pegs are all coloured
 * holds the code's four, which rules the other six out. It reads the rows
 * only as far as a glance does, so the deducing stays the player's.
 */
export function settledDigits(rows: readonly CodeBoardRow[]): {
  in: string[];
  out: string[];
} {
  const inCode = new Set<string>();
  const out = new Set<string>();
  for (const { guess, mark } of rows) {
    const found = mark.right + mark.moved;
    if (found === 0) for (const digit of guess) out.add(digit);
    if (found === CODE_LENGTH) for (const digit of guess) inCode.add(digit);
  }
  if (inCode.size === CODE_LENGTH) {
    for (const digit of DIGITS) if (!inCode.has(digit)) out.add(digit);
  }
  if (out.size === DIGITS.length - CODE_LENGTH) {
    for (const digit of DIGITS) if (!out.has(digit)) inCode.add(digit);
  }
  return {
    in: DIGITS.filter((digit) => inCode.has(digit)),
    out: DIGITS.filter((digit) => out.has(digit)),
  };
}
