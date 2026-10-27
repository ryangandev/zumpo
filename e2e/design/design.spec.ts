import { expect, test } from '@playwright/test';

/*
 * Every specimen in the design gallery measures itself against its Figma
 * variant and marks a difference of more than half a pixel with
 * `data-mismatch`; a difference code makes on purpose carries a `deviation`
 * with the difference it expects, and is a mismatch outside it. So a new
 * mismatch, from a component or from a Figma export, fails here.
 */

/**
 * How many specimens have a Figma size to compare with (`data-compared`).
 * A specimen whose variant an export renames is still measured but no longer
 * compared, so the count would drop without a mismatch: it only changes on
 * purpose. Raise it when a specimen starts to be compared.
 */
const COMPARED = 557;

/**
 * The specimens Figma has no size for, each captioned with why
 * (`uncompared`), as "family: caption". Like COMPARED it only changes on
 * purpose: when Figma gains a variant one of them could be compared with,
 * compare it and take it off this list.
 */
const UNCOMPARED = [
  'none: Filter chip field: Bots, one choice',
  'notice: Two lines',
  'how-to-play: Dialog: steps only',
  'input: Select: Rounds',
  'input: Select: Word categories, opening a dialog',
  'chat-message: Wrapped',
  'lives: Show label off',
  'letter-key: Disabled',
  'none: Choice list: Board, in the page',
  'card: Kind=Focused',
  'card: Kind=Panel',
  'card: Kind=Panel: stats beside a game',
  'card: Kind=Dialog: opens over the page',
];

test('the design gallery matches Figma', async ({ page }) => {
  await page.goto('/design');
  const specimens = page.locator('figure[data-specimen]');
  await expect(specimens.first()).toBeVisible();
  const measurable = page.locator('figure[data-family]');
  // Each specimen measures once its fonts are in and its animations settle.
  await expect(page.locator('figure[data-family][data-measured]')).toHaveCount(
    await measurable.count(),
    { timeout: 30_000 },
  );

  /** "family: caption", and with `full` every line of the caption. */
  const describe = (selector: string, full = true) =>
    page.locator(selector).evaluateAll(
      (figures, all) =>
        figures.map((figure) => {
          const lines = [...figure.querySelectorAll('figcaption > span')].map(
            (span) => span.textContent,
          );
          return `${figure.getAttribute('data-family') ?? 'none'}: ${(all
            ? lines
            : lines.slice(0, 1)
          ).join(', ')}`;
        }),
      full,
    );
  expect(await describe('figure[data-mismatch]')).toEqual([]);

  // Every specimen is compared, or says why Figma has no size for it, so
  // none drops out of the comparison unseen, a family lost included.
  expect(
    await describe(
      'figure[data-specimen]:not([data-compared]):not([data-uncompared])',
    ),
    'specimens neither compared with Figma nor saying why not',
  ).toEqual([]);
  expect(
    await describe('figure[data-uncompared]', false),
    'specimens not compared with Figma',
  ).toEqual(UNCOMPARED);

  const compared = await page.locator('figure[data-compared]').count();
  expect(compared, 'specimens compared with Figma').toBe(COMPARED);
});
