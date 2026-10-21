/** "1 round", "2 rounds". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

/** "Four", for the start of a sentence; past six, the number. */
export function countWord(count: number): string {
  return WORDS[count] ?? String(count);
}

/** "Ana", "Ana and Ben", "Ana, Ben and Cam". */
export function andList(items: readonly string[]): string {
  return items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
