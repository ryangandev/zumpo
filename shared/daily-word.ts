import type { DailyWordMark } from './wire-types.js';
import { ANSWERS } from './daily-word-answers.js';
import { GUESSES } from './daily-word-guesses.js';
import { msUntilMidnight, puzzleDays } from './daily.js';
import { seededRandom, seedNumber } from './seed.js';
import { charAt, itemAt, pickFrom } from './list.js';

/**
 * Daily Word's rules, which a room on the server and a game on your own in the
 * browser both play by: how a guess is marked, which words count, which word
 * a day or a seed deals, what a found word scores and how a result is shared.
 * The rules are in docs/games/daily-word.md.
 *
 * Words are lowercase here and on the wire; screens show them in capitals.
 */

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export { ANSWERS };

const validGuesses = new Set(GUESSES);

/** Any five-letter word in the list of valid guesses. */
export const isValidGuess = (word: string): boolean => validGuesses.has(word);

/**
 * Each letter of a guess against the answer. A letter in its right place is
 * counted first; the rest are marked present from left to right while the
 * answer has that letter left over, so a letter is never marked more times
 * than the answer has it.
 */
export function markGuess(guess: string, answer: string): DailyWordMark[] {
  const marks: DailyWordMark[] = Array.from(
    { length: WORD_LENGTH },
    () => 'absent',
  );
  const leftOver = new Map<string, number>();
  for (let i = 0; i < WORD_LENGTH; i++) {
    const letter = charAt(answer, i);
    if (charAt(guess, i) === letter) marks[i] = 'correct';
    else leftOver.set(letter, (leftOver.get(letter) ?? 0) + 1);
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (marks[i] === 'correct') continue;
    const letter = charAt(guess, i);
    const left = leftOver.get(letter) ?? 0;
    if (left > 0) {
      marks[i] = 'present';
      leftOver.set(letter, left - 1);
    }
  }
  return marks;
}

export const isFound = (marks: readonly DailyWordMark[]): boolean =>
  marks.length === WORD_LENGTH && marks.every((mark) => mark === 'correct');

/** Why a typed row cannot be used as a guess. */
export type GuessProblem = 'tooShort' | 'notAWord' | 'alreadyGuessed';

/** Whether `word` may be guessed after `earlier`, or why not. */
export function checkGuess(
  word: string,
  earlier: readonly string[],
): GuessProblem | null {
  if (word.length < WORD_LENGTH) return 'tooShort';
  if (!isValidGuess(word)) return 'notAWord';
  if (earlier.includes(word)) return 'alreadyGuessed';
  return null;
}

/** For each letter guessed so far, the best mark it has had. */
export function keyMarks(
  rows: readonly { word: string; marks: readonly DailyWordMark[] }[],
): Map<string, DailyWordMark> {
  const rank: Record<DailyWordMark, number> = {
    absent: 0,
    present: 1,
    correct: 2,
  };
  const best = new Map<string, DailyWordMark>();
  for (const { word, marks } of rows) {
    for (let i = 0; i < word.length; i++) {
      const letter = charAt(word, i);
      const mark = itemAt(marks, i);
      const known = best.get(letter);
      if (!known || rank[mark] > rank[known]) best.set(letter, mark);
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The daily word

/** Puzzle #1 is this local date: 5 October 2026. */
const DAYS = puzzleDays({ year: 2026, month: 10, day: 5 });

/**
 * The daily puzzle for the device's own date, from 1. A clock set before the
 * first day plays the first.
 */
export const puzzleNumber = DAYS.puzzleNumber;

/** The same, for the UTC date, which is what the server goes by. */
export const utcPuzzleNumber = DAYS.utcPuzzleNumber;

/** Puzzle n is entry n - 1, and the list starts again after the last. */
export const dailyAnswer = (puzzle: number): string =>
  itemAt(ANSWERS, (puzzle - 1) % ANSWERS.length);

/** Milliseconds until the device's next midnight, when the next word is out. */
export const msUntilNextPuzzle = msUntilMidnight;

// ---------------------------------------------------------------------------
// Practice words and rooms

/** A practice word, dealt from a challenge link's seed alone. */
export function practiceAnswer(seed: string): string {
  return pickFrom(ANSWERS, seededRandom(seedNumber(seed)));
}

/**
 * A room's words: `count` different answers, none of them the daily word of
 * the UTC yesterday, today or tomorrow, which between them are every time
 * zone's today.
 */
export function roomWords(
  random: () => number,
  count: number,
  now: Date,
): string[] {
  const today = utcPuzzleNumber(now);
  const avoid = new Set(
    [today - 1, today, today + 1].filter((n) => n >= 1).map(dailyAnswer),
  );
  const words: string[] = [];
  while (words.length < count) {
    const word = pickFrom(ANSWERS, random);
    if (!avoid.has(word) && !words.includes(word)) words.push(word);
  }
  return words;
}

/**
 * What a word found in a room is worth: 100 for every guess left over, and up
 * to 50 for the time left, so one guess fewer always beats any speed.
 */
export const pointsForFind = (
  guesses: number,
  msLeft: number,
  roundMs: number,
): number =>
  100 * (MAX_GUESSES + 1 - guesses) +
  Math.round((50 * Math.max(0, Math.min(msLeft, roundMs))) / roundMs);

// ---------------------------------------------------------------------------
// Sharing

const EMOJI: Readonly<Record<DailyWordMark, string>> = {
  correct: '🟩',
  present: '🟠',
  absent: '⬜',
};

/** One line of squares and circles per guess, with no letters in it. */
export const markGrid = (rows: readonly (readonly DailyWordMark[])[]): string =>
  rows.map((marks) => marks.map((mark) => EMOJI[mark]).join('')).join('\n');

/**
 * A result to paste anywhere: what was played and in how many guesses (X when
 * missed), the grid, and a link to play it.
 */
export function shareText(
  title: string,
  rows: readonly (readonly DailyWordMark[])[],
  link: string,
): string {
  const last = rows.at(-1);
  const found = last !== undefined && isFound(last);
  const score = `${found ? rows.length : 'X'}/${MAX_GUESSES}`;
  return `${title} ${score}\n\n${markGrid(rows)}\n${link}`;
}
