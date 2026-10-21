import type { ElementHandle, Page } from '@playwright/test';
import {
  ALL_CODES,
  CODE_LENGTH,
  MAX_GUESSES,
  markGuess,
} from '../../shared/code-breaker.js';
import type { CodeBreakerMark } from '../../shared/wire-types.js';
import { expect, labelsIn } from '../fixtures';

/** Playing Code Breaker as a player does: by what each guess's label reads. */

/** "4 1 7 0: 2 in place, 2 elsewhere". */
const ROW = /^(\d) (\d) (\d) (\d): (\d) in place, (\d) elsewhere$/;

export interface Guessed {
  guess: string;
  mark: CodeBreakerMark;
}

/** The guesses a board's row labels read; the row being typed reads none. */
function rowsOf(labels: readonly string[]): Guessed[] {
  return labels.flatMap((label) => {
    const match = ROW.exec(label);
    if (!match) return [];
    const [, a, b, c, d, right, moved] = match;
    return [
      {
        guess: `${a}${b}${c}${d}`,
        mark: { right: Number(right), moved: Number(moved) },
      },
    ];
  });
}

/** The guesses on the player's own board, as its rows read. */
export async function guessesOf(page: Page): Promise<Guessed[]> {
  return rowsOf(
    await labelsIn(
      page.getByRole('group', { name: 'Your guesses' }),
      '[role="img"]',
    ),
  );
}

/** The guesses on one board, or null once it has left the page. */
async function guessesOn(board: ElementHandle): Promise<Guessed[] | null> {
  const labels = await board.evaluate((root) =>
    root instanceof Element && root.isConnected
      ? Array.from(
          root.querySelectorAll('[role="img"]'),
          (row) => row.getAttribute('aria-label') ?? '',
        )
      : null,
  );
  return labels && rowsOf(labels);
}

export const isCracked = (guesses: readonly Guessed[]) =>
  guesses.some(({ mark }) => mark.right === CODE_LENGTH);

/** How many codes a guess is weighed against, so a turn stays quick. */
const WEIGHED = 400;

/**
 * A good next guess: one of the codes every mark so far allows, picked to
 * split the rest into as many different marks as it can.
 */
export function nextGuess(guesses: readonly Guessed[]): string {
  if (guesses.length === 0) return '0123';
  const left = ALL_CODES.filter((code) =>
    guesses.every(({ guess, mark }) => {
      const got = markGuess(guess, code);
      return got.right === mark.right && got.moved === mark.moved;
    }),
  );
  let best = left[0]!;
  let bestSplit = 0;
  for (const guess of left.slice(0, WEIGHED)) {
    const split = new Set(
      left.map((code) => {
        const { right, moved } = markGuess(guess, code);
        return right * 10 + moved;
      }),
    ).size;
    if (split > bestSplit) [best, bestSplit] = [guess, split];
  }
  return best;
}

/** Types four digits and presses Enter, as a player at a keyboard does. */
export async function typeGuess(page: Page, guess: string) {
  await page.keyboard.type(guess);
  await page.keyboard.press('Enter');
}

/** Whether `now` is the board `before` was, with more guesses on it. */
const goesOn = (before: readonly Guessed[], now: readonly Guessed[]) =>
  now.length > before.length &&
  before.every((row, index) => row.guess === now[index]!.guess);

/**
 * Guesses until the code is cracked or the guesses run out. In a room, the
 * last player's last guess ends the code at once and the reveal replaces the
 * board; what was seen until then comes back, without that guess. The
 * reveal lasts a second, too short to catch under load, and the next code
 * has a board of its own, so the sign is this code's board leaving the page.
 * A game on your own draws its board anew around the result.
 */
export async function solve(page: Page): Promise<Guessed[]> {
  const board = page.getByRole('group', { name: 'Your guesses' });
  // The board is up, so its keys are listened for.
  await expect(board).toBeVisible();
  let shown: ElementHandle = await board.elementHandle();
  let guesses = (await guessesOn(shown)) ?? [];
  while (guesses.length < MAX_GUESSES && !isCracked(guesses)) {
    const before = guesses;
    await typeGuess(page, nextGuess(before));
    await expect
      .poll(async () => {
        const now = await guessesOn(shown);
        return now === null || now.length > before.length;
      })
      .toBe(true);
    let now = await guessesOn(shown);
    if (!now) {
      const [drawn] = await board.elementHandles();
      now = drawn ? await guessesOn(drawn) : null;
      if (!drawn || !now || !goesOn(before, now)) break;
      shown = drawn;
    }
    guesses = now;
  }
  return guesses;
}
