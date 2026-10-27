import { expect, test } from '@playwright/test';

/*
 * Every specimen in the design gallery measures itself against its Figma
 * variant and marks a difference of more than half a pixel with
 * `data-mismatch`; a difference code makes on purpose carries a `deviation`
 * caption instead. So a new mismatch, from a component or from a Figma
 * export, fails here.
 */

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

  const mismatches = await page
    .locator('figure[data-mismatch]')
    .evaluateAll((figures) =>
      figures.map(
        (figure) =>
          `${figure.getAttribute('data-family')}: ${figure.querySelector('figcaption')?.textContent ?? ''}`,
      ),
    );
  expect(mismatches).toEqual([]);
});
