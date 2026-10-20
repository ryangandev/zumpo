import { itemAt } from '../../../../shared/list';
import {
  dailyAnswer,
  isValidGuess,
  MAX_GUESSES,
} from '../../../../shared/daily-word';
import { readStored, writeStored } from '../../solo/device-store';

/**
 * The daily words played on this device: the guesses made at each puzzle, by
 * puzzle number. Stats and streaks are worked out from these records rather
 * than kept beside them, so the two can never disagree.
 */
export type PuzzleRecords = ReadonlyMap<number, readonly string[]>;

const KEY = 'daily-word:puzzles';

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
        guesses.every((word) => typeof word === 'string' && isValidGuess(word))
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

type Outcome = 'found' | 'missed' | 'playing';

const outcomeOf = (puzzle: number, guesses: readonly string[]): Outcome => {
  if (guesses.at(-1) === dailyAnswer(puzzle)) return 'found';
  return guesses.length >= MAX_GUESSES ? 'missed' : 'playing';
};

export interface DailyStats {
  /** Finished daily words. */
  played: number;
  found: number;
  /** Found, as a whole percentage of played; 0 before any. */
  foundPercent: number;
  /** Daily words found on consecutive days, up to today or yesterday. */
  currentStreak: number;
  bestStreak: number;
  /** How many were found in 1 to 6 guesses. */
  distribution: number[];
}

export function statsOf(records: PuzzleRecords, today: number): DailyStats {
  const outcomes = new Map<number, Outcome>();
  for (const [puzzle, guesses] of records) {
    outcomes.set(puzzle, outcomeOf(puzzle, guesses));
  }
  const distribution = Array.from({ length: MAX_GUESSES }, () => 0);
  let played = 0;
  let found = 0;
  for (const [puzzle, outcome] of outcomes) {
    if (outcome === 'playing') continue;
    played += 1;
    if (outcome === 'found') {
      found += 1;
      const guesses = records.get(puzzle)!.length;
      distribution[guesses - 1] = itemAt(distribution, guesses - 1) + 1;
    }
  }

  // The streak runs up to today if today's is found, and otherwise up to
  // yesterday's: a word not finished yet today has not broken it.
  let currentStreak = 0;
  const todays = outcomes.get(today);
  let day = todays === 'found' ? today : todays === 'missed' ? 0 : today - 1;
  while (day > 0 && outcomes.get(day) === 'found') {
    currentStreak += 1;
    day -= 1;
  }

  let bestStreak = 0;
  for (const [puzzle, outcome] of outcomes) {
    if (outcome !== 'found' || outcomes.get(puzzle - 1) === 'found') continue;
    let length = 0;
    while (outcomes.get(puzzle + length) === 'found') length += 1;
    bestStreak = Math.max(bestStreak, length);
  }

  return {
    played,
    found,
    foundPercent: played === 0 ? 0 : Math.round((100 * found) / played),
    currentStreak,
    bestStreak,
    distribution,
  };
}
