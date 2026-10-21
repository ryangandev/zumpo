import { beforeEach, describe, expect, it } from 'vitest';
import { dailyAnswer, puzzleNumber } from '../../../shared/daily-word';
import { recordGuesses } from '../daily-word/solo/records';
import { dailyWordToday, todayOf } from './today';

const now = new Date(2026, 9, 21, 12);
const today = puzzleNumber(now);
const misses = ['hatch', 'match', 'latch', 'batch', 'patch', 'catch', 'watch']
  .filter((word) => word !== dailyAnswer(today))
  .slice(0, 6);

beforeEach(() => localStorage.clear());

describe('today’s Daily Word, without its word lists', () => {
  it('counts its days as the word lists do', () => {
    for (const date of [now, new Date(2026, 9, 5), new Date(2027, 5, 1)]) {
      recordGuesses(puzzleNumber(date), [misses[0]!]);
      expect(dailyWordToday(date)).toEqual({
        state: 'playing',
        guess: 2,
        of: 6,
      });
    }
  });

  it('is nothing before today’s first guess, even with other days played', () => {
    expect(dailyWordToday(now)).toBeNull();
    recordGuesses(today - 1, [dailyAnswer(today - 1)]);
    expect(dailyWordToday(now)).toBeNull();
    expect(todayOf('daily-word', now)).toBeNull();
  });

  it('is the guess today’s word is on, then done with the streak', () => {
    recordGuesses(today - 1, [dailyAnswer(today - 1)]);
    recordGuesses(today, misses.slice(0, 2));
    expect(dailyWordToday(now)).toEqual({ state: 'playing', guess: 3, of: 6 });
    recordGuesses(today, [...misses.slice(0, 2), dailyAnswer(today)]);
    expect(dailyWordToday(now)).toEqual({ state: 'done', streak: 2 });
  });

  it('is done once today’s word is missed', () => {
    recordGuesses(today, misses);
    expect(dailyWordToday(now)).toEqual({ state: 'done', streak: 0 });
  });

  it('says nothing when the note does not match the records', () => {
    recordGuesses(today, misses.slice(0, 2));
    // Records from before the note was kept, or changed behind its back.
    localStorage.setItem(
      'zumpo:solo:daily-word:puzzles',
      JSON.stringify({ [today]: misses.slice(0, 3) }),
    );
    expect(dailyWordToday(now)).toBeNull();
    localStorage.removeItem('zumpo:solo:daily-word:today');
    expect(dailyWordToday(now)).toBeNull();
    localStorage.setItem('zumpo:solo:daily-word:today', '{');
    expect(dailyWordToday(now)).toBeNull();
  });

  it('is nothing for a game that is not daily', () => {
    expect(todayOf('minesweeper', now)).toBeNull();
  });
});
