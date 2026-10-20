import type { ElementHandle, Page } from '@playwright/test';
import { ANSWERS, markGuess } from '../../shared/daily-word.js';
import type { DailyWordMark } from '../../shared/wire-types.js';
import { expect, labelsIn } from '../fixtures';

/** Playing Daily Word as a player does: by the marks the tiles' labels read. */

const MARKS: Readonly<Record<string, DailyWordMark>> = {
  'right place': 'correct',
  'in the word, somewhere else': 'present',
  'not in the word': 'absent',
};

const TILE = /^([A-Z]), (.+)$/;

export interface Guessed {
  word: string;
  marks: DailyWordMark[];
}

/** The guesses a board's tile labels read, five tiles to a row. */
function rowsOf(labels: readonly string[]): Guessed[] {
  const tiles = labels.flatMap((label) => {
    const [, letter, said] = TILE.exec(label) ?? [];
    const mark = said === undefined ? undefined : MARKS[said];
    return mark ? [{ letter, mark }] : [];
  });
  const rows: Guessed[] = [];
  for (let at = 0; at + 5 <= tiles.length; at += 5) {
    const row = tiles.slice(at, at + 5);
    rows.push({
      word: row.map((tile) => tile.letter!.toLowerCase()).join(''),
      marks: row.map((tile) => tile.mark),
    });
  }
  return rows;
}

/** The guesses on the player's own board, as its tiles read. */
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
          (tile) => tile.getAttribute('aria-label') ?? '',
        )
      : null,
  );
  return labels && rowsOf(labels);
}

export const isFound = (guesses: readonly Guessed[]) =>
  guesses.some(({ marks }) => marks.every((mark) => mark === 'correct'));

const same = (a: readonly string[], b: readonly string[]) =>
  a.every((mark, index) => mark === b[index]);

/**
 * A good next guess: one of the answers every mark so far allows, picked to
 * split the rest into as many different mark patterns as it can.
 */
export function nextGuess(guesses: readonly Guessed[]): string {
  if (guesses.length === 0) return 'slate';
  const left = ANSWERS.filter((answer) =>
    guesses.every(({ word, marks }) => same(markGuess(word, answer), marks)),
  );
  let best = left[0]!;
  let bestSplit = 0;
  for (const word of left) {
    const split = new Set(left.map((answer) => markGuess(word, answer).join()))
      .size;
    if (split > bestSplit) [best, bestSplit] = [word, split];
  }
  return best;
}

/** Types a word and presses Enter, as a player at a keyboard does. */
export async function typeGuess(page: Page, word: string) {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
}

/** Whether `now` is the board `before` was, with more guesses on it. */
const goesOn = (before: readonly Guessed[], now: readonly Guessed[]) =>
  now.length > before.length &&
  before.every((row, index) => row.word === now[index]!.word);

/**
 * Guesses until the word is found or the guesses run out. In a room, the last
 * player's last guess ends the word at once and the reveal replaces the
 * board; what was seen until then comes back, without that guess. The reveal
 * lasts a second, too short to catch under load, and the next word has a
 * board of its own, so the sign is this word's board leaving the page. A
 * game on your own draws its board anew around the result, with every guess.
 */
export async function solve(page: Page): Promise<Guessed[]> {
  const board = page.getByRole('group', { name: 'Your guesses' });
  // The board is up, so its keys are listened for.
  await expect(board).toBeVisible();
  let shown: ElementHandle = await board.elementHandle();
  let guesses = (await guessesOn(shown)) ?? [];
  while (guesses.length < 6 && !isFound(guesses)) {
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
