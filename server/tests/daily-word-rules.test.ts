import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ANSWERS,
  checkGuess,
  dailyAnswer,
  isFound,
  isValidGuess,
  keyMarks,
  markGrid,
  markGuess,
  msUntilNextPuzzle,
  pointsForFind,
  practiceAnswer,
  puzzleNumber,
  roomWords,
  shareText,
  utcPuzzleNumber,
} from '../../shared/daily-word.js';
import { GUESSES } from '../../shared/daily-word-guesses.js';
import type { DailyWordMark } from '../models/types.js';

/** The answer list as it was made; see 'keeps the answers in their puzzle order'. */
const ANSWERS_HASH = 'f974fb0b948bb56a';

/** "c.p.a" shorthand: correct, present, absent. */
const marks = (code: string): DailyWordMark[] =>
  [...code].map((c) =>
    c === 'c' ? 'correct' : c === 'p' ? 'present' : 'absent',
  );

describe('marking a guess', () => {
  it('marks a letter in its place, elsewhere, or not in the word', () => {
    expect(markGuess('stare', 'plant')).toEqual(marks('apcaa'));
    expect(markGuess('plant', 'plant')).toEqual(marks('ccccc'));
  });

  it('counts a letter in its right place first', () => {
    // CRANE has one E, and the last E of EERIE is in its place.
    expect(markGuess('eerie', 'crane')).toEqual(marks('aapac'));
  });

  it('marks a letter as many times as the answer has it, and no more', () => {
    expect(markGuess('erase', 'speed')).toEqual(marks('paapp'));
    expect(markGuess('babes', 'abbey')).toEqual(marks('ppcca'));
    expect(markGuess('geese', 'those')).toEqual(marks('aaacc'));
  });

  it('is found when every mark is correct', () => {
    expect(isFound(marks('ccccc'))).toBe(true);
    expect(isFound(marks('ccccp'))).toBe(false);
    expect(isFound([])).toBe(false);
  });
});

describe('checking a guess', () => {
  it('takes any valid word not guessed before', () => {
    expect(checkGuess('crane', [])).toBeNull();
    expect(checkGuess('xylem', ['crane'])).toBeNull();
  });

  it('turns back a short row, a non-word and a repeat', () => {
    expect(checkGuess('cran', [])).toBe('tooShort');
    expect(checkGuess('blant', [])).toBe('notAWord');
    expect(checkGuess('crane', ['stare', 'crane'])).toBe('alreadyGuessed');
  });
});

describe('the keyboard', () => {
  it('shows the best mark each letter has had', () => {
    const known = keyMarks([
      { word: 'stare', marks: marks('apcaa') },
      { word: 'giant', marks: marks('aaccc') },
    ]);
    expect(known.get('t')).toBe('correct');
    expect(known.get('a')).toBe('correct');
    expect(known.get('s')).toBe('absent');
    expect(known.has('p')).toBe(false);
  });
});

describe('the word lists', () => {
  it('has five lowercase letters in every word, each once', () => {
    for (const list of [ANSWERS, GUESSES]) {
      expect(list.every((word) => /^[a-z]{5}$/.test(word))).toBe(true);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('accepts every answer as a guess', () => {
    expect(ANSWERS.every(isValidGuess)).toBe(true);
    expect(GUESSES.length).toBeGreaterThan(ANSWERS.length * 4);
  });

  // The answer list is the calendar: every day's word is its position. This
  // pins it, so a reordered or shortened list fails here rather than silently
  // changing the word of every day to come. Replacing an unfit word in place
  // is deliberate: update the hash with it.
  it('keeps the answers in their puzzle order', () => {
    expect(ANSWERS).toHaveLength(1982);
    expect(ANSWERS.slice(0, 3)).toEqual(['pithy', 'alias', 'whiff']);
    expect(
      createHash('sha256').update(ANSWERS.join(' ')).digest('hex').slice(0, 16),
    ).toBe(ANSWERS_HASH);
  });
});

describe('the daily word', () => {
  it('counts puzzles by the local date, from 5 October 2026', () => {
    expect(puzzleNumber(new Date(2026, 9, 5, 0, 0))).toBe(1);
    expect(puzzleNumber(new Date(2026, 9, 5, 23, 59))).toBe(1);
    expect(puzzleNumber(new Date(2026, 9, 6, 0, 0))).toBe(2);
    expect(puzzleNumber(new Date(2026, 9, 16, 12, 0))).toBe(12);
    // Across a change to or from daylight saving time, a day is still a day.
    expect(puzzleNumber(new Date(2026, 10, 2, 1, 0))).toBe(29);
    expect(puzzleNumber(new Date(2027, 2, 30, 1, 0))).toBe(177);
  });

  it('plays the first puzzle on a clock set before it', () => {
    expect(puzzleNumber(new Date(2020, 0, 1))).toBe(1);
  });

  it('goes by the UTC date on the server', () => {
    expect(utcPuzzleNumber(new Date(Date.UTC(2026, 9, 5, 23, 59)))).toBe(1);
    expect(utcPuzzleNumber(new Date(Date.UTC(2026, 9, 6, 0, 0)))).toBe(2);
  });

  it('deals entry n − 1, and starts the list again after the last', () => {
    expect(dailyAnswer(1)).toBe(ANSWERS[0]);
    expect(dailyAnswer(12)).toBe(ANSWERS[11]);
    expect(dailyAnswer(ANSWERS.length + 1)).toBe(ANSWERS[0]);
  });

  it('counts down to the next local midnight', () => {
    expect(msUntilNextPuzzle(new Date(2026, 9, 16, 23, 0))).toBe(3_600_000);
    expect(msUntilNextPuzzle(new Date(2026, 9, 16, 0, 0))).toBe(86_400_000);
  });
});

describe('practice words and rooms', () => {
  it('deals the same practice word from the same seed', () => {
    expect(practiceAnswer('k3f9x2')).toBe(practiceAnswer('k3f9x2'));
    expect(ANSWERS).toContain(practiceAnswer('k3f9x2'));
  });

  it('gives a room different words, never a daily word near today', () => {
    const now = new Date(Date.UTC(2026, 9, 16, 12));
    const today = utcPuzzleNumber(now);
    const neighbours = [today - 1, today, today + 1].map(dailyAnswer);
    // A source that offers the neighbours first, then each word twice.
    const offered = [...neighbours, 'ghost', 'ghost', 'flame', 'brick'];
    let next = 0;
    const random = () =>
      (ANSWERS.indexOf(offered[next++]!) + 0.5) / ANSWERS.length;

    expect(roomWords(random, 3, now)).toEqual(['ghost', 'flame', 'brick']);
  });
});

describe('scoring a found word', () => {
  it('is 100 for every guess left over, plus up to 50 for the time', () => {
    expect(pointsForFind(3, 74_000, 120_000)).toBe(431);
    expect(pointsForFind(4, 52_000, 120_000)).toBe(322);
    expect(pointsForFind(5, 18_000, 120_000)).toBe(208);
    expect(pointsForFind(6, 1_000, 120_000)).toBe(100);
    expect(pointsForFind(1, 120_000, 120_000)).toBe(650);
    expect(pointsForFind(6, -5, 120_000)).toBe(100);
  });

  it('always pays one guess fewer more than any speed', () => {
    expect(pointsForFind(3, 0, 120_000)).toBeGreaterThan(
      pointsForFind(4, 120_000, 120_000),
    );
  });
});

describe('sharing a result', () => {
  const rows = [marks('apcaa'), marks('acaaa'), marks('aaccc'), marks('ccccc')];

  it('is the game, the guesses, a grid with no letters, and a link', () => {
    expect(
      shareText(
        'Daily Word #12',
        rows,
        'https://zumpo.ryangan.me/games/daily-word/solo',
      ),
    ).toBe(
      [
        'Daily Word #12 4/6',
        '',
        '⬜🟠🟩⬜⬜',
        '⬜🟩⬜⬜⬜',
        '⬜⬜🟩🟩🟩',
        '🟩🟩🟩🟩🟩',
        'https://zumpo.ryangan.me/games/daily-word/solo',
      ].join('\n'),
    );
  });

  it('says X for a missed word', () => {
    const missed = Array.from({ length: 6 }, () => marks('accca'));
    expect(shareText('Daily Word #13', missed, 'link').split('\n')[0]).toBe(
      'Daily Word #13 X/6',
    );
    expect(markGrid([marks('ppa')])).toBe('🟠🟠⬜');
  });
});
