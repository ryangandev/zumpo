import type { CodeBreakerMark } from './wire-types.js';
import { msUntilMidnight, puzzleDays } from './daily.js';
import { charAt, itemAt, pickFrom, shuffle } from './list.js';
import { seededRandom, seedNumber } from './seed.js';

/**
 * Code Breaker's rules, which a room on the server and a game on your own in
 * the browser both play by: how a guess is marked, which guesses count, which
 * code a day or a seed deals, what a cracked code scores and how a result is
 * shared. The rules are in docs/games/code-breaker.md.
 *
 * A code and a guess are both strings of four different digits, "0" to "9".
 */

export const CODE_LENGTH = 4;
export const MAX_GUESSES = 10;

/** Four different digits, a leading 0 allowed. */
export const isCode = (text: string): boolean =>
  /^[0-9]{4}$/.test(text) && new Set(text).size === CODE_LENGTH;

/** Every code, from 0123 up to 9876: 10 × 9 × 8 × 7 = 5,040 of them. */
export const ALL_CODES: readonly string[] = Array.from(
  { length: 10_000 },
  (_, n) => String(n).padStart(CODE_LENGTH, '0'),
).filter(isCode);

/**
 * A guess against the code: `right` digits in the same place, and `moved`
 * digits in both but in different places. Both have four different digits,
 * so a digit matches at most once.
 */
export function markGuess(guess: string, code: string): CodeBreakerMark {
  let right = 0;
  let shared = 0;
  for (let i = 0; i < CODE_LENGTH; i++) {
    const digit = charAt(guess, i);
    if (charAt(code, i) === digit) right++;
    if (code.includes(digit)) shared++;
  }
  return { right, moved: shared - right };
}

export const isCracked = (mark: CodeBreakerMark): boolean =>
  mark.right === CODE_LENGTH;

/** Why a typed row cannot be used as a guess. */
export type GuessProblem = 'tooShort' | 'repeatedDigit' | 'alreadyGuessed';

/**
 * Whether `guess` may be guessed after `earlier`, or why not. A screen never
 * lets a digit be typed twice, so `repeatedDigit` is only a stale or modified
 * client's.
 */
export function checkGuess(
  guess: string,
  earlier: readonly string[],
): GuessProblem | null {
  if (!/^[0-9]{4}$/.test(guess)) return 'tooShort';
  if (!isCode(guess)) return 'repeatedDigit';
  if (earlier.includes(guess)) return 'alreadyGuessed';
  return null;
}

/** The pegs of a mark in the board's order: right, then moved, then the rest. */
export type Peg = 'right' | 'moved' | 'none';

export function pegsOf({ right, moved }: CodeBreakerMark): Peg[] {
  return [
    ...Array.from({ length: right }, (): Peg => 'right'),
    ...Array.from({ length: moved }, (): Peg => 'moved'),
    ...Array.from({ length: CODE_LENGTH - right - moved }, (): Peg => 'none'),
  ];
}

// ---------------------------------------------------------------------------
// The daily code

/**
 * Puzzle #1 is this local date: 21 October 2026, the day the game went live.
 * It never moves, or everybody's records would point at other codes.
 */
export const FIRST_DAY = { year: 2026, month: 10, day: 21 };
const DAYS = puzzleDays(FIRST_DAY);

/**
 * The daily code for the device's own date, from 1. A clock set before the
 * first day plays the first.
 */
export const puzzleNumber = DAYS.puzzleNumber;

/** The same, for the UTC date, which is what the server goes by. */
export const utcPuzzleNumber = DAYS.utcPuzzleNumber;

/**
 * The code calendar: every code once, in a fixed shuffled order. The seed and
 * the shuffle never change once a day has been played; a test pins the start.
 */
const CALENDAR: readonly string[] = shuffle(
  ALL_CODES,
  seededRandom(seedNumber('zumpo-code-breaker')),
);

/** Puzzle n is entry n - 1, and the calendar starts again after the last. */
export const dailyCode = (puzzle: number): string =>
  itemAt(CALENDAR, (puzzle - 1) % CALENDAR.length);

/** Milliseconds until the device's next midnight, when the next code is out. */
export const msUntilNextPuzzle = msUntilMidnight;

// ---------------------------------------------------------------------------
// Practice codes and rooms

/** A practice code, dealt from a challenge link's seed alone. */
export function practiceCode(seed: string): string {
  return pickFrom(ALL_CODES, seededRandom(seedNumber(seed)));
}

/**
 * A room's codes: `count` different codes, none of them the daily code of the
 * UTC yesterday, today or tomorrow, which between them are every time zone's
 * today.
 */
export function roomCodes(
  random: () => number,
  count: number,
  now: Date,
): string[] {
  const today = utcPuzzleNumber(now);
  const avoid = new Set(
    [today - 1, today, today + 1].filter((n) => n >= 1).map(dailyCode),
  );
  const codes: string[] = [];
  while (codes.length < count) {
    const code = pickFrom(ALL_CODES, random);
    if (!avoid.has(code) && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

/**
 * What a code cracked in a room is worth: 100 for cracking it, 100 for every
 * guess left over, and up to 50 for the time left, so one guess fewer always
 * beats any speed.
 */
export const pointsForCrack = (
  guesses: number,
  msLeft: number,
  roundMs: number,
): number =>
  100 * (MAX_GUESSES + 1 - guesses) +
  Math.round((50 * Math.max(0, Math.min(msLeft, roundMs))) / roundMs);

// ---------------------------------------------------------------------------
// Records

/**
 * The bars of the guess distribution: 1-4 share the first, then one each for
 * 5 to 10.
 */
export const DISTRIBUTION_BARS = 7;

/** Which bar a code cracked in `guesses` counts in. */
export const barOf = (guesses: number): number =>
  Math.max(0, Math.min(guesses, MAX_GUESSES) - 4);

// ---------------------------------------------------------------------------
// Sharing

const EMOJI: Readonly<Record<Peg, string>> = {
  right: '🟩',
  moved: '🟠',
  none: '⬜',
};

/** One line of four pegs per guess, with no digits in it. */
export const markGrid = (marks: readonly CodeBreakerMark[]): string =>
  marks
    .map((mark) =>
      pegsOf(mark)
        .map((peg) => EMOJI[peg])
        .join(''),
    )
    .join('\n');

/**
 * A result to paste anywhere: what was played and in how many guesses (X when
 * missed), the grid, and a link to play it.
 */
export function shareText(
  title: string,
  marks: readonly CodeBreakerMark[],
  link: string,
): string {
  const last = marks.at(-1);
  const cracked = last !== undefined && isCracked(last);
  const score = `${cracked ? marks.length : 'X'}/${MAX_GUESSES}`;
  return `${title} ${score}\n\n${markGrid(marks)}\n${link}`;
}
