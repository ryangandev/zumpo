/**
 * Reading a list where the index is known to be in range: a random pick, a
 * place from a loop's own bounds, a position the rules guarantee. TypeScript
 * cannot see that, so an index read is `T | undefined`; these say "it is
 * there" once, and throw if it is not, which is a bug, rather than letting an
 * `undefined` travel on as if it were a card or a letter.
 */

/** The item at `index`, which must be in range. */
export function itemAt<T>(list: ArrayLike<T>, index: number): T {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    throw new RangeError(`No item ${index} in a list of ${list.length}.`);
  }
  return list[index] as T;
}

/** The character at `index` of `text`, which must be in range. */
export function charAt(text: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= text.length) {
    throw new RangeError(`No character ${index} in a text of ${text.length}.`);
  }
  return text.charAt(index);
}

/** A random item of a list that must not be empty. */
export function pickFrom<T>(list: readonly T[], random: () => number): T {
  return itemAt(list, Math.floor(random() * list.length));
}

/** Swaps two items of a list in place; both indexes must be in range. */
export function swap<T>(list: T[], i: number, j: number): void {
  const first = itemAt(list, i);
  list[i] = itemAt(list, j);
  list[j] = first;
}

/** A shuffled copy of a list, Fisher-Yates, drawing from `random`. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    swap(shuffled, i, j);
  }
  return shuffled;
}
