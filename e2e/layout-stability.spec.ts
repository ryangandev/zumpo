import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * Nothing jumps and nothing scrolls that need not: a laptop window shows a
 * solo game without a scrollbar, a card that grows grows downward, and a
 * phone's turn bar stays put from a hand to the skipped screen.
 */

/** The page, its fonts loaded, so no text reflows after a measurement. */
async function settled(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('main')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const turnBarTop = (page: Page) =>
  page
    .getByRole('region', { name: 'Turn' })
    .evaluate((element) => element.getBoundingClientRect().top);

test('a solo game fits a 1440 by 900 window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const game of ['trios', 'snap']) {
    await settled(page, `/games/${game}/solo`);
    await expect(page.getByRole('region', { name: 'Turn' })).toBeVisible();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.documentElement.scrollHeight -
              document.documentElement.clientHeight,
          ),
        { message: game },
      )
      .toBe(0);
  }
});

test('More options grows the card down, not up', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await settled(page, '/games/pairs/new');
  const form = page.locator('form');
  const before = (await form.boundingBox())!.y;
  const more = page.getByRole('button', { name: 'More options' });
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await form.boundingBox())!.y).toBe(before);
});

test('a phone keeps the turn bar from a hand to the skipped screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await settled(page, '/games/make-24/solo');
  const before = await turnBarTop(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible();
  await expect.poll(() => turnBarTop(page)).toBe(before);
});

test('Next hand stays reachable on a landscape phone', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await settled(page, '/games/make-24/solo');
  await page.getByRole('button', { name: 'Skip' }).click();
  const next = page.getByRole('button', { name: 'Next hand' });
  await expect(next).toBeVisible();
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeInViewport({ ratio: 1 });
  await next.click();
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
});
