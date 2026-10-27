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
const COMPARED = 553;

test('the design gallery matches Figma', async ({ page }) => {
  await page.goto('/design');
  const specimens = page.locator('figure[data-family]');
  await expect(specimens.first()).toBeVisible();
  const count = await specimens.count();
  // Each specimen measures once its fonts are in and its animations settle.
  await expect(page.locator('figure[data-family][data-measured]')).toHaveCount(
    count,
    { timeout: 30_000 },
  );

  const describe = (selector: string) =>
    page
      .locator(selector)
      .evaluateAll((figures) =>
        figures.map(
          (figure) =>
            `${figure.getAttribute('data-family')}: ${[
              ...figure.querySelectorAll('figcaption > span'),
            ]
              .map((span) => span.textContent)
              .join(', ')}`,
        ),
      );
  expect(await describe('figure[data-mismatch]')).toEqual([]);

  // Every specimen of a Figma family is compared, or says why Figma has no
  // size for it (`uncompared`), so none drops out of the comparison unseen.
  expect(
    await describe(
      'figure[data-family]:not([data-compared]):not([data-uncompared])',
    ),
    'specimens neither compared with Figma nor saying why not',
  ).toEqual([]);

  const compared = await page.locator('figure[data-compared]').count();
  expect(compared, 'specimens compared with Figma').toBe(COMPARED);
});
