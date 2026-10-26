import { getRandomInt } from '../../libs/utils.js';
import type { WordBank, WordCategory } from '../../libs/word-bank.js';
import { itemAt } from '../../../shared/list.js';

/**
 * Picking words and hiding them.
 *
 * All four of these used to live in `libs/utils.ts`, which is where a helper
 * goes when there is only one game to belong to. A row of underscores is not a
 * general-purpose utility; it is how Draw & Guess shows a word it is not ready
 * to show.
 */

const getRandomCategory = (
  wordBank: WordBank,
): { name: WordCategory; words: string[] } => {
  const categoryList = Object.keys(wordBank) as WordCategory[];
  const randomCategoryIndex = getRandomInt(0, categoryList.length);
  const name = categoryList[randomCategoryIndex]!;

  return { name, words: wordBank[name] };
};

const getRandomChoicesFromList = (
  wordList: string[],
  numberOfChoices: number,
): string[] => {
  // Asking for more distinct choices than the list can supply would spin
  // forever, taking the whole server with it.
  const target = Math.min(numberOfChoices, wordList.length);
  const selectedIndexes = new Set<number>();

  while (selectedIndexes.size < target) {
    selectedIndexes.add(getRandomInt(0, wordList.length));
  }

  return [...selectedIndexes].map((index) => itemAt(wordList, index));
};

/**
 * The row of underscores everyone but the drawer sees, with `revealed`
 * character positions filled in.
 *
 * Spacing is kept as it is in the word, so "Ice Cream" hints as "___ _____"
 * and a two-word answer looks like one.
 */
const buildWordHint = (
  word: string,
  revealed?: ReadonlySet<number>,
): string => {
  return [...word]
    .map((character, index) => {
      if (/\s/.test(character)) return character;
      return revealed?.has(index) ? character : '_';
    })
    .join('');
};

/** The positions in a word that a hint could reveal - everything but spaces. */
const revealablePositions = (word: string): number[] => {
  return [...word].flatMap((character, index) =>
    /\s/.test(character) ? [] : [index],
  );
};

/**
 * Whether a guess is the word, as a correct guess is matched: ignoring case
 * and the spaces around it.
 */
const isCorrectGuess = (guess: string, word: string): boolean =>
  guess.trim().toLowerCase() === word.trim().toLowerCase();

/**
 * A guess or the word as closeness compares them: as a correct guess is
 * matched, and with the spaces and hyphens inside dropped too, so "icecream"
 * is next to "Ice Cream".
 */
const squashed = (text: string): string[] => [
  ...text
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, ''),
];

/**
 * How many single edits turn one into the other, where an edit inserts,
 * deletes or changes a letter, or swaps two letters side by side, and no
 * letter is edited twice (the optimal string alignment distance).
 */
const editDistance = (a: readonly string[], b: readonly string[]): number => {
  // rows[i][j]: the distance between the first i letters of a and j of b.
  const rows = Array.from({ length: a.length + 1 }, (_row, i) =>
    Array.from({ length: b.length + 1 }, (_cell, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  const at = (i: number, j: number): number => rows[i]![j]!;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const change = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        at(i - 1, j) + 1,
        at(i, j - 1) + 1,
        at(i - 1, j - 1) + change,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      rows[i]![j] = best;
    }
  }
  return at(a.length, b.length);
};

/**
 * How many edits away a guess may be and still be close: none for a word of
 * under four letters, where one edit is a different word as often as not,
 * one up to seven letters, and two from eight.
 */
const closeAllowance = (letters: number): number =>
  letters < 4 ? -1 : letters < 8 ? 1 : 2;

/**
 * Whether a wrong guess nearly is the word: a letter or two off it, once case,
 * spaces and hyphens are set aside. A guess that only drops a space or a
 * hyphen ("icecream", "ice-cream" for "Ice Cream") is close, not correct.
 * Call it only for a guess `isCorrectGuess` refused.
 */
const isCloseGuess = (guess: string, word: string): boolean => {
  const answer = squashed(word);
  const allowance = closeAllowance(answer.length);
  if (allowance < 0) return false;
  const attempt = squashed(guess);
  // Every letter more or fewer is an edit, so a far longer or shorter guess
  // is not close, however long it would take to measure.
  if (Math.abs(attempt.length - answer.length) > allowance) return false;
  return editDistance(attempt, answer) <= allowance;
};

export {
  getRandomCategory,
  getRandomChoicesFromList,
  buildWordHint,
  revealablePositions,
  isCorrectGuess,
  isCloseGuess,
};
