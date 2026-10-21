import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * A desktop window with classic scrollbars (Windows, Linux), which the
 * headless browser hides unless asked: a page keeps its width when a
 * scrollbar comes, and a dialog's backdrop dims the gutter too.
 */
test.use({
  launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
});

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 641, height: 800 },
];

async function settled(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('main')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Where the header ends, and the width the page has beside its scrollbar. */
const edges = (page: Page) =>
  page.evaluate(() => ({
    right: document.querySelector('header')!.getBoundingClientRect().right,
    client: document.documentElement.clientWidth,
  }));

for (const size of WIDTHS) {
  test(`daily word and snap keep their width at ${size.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    const rights: number[] = [];
    for (const game of ['daily-word', 'snap']) {
      await settled(page, `/games/${game}/solo`);
      const before = await edges(page);
      // Taller than the window, as a game that grows is.
      await page.evaluate(() => {
        document.body.style.minHeight = '3000px';
      });
      await expect
        .poll(() => edges(page).then((e) => e.right))
        .toBe(before.right);
      // The gutter is there whether or not the page scrolls.
      expect((await edges(page)).client).toBeLessThan(size.width);
      rights.push(before.right);
    }
    expect(rights[0]).toBe(rights[1]);
  });
}

test('a dialog dims the gutter beside it', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await settled(page, '/games/pairs/solo');
  const gutter = () =>
    page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );
  const plain = await gutter();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(gutter).not.toBe(plain);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(gutter).toBe(plain);
});
