import type { Page } from '@playwright/test';
import {
  combine,
  dealtCards,
  isTarget,
  OPERATORS,
  type Card,
  type Fraction,
  type Operator,
  type Step,
} from '../../shared/make-24.js';
import { expect } from '../fixtures';

/** Playing Make 24 as a player does: by the cards and signs on the table. */

export const SIGNS: Readonly<Record<Operator, string>> = {
  '+': 'plus',
  '-': 'minus',
  '*': 'times',
  '/': 'divided by',
};

/**
 * Steps that use every card and end on a value `accept` takes, found the
 * long way: sums first, so a miss reads as a player's first try would.
 */
function stepsTo(
  cards: readonly Card[],
  accept: (value: Fraction) => boolean,
): Step[] | null {
  if (cards.length === 1) return accept(cards[0]!.value) ? [] : null;
  for (let left = 0; left < cards.length; left++) {
    for (let right = 0; right < cards.length; right++) {
      for (const op of OPERATORS) {
        const step = { left, op, right };
        const next = left === right ? null : combine(cards, step);
        const rest = next && stepsTo(next, accept);
        if (rest) return [step, ...rest];
      }
    }
  }
  return null;
}

/** Steps that make 24 from `cards`. */
export const stepsToSolve = (cards: readonly Card[]) =>
  stepsTo(cards, isTarget);

/** Steps that use every card and end on a whole number that is not 24. */
const stepsToMiss = (cards: readonly Card[]) =>
  stepsTo(cards, (value) => value.d === 1 && value.n > 0 && !isTarget(value));

/** The cards on the table: the toggles that are not signs. */
export const cardsOn = (page: Page) =>
  page.locator(
    'xpath=//button[@aria-pressed][not(ancestor::*[@aria-label="Signs"])]',
  );

/** The hand dealt, read off a fresh table. */
async function dealOn(page: Page): Promise<number[]> {
  const cards = cardsOn(page);
  await expect(cards).toHaveCount(4);
  return (await cards.allTextContents()).map(Number);
}

/** A card and a sign: the first half of a step. */
async function choose(page: Page, step: Step) {
  await cardsOn(page).nth(step.left).click();
  await page.getByRole('button', { name: SIGNS[step.op] }).click();
}

async function take(page: Page, steps: readonly Step[]) {
  for (const step of steps) {
    await choose(page, step);
    await cardsOn(page).nth(step.right).click();
  }
}

/** Reads the hand dealt, then makes 24 from it a card and a sign at a time. */
export async function solveHand(page: Page) {
  const deal = await dealOn(page);
  const steps = stepsToSolve(dealtCards(deal));
  expect(steps, `a way to make 24 from ${deal.join(' ')}`).not.toBeNull();
  await take(page, steps!);
}

/** Uses every card and ends on some other number. */
export async function missHand(page: Page) {
  const deal = await dealOn(page);
  const steps = stepsToMiss(dealtCards(deal));
  expect(steps, `a way to miss 24 from ${deal.join(' ')}`).not.toBeNull();
  await take(page, steps!);
}

/**
 * A hand in play: one step taken on the way to 24, then the next card and
 * sign chosen, waiting for the second card.
 */
export async function startHand(page: Page) {
  const deal = await dealOn(page);
  const [first, second] = stepsToSolve(dealtCards(deal))!;
  await take(page, [first!]);
  await choose(page, second!);
}
