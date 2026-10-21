import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_CODES, dailyCode } from '../../../../shared/code-breaker';
import {
  readNotes,
  readRecords,
  recordGuesses,
  recordNotes,
  statsOf,
  todayOf,
} from './records';

/** Codes that are not `puzzle`'s, to miss it with. */
const misses = (puzzle: number, count: number) =>
  ALL_CODES.filter((code) => code !== dailyCode(puzzle)).slice(0, count);
const crackedIn = (puzzle: number, count: number) => [
  ...misses(puzzle, count - 1),
  dailyCode(puzzle),
];

beforeEach(() => localStorage.clear());

describe('the daily records', () => {
  it('keeps each puzzle’s guesses on this device', () => {
    recordGuesses(12, ['0123']);
    recordGuesses(12, ['0123', '4567']);
    recordGuesses(13, ['9876']);
    expect(readRecords()).toEqual(
      new Map([
        [12, ['0123', '4567']],
        [13, ['9876']],
      ]),
    );
  });

  it('ignores whatever else is stored there', () => {
    localStorage.setItem(
      'zumpo:solo:code-breaker:puzzles',
      JSON.stringify({ 1: ['0123'], x: ['4567'], 2: ['1123'], 3: 'oops' }),
    );
    expect(readRecords()).toEqual(new Map([[1, ['0123']]]));
    localStorage.setItem('zumpo:solo:code-breaker:puzzles', '{');
    expect(readRecords()).toEqual(new Map());
  });

  it('keeps the notes for one day’s code only', () => {
    recordNotes(12, { 5: 'out', 4: 'in' });
    expect(readNotes(12)).toEqual({ 5: 'out', 4: 'in' });
    expect(readNotes(13)).toEqual({});
    localStorage.setItem(
      'zumpo:solo:code-breaker:notes',
      JSON.stringify({ puzzle: 12, notes: { 5: 'out', x: 'in', 6: 'maybe' } }),
    );
    expect(readNotes(12)).toEqual({ 5: 'out' });
  });
});

describe('the stats', () => {
  it('counts finished codes, how many were cracked, and in how many guesses', () => {
    const records = new Map([
      [1, crackedIn(1, 3)],
      [2, crackedIn(2, 6)],
      [3, misses(3, 10)],
      [4, ['0123']],
    ]);
    expect(statsOf(records, 4)).toEqual({
      played: 3,
      cracked: 2,
      crackedPercent: 67,
      currentStreak: 0,
      bestStreak: 2,
      // 1–4, then 5 to 10.
      distribution: [1, 0, 1, 0, 0, 0, 0],
    });
  });

  it('runs a streak up to today, or to yesterday while today is open', () => {
    const records = new Map([
      [5, crackedIn(5, 2)],
      [6, crackedIn(6, 10)],
      [7, crackedIn(7, 4)],
    ]);
    expect(statsOf(records, 7).currentStreak).toBe(3);
    expect(statsOf(records, 8).currentStreak).toBe(3);
    // A day not played ends it.
    expect(statsOf(records, 9).currentStreak).toBe(0);
    expect(statsOf(records, 9).bestStreak).toBe(3);
  });

  it('ends a streak with a missed code', () => {
    const records = new Map([
      [1, crackedIn(1, 2)],
      [2, misses(2, 10)],
    ]);
    expect(statsOf(records, 2).currentStreak).toBe(0);
    expect(statsOf(new Map(), 1)).toMatchObject({
      played: 0,
      crackedPercent: 0,
      currentStreak: 0,
    });
  });
});

describe('today, for the card and the game page', () => {
  it('is nothing before the first guess, then the guess it is on', () => {
    expect(todayOf(new Map(), 5)).toBeNull();
    expect(todayOf(new Map([[5, []]]), 5)).toBeNull();
    expect(todayOf(new Map([[5, misses(5, 2)]]), 5)).toEqual({
      state: 'playing',
      guess: 3,
      of: 10,
    });
  });

  it('is done once cracked or missed, with the streak it leaves', () => {
    const cracked = new Map([
      [4, crackedIn(4, 2)],
      [5, crackedIn(5, 3)],
    ]);
    expect(todayOf(cracked, 5)).toEqual({ state: 'done', streak: 2 });
    expect(todayOf(new Map([[5, misses(5, 10)]]), 5)).toEqual({
      state: 'done',
      streak: 0,
    });
  });
});
