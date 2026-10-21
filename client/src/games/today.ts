import { useState } from 'react';
import { puzzleNumber as codePuzzle } from '../../../shared/code-breaker';
import { DAILY_WORD_FIRST_DAY, puzzleDays } from '../../../shared/daily';
import type { GameType } from '../../../shared/wire-types';
import {
  readRecords as readCodes,
  todayOf as codeToday,
} from '../code-breaker/solo/records';
import { readStored, writeStored } from '../solo/device-store';

/**
 * Where today's puzzle of a daily game stands on this device, once it is
 * started: the guess it is on, or done, with the streak that leaves.
 */
export type DailyToday =
  | { state: 'playing'; guess: number; of: number }
  | { state: 'done'; streak: number };

/**
 * Where Daily Word keeps its records. Here, not beside them, so the home page
 * can see there are some without loading the word lists that read them.
 */
export const DAILY_WORD_RECORDS = 'daily-word:puzzles';

/**
 * Where today's Daily Word stands, kept beside the records each time a guess
 * is recorded: telling a found word from a miss takes the answer, which is in
 * the word lists, and the card and the page should not load them for it.
 */
const DAILY_WORD_TODAY = 'daily-word:today';

const dailyWordPuzzle = puzzleDays(DAILY_WORD_FIRST_DAY).puzzleNumber;

/** Keeps where a Daily Word puzzle stands after `guesses` guesses. */
export function writeDailyWordToday(
  puzzle: number,
  guesses: number,
  today: DailyToday | null,
) {
  writeStored(DAILY_WORD_TODAY, JSON.stringify({ puzzle, guesses, today }));
}

/**
 * Where today's Daily Word stands, without its word lists: nothing unless
 * today's puzzle has guesses in the records and the note beside them was
 * written with that many, so the note is never older than the records.
 */
export function dailyWordToday(now: Date): DailyToday | null {
  const puzzle = dailyWordPuzzle(now);
  try {
    const records: unknown = JSON.parse(readStored(DAILY_WORD_RECORDS) ?? '{}');
    const guesses: unknown =
      typeof records === 'object' && records !== null
        ? (records as Record<string, unknown>)[puzzle]
        : undefined;
    if (!Array.isArray(guesses) || guesses.length === 0) return null;
    const note: unknown = JSON.parse(readStored(DAILY_WORD_TODAY) ?? 'null');
    if (
      typeof note !== 'object' ||
      note === null ||
      !('puzzle' in note) ||
      note.puzzle !== puzzle ||
      !('guesses' in note) ||
      note.guesses !== guesses.length ||
      !('today' in note)
    ) {
      return null;
    }
    return isDailyToday(note.today) ? note.today : null;
  } catch {
    return null;
  }
}

function isDailyToday(value: unknown): value is DailyToday {
  if (typeof value !== 'object' || value === null || !('state' in value)) {
    return false;
  }
  if (value.state === 'playing') {
    return (
      'guess' in value &&
      Number.isInteger(value.guess) &&
      'of' in value &&
      Number.isInteger(value.of)
    );
  }
  return (
    value.state === 'done' &&
    'streak' in value &&
    Number.isInteger(value.streak)
  );
}

/** Today's state of a daily game; null for any other game. */
export function todayOf(type: GameType, now: Date): DailyToday | null {
  if (type === 'code-breaker') return codeToday(readCodes(), codePuzzle(now));
  if (type === 'daily-word') return dailyWordToday(now);
  return null;
}

/**
 * Today's state of a daily game, for its card and its page, from the first
 * render; null for any other game, and before today's first guess.
 */
export function useToday(type: GameType): DailyToday | null {
  const [today] = useState(() => todayOf(type, new Date()));
  return today;
}
