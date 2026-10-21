import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ALL_CODES,
  barOf,
  checkGuess,
  dailyCode,
  isCode,
  isCracked,
  markGrid,
  markGuess,
  msUntilNextPuzzle,
  pegsOf,
  pointsForCrack,
  practiceCode,
  puzzleNumber,
  roomCodes,
  shareText,
  utcPuzzleNumber,
} from '../../shared/code-breaker.js';
import type { CodeBreakerMark } from '../models/types.js';

/** The calendar as it was dealt; see 'keeps the calendar in its order'. */
const CALENDAR_HASH = '1825d99f08f507b6';

const mark = (right: number, moved: number): CodeBreakerMark => ({
  right,
  moved,
});

describe('marking a guess', () => {
  it('counts digits in their place and digits elsewhere', () => {
    // The contract's examples, against 4071.
    expect(markGuess('1234', '4071')).toEqual(mark(0, 2));
    expect(markGuess('5678', '4071')).toEqual(mark(1, 0));
    expect(markGuess('4170', '4071')).toEqual(mark(2, 2));
    expect(markGuess('5689', '4071')).toEqual(mark(0, 0));
    expect(markGuess('4071', '4071')).toEqual(mark(4, 0));
  });

  it('never marks three in place and one elsewhere', () => {
    const marks = new Set(
      ALL_CODES.map((guess) => {
        const { right, moved } = markGuess(guess, '0123');
        return `${right}${moved}`;
      }),
    );
    expect(marks.has('31')).toBe(false);
    expect(marks.size).toBe(14);
  });

  it('is cracked at four in place', () => {
    expect(isCracked(mark(4, 0))).toBe(true);
    expect(isCracked(mark(2, 2))).toBe(false);
  });

  it('puts the pegs in place first, then elsewhere, then the rest', () => {
    expect(pegsOf(mark(1, 2))).toEqual(['right', 'moved', 'moved', 'none']);
    expect(pegsOf(mark(0, 0))).toEqual(['none', 'none', 'none', 'none']);
  });
});

describe('checking a guess', () => {
  it('takes four different digits not guessed before', () => {
    expect(checkGuess('0123', [])).toBeNull();
    expect(checkGuess('9876', ['0123'])).toBeNull();
  });

  it('turns back a short row, a repeated digit and a repeat', () => {
    expect(checkGuess('012', [])).toBe('tooShort');
    expect(checkGuess('12a4', [])).toBe('tooShort');
    expect(checkGuess('01234', [])).toBe('tooShort');
    expect(checkGuess('1123', [])).toBe('repeatedDigit');
    expect(checkGuess('0123', ['4567', '0123'])).toBe('alreadyGuessed');
  });
});

describe('the codes', () => {
  it('has every four different digits, a leading 0 allowed', () => {
    expect(ALL_CODES).toHaveLength(5040);
    expect(ALL_CODES[0]).toBe('0123');
    expect(ALL_CODES.at(-1)).toBe('9876');
    expect(ALL_CODES.every(isCode)).toBe(true);
    expect(isCode('0012')).toBe(false);
  });
});

describe('the daily code', () => {
  it('counts puzzles by the local date, from 21 October 2026', () => {
    expect(puzzleNumber(new Date(2026, 9, 21, 0, 0))).toBe(1);
    expect(puzzleNumber(new Date(2026, 9, 21, 23, 59))).toBe(1);
    expect(puzzleNumber(new Date(2026, 9, 22, 0, 0))).toBe(2);
    expect(puzzleNumber(new Date(2026, 10, 1, 12, 0))).toBe(12);
    // Across a change to or from daylight saving time, a day is still a day.
    expect(puzzleNumber(new Date(2026, 10, 2, 1, 0))).toBe(13);
    expect(puzzleNumber(new Date(2027, 2, 30, 1, 0))).toBe(161);
  });

  it('plays the first puzzle on a clock set before it', () => {
    expect(puzzleNumber(new Date(2020, 0, 1))).toBe(1);
  });

  it('goes by the UTC date on the server', () => {
    expect(utcPuzzleNumber(new Date(Date.UTC(2026, 9, 21, 23, 59)))).toBe(1);
    expect(utcPuzzleNumber(new Date(Date.UTC(2026, 9, 22, 0, 0)))).toBe(2);
  });

  it('keeps the calendar in its order, every code once', () => {
    const calendar = Array.from({ length: 5040 }, (_, i) => dailyCode(i + 1));
    expect(calendar.slice(0, 5)).toEqual([
      '1920',
      '7601',
      '9850',
      '5920',
      '1572',
    ]);
    expect(new Set(calendar).size).toBe(5040);
    expect(
      createHash('sha256')
        .update(calendar.join(' '))
        .digest('hex')
        .slice(0, 16),
    ).toBe(CALENDAR_HASH);
  });

  it('starts the calendar again after the last', () => {
    expect(dailyCode(5041)).toBe(dailyCode(1));
  });

  it('counts down to the next local midnight', () => {
    expect(msUntilNextPuzzle(new Date(2026, 9, 21, 23, 0))).toBe(3_600_000);
  });
});

describe('practice codes and rooms', () => {
  it('deals the same practice code from the same seed', () => {
    expect(practiceCode('k3f9x2')).toBe(practiceCode('k3f9x2'));
    expect(isCode(practiceCode('k3f9x2'))).toBe(true);
  });

  it('gives a room different codes, never a daily code near today', () => {
    const now = new Date(Date.UTC(2026, 10, 1, 12));
    const today = utcPuzzleNumber(now);
    const neighbours = [today - 1, today, today + 1].map(dailyCode);
    // A source that offers the neighbours first, then a code twice.
    const offered = [...neighbours, '0123', '0123', '4071', '9876'];
    let next = 0;
    const random = () =>
      (ALL_CODES.indexOf(offered[next++]!) + 0.5) / ALL_CODES.length;

    expect(roomCodes(random, 3, now)).toEqual(['0123', '4071', '9876']);
  });
});

describe('scoring a cracked code', () => {
  it('is 100 more for every guess left over, plus up to 50 for the time', () => {
    // The contract's examples.
    expect(pointsForCrack(5, 120_000, 180_000)).toBe(633);
    expect(pointsForCrack(6, 64_000, 180_000)).toBe(518);
    expect(pointsForCrack(8, 21_000, 180_000)).toBe(306);
    expect(pointsForCrack(10, 1_000, 180_000)).toBe(100);
    expect(pointsForCrack(1, 180_000, 180_000)).toBe(1050);
    expect(pointsForCrack(10, -5, 180_000)).toBe(100);
  });

  it('always pays one guess fewer more than any speed', () => {
    expect(pointsForCrack(5, 0, 180_000)).toBeGreaterThan(
      pointsForCrack(6, 180_000, 180_000),
    );
  });
});

describe('the guess distribution', () => {
  it('puts 1 to 4 guesses in one bar, then one bar each to 10', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(barOf)).toEqual([
      0, 0, 0, 0, 1, 2, 3, 4, 5, 6,
    ]);
  });
});

describe('sharing a result', () => {
  // The contract's example.
  const marks = [
    mark(0, 2),
    mark(1, 0),
    mark(0, 2),
    mark(1, 2),
    mark(2, 2),
    mark(4, 0),
  ];

  it('is the game, the guesses, a grid with no digits, and a link', () => {
    expect(
      shareText(
        'Code Breaker #12',
        marks,
        'https://zumpo.ryangan.me/games/code-breaker/solo',
      ),
    ).toBe(
      [
        'Code Breaker #12 6/10',
        '',
        '🟠🟠⬜⬜',
        '🟩⬜⬜⬜',
        '🟠🟠⬜⬜',
        '🟩🟠🟠⬜',
        '🟩🟩🟠🟠',
        '🟩🟩🟩🟩',
        'https://zumpo.ryangan.me/games/code-breaker/solo',
      ].join('\n'),
    );
  });

  it('says X for a missed code', () => {
    const missed = Array.from({ length: 10 }, () => mark(2, 1));
    expect(shareText('猜数字 #13', missed, 'link').split('\n')[0]).toBe(
      '猜数字 #13 X/10',
    );
    expect(markGrid([mark(0, 1)])).toBe('🟠⬜⬜⬜');
  });
});
