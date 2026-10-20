import type { Page } from '@playwright/test';
import { expect, labelsIn } from '../fixtures';

/** Playing Pairs as a player does: by what the cards' labels say. */

interface CardSeen {
  place: string;
  /** "Ring Sky", or null while face down. */
  symbol: string | null;
  matched: boolean;
}

const LABEL = /^(Row \d+, column \d+): (.+?)(, matched)?$/;

/** Every card on the board, as its label reads. */
export async function boardOf(page: Page): Promise<CardSeen[]> {
  const labels = await labelsIn(
    page.getByRole('grid', { name: 'Cards' }),
    '[aria-label^="Row "]',
  );
  return labels.map((label) => {
    const [, place, symbol, matched] = LABEL.exec(label)!;
    return {
      place: place!,
      symbol: symbol === 'face down' ? null : symbol!,
      matched: Boolean(matched),
    };
  });
}

/**
 * What a good player remembers: the symbol at every place they have seen
 * turned over, by anybody.
 */
export type Memory = Map<string, string>;

export async function remember(page: Page, memory: Memory) {
  for (const card of await boardOf(page)) {
    if (card.symbol) memory.set(card.place, card.symbol);
  }
}

/** Turns over the card at `place` and returns its symbol. */
export async function flip(page: Page, place: string, memory: Memory) {
  // A real hand, not a burst: the server takes a few cards a second.
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: `${place}: face down` }).click();
  const shown = page.getByLabel(new RegExp(`^${place}: (?!face down)`));
  await expect(shown).toHaveCount(1);
  await remember(page, memory);
  return memory.get(place)!;
}

/**
 * Two cards: a pair remembered, or something new and its partner if known.
 * `afterFirst` runs with one card up, before the second is turned over.
 * Exploring turns over two cards not known to match, so the turn usually
 * misses and passes on.
 */
export async function playTurn(
  page: Page,
  memory: Memory,
  afterFirst?: () => Promise<void>,
  explore = false,
) {
  // Two cards that did not match stay up for a moment. Choosing while they
  // are up would leave their places out of the choice, and near the end of a
  // board that can miss the same way turn after turn.
  await expect
    .poll(async () =>
      (await boardOf(page)).every((card) => card.matched || !card.symbol),
    )
    .toBe(true);
  await remember(page, memory);
  const down = (await boardOf(page)).filter((card) => !card.symbol);
  const known = down.filter((card) => memory.has(card.place));
  const unseen = down.filter((card) => !memory.has(card.place));
  const pair = known.find((card) =>
    known.some(
      (other) =>
        other !== card && memory.get(other.place) === memory.get(card.place),
    ),
  );
  const first = ((explore ? undefined : pair) ?? unseen[0] ?? down[0])!.place;
  const symbol = await flip(page, first, memory);
  await afterFirst?.();
  const partner =
    (explore
      ? down.find(
          (card) => card.place !== first && memory.get(card.place) !== symbol,
        )
      : down.find(
          (card) => card.place !== first && memory.get(card.place) === symbol,
        )) ??
    unseen.find((card) => card.place !== first) ??
    down.find((card) => card.place !== first)!;
  await flip(page, partner.place, memory);
}

/** Told to flip a card: their turn, with nothing up yet. */
export const yourTurn = (page: Page) =>
  page.getByRole('region', { name: 'Turn' }).getByText('Flip a card');

/** The player told to flip a card, if anybody is. */
export async function whoseTurn(pages: readonly Page[]): Promise<Page | null> {
  for (const page of pages) {
    if (await yourTurn(page).isVisible()) return page;
  }
  return null;
}
