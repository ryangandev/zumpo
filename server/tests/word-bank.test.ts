import { describe, expect, it } from 'vitest';
import { wordBank } from '../libs/word-bank.js';
import { WORD_CATEGORIES } from '../../shared/draw-and-guess.js';

/*
 * The word bank is the game's content, and these are the promises
 * docs/games/draw-and-guess.md makes about it: enough categories to pick
 * from, enough words in each that a game rarely repeats one, every word once,
 * and every word typeable as it is shown.
 */
describe('the word bank', () => {
  const categories = Object.keys(wordBank);
  const words = Object.values(wordBank).flat();

  it('has fifteen categories, the ones a room may pick', () => {
    expect(categories).toHaveLength(15);
    expect(categories.toSorted()).toEqual([...WORD_CATEGORIES].toSorted());
  });

  it.each(WORD_CATEGORIES)('has at least 40 words in %s', (category) => {
    expect(wordBank[category].length).toBeGreaterThanOrEqual(40);
  });

  it('has every word once, across all categories, whatever its case', () => {
    const seen = new Map<string, string>();
    const repeats: string[] = [];
    for (const [category, list] of Object.entries(wordBank)) {
      for (const word of list) {
        const key = word.toLowerCase();
        const first = seen.get(key);
        if (first) repeats.push(`${word} (${first}, ${category})`);
        else seen.set(key, category);
      }
    }
    expect(repeats).toEqual([]);
    expect(seen.size).toBe(words.length);
  });

  it('has short words of letters and single spaces, capitalised as shown', () => {
    const odd = words.filter(
      (word) => !/^[A-Z][a-z]*( [A-Z][a-z]*)?$/.test(word) || word.length > 14,
    );
    expect(odd).toEqual([]);
  });
});
