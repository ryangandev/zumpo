import type { Page } from '@playwright/test';
import { expect, labelsIn } from '../fixtures';

/*
 * Playing Liar's Dice from a player's own page: what they can see of the
 * table, and a sensible move from it. No page is ever told another player's
 * dice, so neither is this.
 */

interface Bid {
  count: number;
  face: number;
}

/** Told it is their turn to bid or call. */
export const yourTurn = (page: Page) =>
  page.getByRole('region', { name: 'Turn' }).getByText('Your turn');

/** Whoever is told it is their turn, if anybody is. */
export async function whoseTurn(pages: readonly Page[]): Promise<Page | null> {
  for (const page of pages) {
    if (await yourTurn(page).isVisible()) return page;
  }
  return null;
}

/** This round's bids, once anybody has bid. */
export const bidsOf = (page: Page) =>
  page.getByRole('region', { name: 'Bids this round' });

/** How many bids this round has seen, as chips ("Leo: 5 × 5"). */
export const bidCount = (page: Page) =>
  bidsOf(page).locator('[aria-label*=" × "]').count();

/** The bid in front of the player, as its chip reads ("Leo: 5 × 5"). */
export async function latestBid(page: Page): Promise<Bid | null> {
  const bids = bidsOf(page);
  if (!(await bids.isVisible())) return null;
  const label = await bids
    .locator('[aria-label*=" × "]')
    .last()
    .getAttribute('aria-label');
  const match = /(\d+) × (\d)$/.exec(label ?? '');
  return match ? { count: Number(match[1]), face: Number(match[2]) } : null;
}

/** The player's own dice, face up in their cup. */
export async function ownDice(page: Page): Promise<number[]> {
  const labels = await labelsIn(
    page.getByRole('region', { name: /\(you\)$/ }),
    '[role="img"]',
  );
  // A one shows as wild while bidding: "1, wild".
  return labels
    .filter((label) => /^[1-6](, wild)?$/.test(label))
    .map((label) => Number(label[0]));
}

/** How many of the player's own dice count towards `face`, ones being wild. */
const held = (dice: readonly number[], face: number) =>
  dice.filter((die) => die === face || die === 1).length;

/**
 * Whether the bid in front of the player is sure to stand on their own dice
 * alone, so calling Liar on it is sure to cost them a die.
 */
export async function bidSurelyStands(page: Page): Promise<boolean> {
  const bid = await latestBid(page);
  return bid !== null && held(await ownDice(page), bid.face) >= bid.count;
}

/**
 * Waits for the move to land and the turn to pass, so the next look at the
 * table never finds the same turn and acts on it twice.
 */
async function moved(page: Page) {
  await expect(yourTurn(page)).toBeHidden();
}

export async function callLiar(page: Page) {
  await page.getByRole('button', { name: 'Call Liar' }).click();
  await moved(page);
}

/** The smallest raise the picker opens on, or Liar when no raise is left. */
async function raise(page: Page): Promise<'bid' | 'call'> {
  const bid = page.getByRole('button', { name: /^Bid / });
  if (!(await bid.isVisible())) {
    await callLiar(page);
    return 'call';
  }
  await bid.click();
  await moved(page);
  return 'bid';
}

/**
 * A sensible move: Liar on a bid more than the player's own dice and a third
 * of everybody else's would make, otherwise the smallest raise.
 */
export async function move(page: Page): Promise<'bid' | 'call'> {
  const bid = await latestBid(page);
  if (bid) {
    const hidden = await page.getByRole('img', { name: 'Hidden die' }).count();
    if (bid.count > held(await ownDice(page), bid.face) + hidden / 3 + 0.5) {
      await callLiar(page);
      return 'call';
    }
  }
  return raise(page);
}

/** Sets the picker to `count` dice showing `face`, from where it opened. */
export async function pickBid(page: Page, count: number, face: number) {
  await page.getByRole('radio', { name: `${face}s`, exact: true }).click();
  const shown = page.getByRole('status', { name: 'How many' });
  for (let more = count - Number(await shown.textContent()); more > 0; more--) {
    await page.getByRole('button', { name: 'More' }).click();
  }
}

/** A bid on every die on the table showing one face: somebody will call it. */
export async function bluff(page: Page) {
  const more = page.getByRole('button', { name: 'More' });
  while ((await more.isVisible()) && (await more.isEnabled())) {
    await more.click();
  }
  await raise(page);
}
