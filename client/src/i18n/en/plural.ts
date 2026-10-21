/** "1 round", "2 rounds". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A clock as the settings say it: "3 minutes" for whole minutes, else "45 seconds". */
export function duration(seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0
    ? plural(seconds / 60, 'minute')
    : plural(seconds, 'second');
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

/** "Four", for the start of a sentence; past six, the number. */
export function countWord(count: number): string {
  return WORDS[count] ?? String(count);
}
