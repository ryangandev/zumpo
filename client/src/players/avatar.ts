import { itemAt } from '../../../shared/list';
import { AVATAR_TONES, type AvatarTone } from '../ui';

const nameGraphemes = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});
const graphemesOf = (word: string) =>
  Array.from(nameGraphemes.segment(word), ({ segment }) => segment);

/**
 * Up to two letters for an avatar: the first letters of the first two words,
 * or the first two graphemes of a single word. One grapheme stays one, and
 * combining marks and joined emoji stay whole alongside CJK characters.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? words.slice(0, 2).flatMap((word) => graphemesOf(word).slice(0, 1))
      : graphemesOf(words[0] ?? '').slice(0, 2);
  return letters.join('').toLocaleUpperCase();
}

/**
 * A player's colour, from their name: the same everywhere they appear, the
 * header included, which knows the name before the server knows the player.
 */
export function toneOf(name: string): AvatarTone {
  let hash = 0;
  for (const char of name.trim()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return itemAt(AVATAR_TONES, hash % AVATAR_TONES.length);
}
