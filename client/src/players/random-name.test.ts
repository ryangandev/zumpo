import { describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH } from '../ui';
import { LOCALES } from '../i18n/locale';
import { NAME_WORDS, randomName } from './random-name';

const longest = (list: readonly string[]) =>
  list.toSorted((a, b) => b.length - a.length)[0]!;

describe('a random name', () => {
  it.each(LOCALES)(
    'fits the limit whichever two %s words it gets',
    (locale) => {
      const { adjectives, animals, join } = NAME_WORDS[locale];
      expect(
        join(longest(adjectives), longest(animals)).length,
      ).toBeLessThanOrEqual(NAME_MAX_LENGTH);
    },
  );

  it('is an adjective and an animal', () => {
    const [adjective, animal] = randomName('en').split(' ');
    expect(NAME_WORDS.en.adjectives).toContain(adjective);
    expect(NAME_WORDS.en.animals).toContain(animal);
  });

  it('is Chinese for a Chinese visitor', () => {
    const name = randomName('zh');
    expect(name).toHaveLength(4);
    expect(NAME_WORDS.zh.adjectives).toContain(name.slice(0, 2));
    expect(NAME_WORDS.zh.animals).toContain(name.slice(2));
  });

  it('never repeats the name it replaces', () => {
    // The first pair drawn is the one being replaced; the next is not.
    const draws = [0, 0, 0.5, 0.5];
    const random = () => draws.shift() ?? 0.9;
    const first = `${NAME_WORDS.en.adjectives[0]} ${NAME_WORDS.en.animals[0]}`;
    expect(randomName('en', first, random)).not.toBe(first);
  });
});
