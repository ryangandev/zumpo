import type { Page } from '@playwright/test';
import { expect, labelsIn } from '../fixtures';

/** Playing Snap as a player does: by what the spots' labels say. */

/** A card on the board, by the start of its name: "Middle card", "Your card". */
export const cardOf = (page: Page, name: string) =>
  page.getByRole('group', { name: new RegExp(`^${name}`) });

/** A card's six symbols, as their spots name them, marks left out. */
export async function symbolsOf(page: Page, name: string): Promise<string[]> {
  const labels = await labelsIn(cardOf(page, name), '[aria-label]');
  return labels.map((label) => label.split(',')[0]!);
}

/** The one symbol your card and the middle card share. */
export async function matchOn(page: Page): Promise<string> {
  const middle = await symbolsOf(page, 'Middle card');
  const mine = await symbolsOf(page, 'Your card');
  const shared = middle.filter((symbol) => mine.includes(symbol));
  if (shared.length !== 1) {
    throw new Error(`The cards share ${shared.length} symbols`);
  }
  return shared[0]!;
}

/** Taps the match on the middle card and returns it. */
export async function tapMatch(page: Page): Promise<string> {
  const match = await matchOn(page);
  await cardOf(page, 'Middle card')
    .getByRole('button', { name: match, exact: true })
    .click();
  return match;
}

/** Taps a symbol on your card that is not on the middle card, and returns it. */
export async function tapMiss(page: Page): Promise<string> {
  const middle = await symbolsOf(page, 'Middle card');
  const miss = (await symbolsOf(page, 'Your card')).find(
    (symbol) => !middle.includes(symbol),
  )!;
  await cardOf(page, 'Your card')
    .getByRole('button', { name: miss, exact: true })
    .click();
  return miss;
}

/** The turn bar, which says what to do and what just happened. */
export const turnOf = (page: Page) =>
  page.getByRole('region', { name: 'Turn' });

/** Waits until the player can tap: every spot on the middle card is enabled. */
export async function readyToTap(page: Page) {
  await expect(
    cardOf(page, 'Middle card').getByRole('button', { disabled: false }),
  ).toHaveCount(6);
}
