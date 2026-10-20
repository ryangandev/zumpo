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

export {
  getRandomCategory,
  getRandomChoicesFromList,
  buildWordHint,
  revealablePositions,
};
