import { expect, test } from '@playwright/test';

/**
 * Nothing jumps and nothing scrolls that need not: a laptop window shows a
 * solo game without a scrollbar, a card that grows grows downward, and a
 * phone's turn bar stays put from a hand to the skipped screen.
 */

test('a solo game fits a 1440 by 900 window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const game of ['trios', 'snap']) {
    await page.goto(`/games/${game}/solo`);
    await expect(page.getByRole('main')).toBeVisible();
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      client: document.documentElement.clientHeight,
    }));
    expect(scroll, game).toBe(client);
  }
});

test('More options grows the card down, not up', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games/pairs/new');
  const card = page.getByRole('form').or(page.locator('form')).first();
  const before = (await card.boundingBox())!.y;
  await page.getByRole('button', { name: 'More options' }).click();
  expect((await card.boundingBox())!.y).toBe(before);
});

test('a phone keeps the turn bar from a hand to the skipped screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/games/make-24/solo');
  const bar = page.locator('main > div > div > div').first();
  const before = (await bar.boundingBox())!.y;
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible();
  expect((await bar.boundingBox())!.y).toBe(before);
});
