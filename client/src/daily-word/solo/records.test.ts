import { beforeEach, describe, expect, it } from 'vitest';
import { dailyAnswer } from '../../../../shared/daily-word';
import { readRecords, recordGuesses, statsOf, todayOf } from './records';

/** A found puzzle in `count` guesses, and a missed one. */
const foundIn = (puzzle: number, count: number) => [
  ...['hatch', 'match', 'latch', 'batch', 'patch']
    .filter((word) => word !== dailyAnswer(puzzle))
    .slice(0, count - 1),
  dailyAnswer(puzzle),
];
const missed = (puzzle: number) =>
  ['hatch', 'match', 'latch', 'batch', 'patch', 'catch', 'watch']
    .filter((word) => word !== dailyAnswer(puzzle))
    .slice(0, 6);

beforeEach(() => localStorage.clear());

describe('the daily records', () => {
  it('keeps each puzzle’s guesses on this device', () => {
    recordGuesses(12, ['stare']);
    recordGuesses(12, ['stare', 'cloud']);
    recordGuesses(13, ['crane']);
    expect(readRecords()).toEqual(
      new Map([
        [12, ['stare', 'cloud']],
        [13, ['crane']],
      ]),
    );
  });

  it('ignores whatever else is stored there', () => {
    localStorage.setItem(
      'zumpo:solo:daily-word:puzzles',
      JSON.stringify({ 1: ['stare'], x: ['crane'], 2: ['blant'], 3: 'oops' }),
    );
    expect(readRecords()).toEqual(new Map([[1, ['stare']]]));
    localStorage.setItem('zumpo:solo:daily-word:puzzles', '{');
    expect(readRecords()).toEqual(new Map());
  });
});

describe('the stats', () => {
  it('counts finished words, how many were found, and in how many guesses', () => {
    const records = new Map([
      [1, foundIn(1, 3)],
      [2, foundIn(2, 4)],
      [3, missed(3)],
      [4, ['stare']],
    ]);
    expect(statsOf(records, 4)).toEqual({
      played: 3,
      found: 2,
      foundPercent: 67,
      currentStreak: 0,
      bestStreak: 2,
      distribution: [0, 0, 1, 1, 0, 0],
    });
  });

  it('runs a streak up to today, or to yesterday while today is open', () => {
    const records = new Map([
      [5, foundIn(5, 2)],
      [6, foundIn(6, 3)],
      [7, foundIn(7, 4)],
    ]);
    expect(statsOf(records, 7).currentStreak).toBe(3);
    expect(statsOf(records, 8).currentStreak).toBe(3);
    // A day not played ends it.
    expect(statsOf(records, 9).currentStreak).toBe(0);
    expect(statsOf(records, 9).bestStreak).toBe(3);
  });

  it('ends a streak with a missed word', () => {
    const records = new Map([
      [1, foundIn(1, 2)],
      [2, missed(2)],
    ]);
    expect(statsOf(records, 2).currentStreak).toBe(0);
    expect(statsOf(records, 3).currentStreak).toBe(0);
    expect(statsOf(new Map(), 1)).toMatchObject({
      played: 0,
      foundPercent: 0,
      currentStreak: 0,
    });
  });
});

describe('today, for the card and the game page', () => {
  it('is nothing before the first guess, then the guess it is on', () => {
    expect(todayOf(new Map(), 5)).toBeNull();
    expect(todayOf(new Map([[5, foundIn(5, 3).slice(0, 2)]]), 5)).toEqual({
      state: 'playing',
      guess: 3,
      of: 6,
    });
  });

  it('is done once found or missed, with the streak it leaves', () => {
    const found = new Map([
      [4, foundIn(4, 2)],
      [5, foundIn(5, 3)],
    ]);
    expect(todayOf(found, 5)).toEqual({ state: 'done', streak: 2 });
    expect(todayOf(new Map([[5, missed(5)]]), 5)).toEqual({
      state: 'done',
      streak: 0,
    });
  });
});
