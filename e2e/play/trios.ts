import type { Page } from '@playwright/test';
import {
  cardName,
  DECK_SIZE,
  findTrios,
  isTrio,
  TABLE_SIZE,
} from '../../shared/trios.js';
import { expect, labelsIn } from '../fixtures';

/** Playing Trios as a player does: by what the cards' labels say. */

/** Every card's name, as its label starts: "Two blue striped triangles". */
const CARD_BY_NAME = new Map(
  Array.from({ length: DECK_SIZE }, (_, card) => [cardName(card), card]),
);

/** Every place on the table, in order. */
const PLACES = Array.from({ length: TABLE_SIZE }, (_, place) => place);

/** The cards on the table, place by place, read from their labels. */
export async function tableOf(page: Page): Promise<number[]> {
  const labels = await labelsIn(
    page.getByRole('group', { name: 'Table' }),
    ':scope > [aria-label]',
  );
  return labels.map((label) => {
    const card = CARD_BY_NAME.get(label.split(',')[0]!);
    if (card === undefined) throw new Error(`No card is called "${label}"`);
    return card;
  });
}

/** Picks the cards at `places`, one at a time, as a hand does. */
export async function pickPlaces(page: Page, places: readonly number[]) {
  const cards = page
    .getByRole('group', { name: 'Table' })
    .locator(':scope > [aria-label]');
  for (const place of places) await cards.nth(place).click();
}

/** Picks a trio on the table and returns its cards. */
export async function pickTrio(page: Page): Promise<number[]> {
  const table = await tableOf(page);
  const trio = trioOn(table);
  await pickPlaces(page, trio);
  return trio.map((place) => table[place]!);
}

/** The places of the first trio on a table. */
export function trioOn(table: readonly number[]): number[] {
  const [trio] = findTrios(table);
  if (!trio) throw new Error('No trio on the table');
  return [...trio];
}

/** Picks three cards that are not a trio, and returns their places. */
export async function pickMiss(page: Page): Promise<number[]> {
  const miss = missWith(await tableOf(page), [0, 1]);
  await pickPlaces(page, miss);
  return miss;
}

/**
 * The places of a miss that starts with the two at `pair`, its third card
 * taken in the order of `thirds` (every other place by default).
 */
export function missWith(
  table: readonly number[],
  pair: readonly [number, number],
  thirds: readonly number[] = PLACES,
): number[] {
  const third = thirds.find(
    (place) =>
      !pair.includes(place) &&
      !isTrio(table[pair[0]]!, table[pair[1]]!, table[place]!),
  );
  if (third === undefined) throw new Error('Every third card makes a trio');
  return [...pair, third];
}

/** The first of `wanted` places, two of them, that leave out `trio`. */
export function twoBesides(
  trio: readonly number[],
  wanted: readonly number[] = PLACES,
): [number, number] {
  const [a, b] = [...wanted, ...PLACES].filter(
    (place, index, all) =>
      !trio.includes(place) && all.indexOf(place) === index,
  );
  return [a!, b!];
}

/** The turn bar, which says what to do and what just happened. */
export const turnOf = (page: Page) =>
  page.getByRole('region', { name: 'Turn' });

/** Waits until the player can pick again: every card on the table takes a pick. */
export async function readyToFind(page: Page) {
  await expect(
    page.getByRole('group', { name: 'Table' }).getByRole('button'),
  ).toHaveCount(12);
}
