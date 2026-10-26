import { getRandomInt } from '../../libs/utils.js';
import type { WordBank, WordCategory } from '../../libs/word-bank.js';
import { itemAt } from '../../../shared/list.js';

/**
 * Picking words, hiding them, and matching guesses to them.
 *
 * The first four of these used to live in `libs/utils.ts`, which is where a helper
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
 * The words of a guess or of the word, as closeness reads them: full-width
 * and other compatibility forms folded to plain ones (NFKC), case set aside,
 * and every character but a letter, a digit or a space read as a space, so
 * "ｔｕｒｔｌｅ" is "turtle" and "turtle!!" or "ice-cream" splits into words.
 */
const wordsOf = (text: string): string[] =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Whether `run` appears in `words` as consecutive whole words. */
const containsRun = (words: readonly string[], run: readonly string[]) =>
  run.length > 0 &&
  words.some((_word, start) =>
    run.every((part, offset) => words[start + offset] === part),
  );

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
 * Whether a wrong guess nearly is the word, or carries it, so the room must
 * not read it. It is close when either holds:
 *
 * - Read as `wordsOf` reads it, with the spaces dropped, it is a letter or two
 *   off the word (`closeAllowance`), so "turtel", "turtle!!", "a turtle?" and
 *   "icecream" for "Ice Cream" are close. A word under four letters is never
 *   close this way.
 * - Its words hold the word's words in a row, whatever the word's length, so
 *   "i think its a turtle" and "turtle turtle" are close, and so is "a dog?"
 *   for "Dog".
 *
 * Call it only for a guess `isCorrectGuess` refused.
 */
const isCloseGuess = (guess: string, word: string): boolean => {
  const answer = wordsOf(word);
  const attempt = wordsOf(guess);
  if (containsRun(attempt, answer)) return true;

  const answerLetters = [...answer.join('')];
  const allowance = closeAllowance(answerLetters.length);
  if (allowance < 0) return false;
  const attemptLetters = [...attempt.join('')];
  // Every letter more or fewer is an edit, so a far longer or shorter guess
  // is not close, however long it would take to measure.
  if (Math.abs(attemptLetters.length - answerLetters.length) > allowance) {
    return false;
  }
  return editDistance(attemptLetters, answerLetters) <= allowance;
};

export {
  getRandomCategory,
  getRandomChoicesFromList,
  buildWordHint,
  revealablePositions,
  isCorrectGuess,
  isCloseGuess,
};
