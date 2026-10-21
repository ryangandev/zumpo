import { itemAt } from '../../../../shared/list';
import {
  barOf,
  dailyCode,
  DISTRIBUTION_BARS,
  isCode,
  MAX_GUESSES,
} from '../../../../shared/code-breaker';
import { readStored, writeStored } from '../../solo/device-store';
import type { Notes } from '../draft';

/**
 * The daily codes played on this device: the guesses made at each puzzle, by
 * puzzle number. Stats and streaks are worked out from these records rather
 * than kept beside them, so the two can never disagree.
 */
export type PuzzleRecords = ReadonlyMap<number, readonly string[]>;

const KEY = 'code-breaker:puzzles';
/** The notes on the pad for one daily code: only today's are worth keeping. */
const NOTES_KEY = 'code-breaker:notes';

export function readRecords(): PuzzleRecords {
  try {
    const stored: unknown = JSON.parse(readStored(KEY) ?? '{}');
    const records = new Map<number, readonly string[]>();
    if (typeof stored !== 'object' || stored === null) return records;
    for (const [puzzle, guesses] of Object.entries(stored)) {
      const number = Number(puzzle);
      if (
        Number.isInteger(number) &&
        number > 0 &&
        Array.isArray(guesses) &&
        guesses.length <= MAX_GUESSES &&
        guesses.every((guess) => typeof guess === 'string' && isCode(guess))
      ) {
        records.set(number, guesses);
      }
    }
    return records;
  } catch {
    return new Map();
  }
}

/** Keeps a puzzle's guesses so far, as each is made. */
export function recordGuesses(
  puzzle: number,
  guesses: readonly string[],
): PuzzleRecords {
  const records = new Map(readRecords());
  records.set(puzzle, guesses);
  writeStored(KEY, JSON.stringify(Object.fromEntries(records)));
  return records;
}

/** The notes kept for a daily code; none for any other day's. */
export function readNotes(puzzle: number): Notes {
  try {
    const stored: unknown = JSON.parse(readStored(NOTES_KEY) ?? 'null');
    if (
      typeof stored !== 'object' ||
      stored === null ||
      !('puzzle' in stored) ||
      stored.puzzle !== puzzle ||
      !('notes' in stored) ||
      typeof stored.notes !== 'object' ||
      stored.notes === null
    ) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored.notes).filter(
        ([digit, note]) =>
          /^[0-9]$/.test(digit) && (note === 'out' || note === 'in'),
      ),
    );
  } catch {
    return {};
  }
}

export function recordNotes(puzzle: number, notes: Notes) {
  writeStored(NOTES_KEY, JSON.stringify({ puzzle, notes }));
}

type Outcome = 'cracked' | 'missed' | 'playing';

const outcomeOf = (puzzle: number, guesses: readonly string[]): Outcome => {
  if (guesses.at(-1) === dailyCode(puzzle)) return 'cracked';
  return guesses.length >= MAX_GUESSES ? 'missed' : 'playing';
};

export interface DailyStats {
  /** Finished daily codes. */
  played: number;
  cracked: number;
  /** Cracked, as a whole percentage of played; 0 before any. */
  crackedPercent: number;
  /** Daily codes cracked on consecutive days, up to today or yesterday. */
  currentStreak: number;
  bestStreak: number;
  /** How many were cracked in each bar's guesses: 1–4, then 5 to 10. */
  distribution: number[];
}

export function statsOf(records: PuzzleRecords, today: number): DailyStats {
  const outcomes = new Map<number, Outcome>();
  for (const [puzzle, guesses] of records) {
    outcomes.set(puzzle, outcomeOf(puzzle, guesses));
  }
  const distribution = Array.from({ length: DISTRIBUTION_BARS }, () => 0);
  let played = 0;
  let cracked = 0;
  for (const [puzzle, outcome] of outcomes) {
    if (outcome === 'playing') continue;
    played += 1;
    if (outcome === 'cracked') {
      cracked += 1;
      const bar = barOf(records.get(puzzle)!.length);
      distribution[bar] = itemAt(distribution, bar) + 1;
    }
  }

  // The streak runs up to today if today's is cracked, and otherwise up to
  // yesterday's: a code not finished yet today has not broken it.
  let currentStreak = 0;
  const todays = outcomes.get(today);
  let day = todays === 'cracked' ? today : todays === 'missed' ? 0 : today - 1;
  while (day > 0 && outcomes.get(day) === 'cracked') {
    currentStreak += 1;
    day -= 1;
  }

  let bestStreak = 0;
  for (const [puzzle, outcome] of outcomes) {
    if (outcome !== 'cracked' || outcomes.get(puzzle - 1) === 'cracked') {
      continue;
    }
    let length = 0;
    while (outcomes.get(puzzle + length) === 'cracked') length += 1;
    bestStreak = Math.max(bestStreak, length);
  }

  return {
    played,
    cracked,
    crackedPercent: played === 0 ? 0 : Math.round((100 * cracked) / played),
    currentStreak,
    bestStreak,
    distribution,
  };
}
