import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';
import { blackOf, turnOf as gomokuTurn } from './play/gomoku';
import { readyToFind, turnOf as triosTurn } from './play/trios';

/**
 * A desktop turn bar's hint, often the only instruction on screen, is never
 * cut: it sits beside the main line where it fits, and on a line of its own
 * under the width its game's hints need (TurnBar's hintRowBelow). These are
 * the windows at the layouts' desktop bar widths, 561 to 929 px.
 */
const WINDOWS = [704, 768, 900, 1100, 1280, 1440];

const SOLO = ['trios', 'snap', 'pairs', 'minesweeper', 'liars-dice'];

/** The turn bar, by its name in either language. */
const turnBar = (page: Page) =>
  page.getByRole('region', { name: /^(Turn|当前回合)$/ }).first();

/** The hint's width and the width its words need, or null without one. */
const hintOf = (page: Page) =>
  turnBar(page).evaluate((bar) => {
    const meta = bar.querySelector<HTMLElement>('[class*="_meta_"]');
    if (!meta?.textContent) return null;
    return {
      text: meta.textContent,
      shown: meta.clientWidth,
      needs: meta.scrollWidth,
    };
  });

/** Every window keeps the hint whole; `at` names what is on screen. */
async function hintsWhole(page: Page, at: string) {
  for (const width of WINDOWS) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(
        async () => {
          const hint = await hintOf(page);
          return hint === null || hint.needs <= hint.shown ? 'whole' : hint;
        },
        { message: `${at} at ${width}` },
      )
      .toBe('whole');
  }
}

/** How far the page scrolls, which a room at 1440 by 900 never needs to. */
const pageScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight,
  );

for (const locale of ['en', 'zh'] as const) {
  test(`a solo game's hint is never cut at a desktop width (${locale})`, async ({
    player,
  }) => {
    const page = await player('Maya', { locale });
    for (const game of SOLO) {
      await page.goto(`/games/${game}/solo`);
      await expect(turnBar(page)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await hintsWhole(page, game);
    }
  });
}

test('a Gomoku room keeps its hint whole and the page still', async ({
  player,
}) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'gomoku'));
  await expect(maya.getByText('Leo', { exact: true }).first()).toBeVisible();
  await maya.getByRole('button', { name: 'Start game' }).click();
  const black = await blackOf([maya, leo]);
  const white = black === maya ? leo : maya;
  await expect(gomokuTurn(white).getByText(/is thinking$/)).toBeVisible();

  await hintsWhole(white, 'Gomoku');
  await white.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => pageScroll(white)).toBe(0);
});

test('a Trios room keeps its hint whole and the page still', async ({
  player,
}) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'trios', { seats: 2 }));
  await maya.getByRole('button', { name: 'Start game' }).click();
  await readyToFind(leo);
  await expect(triosTurn(leo).getByText('Find a trio')).toBeVisible();

  await hintsWhole(leo, 'Trios');
  await leo.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => pageScroll(leo)).toBe(0);
});
