import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';
import { blackOf, place, turnOf as gomokuTurn } from './play/gomoku';
import { solve } from './play/daily-word';
import { solveHand } from './play/make-24';
import { move, whoseTurn } from './play/liars-dice';
import { pickMiss, readyToFind, turnOf as triosTurn } from './play/trios';

/**
 * A desktop turn bar's hint, often the only instruction on screen, is never
 * cut: it sits beside the main line where it fits, and on a line of its own
 * under the bar width its game's hints need (TurnBar's hintRowBelow, which
 * the bar carries as `data-hint-row-below`). Each check sizes the window so
 * the bar is exactly that wide, where the bar keeps one row, and a pixel
 * narrower, where the hint has its own line, and then tries the windows of
 * every desktop bar, 561 to 929 px; in English and in Chinese, with the
 * longest names a player can choose.
 */
const WINDOWS = [704, 768, 900, 1100, 1280, 1440];

/** 18 characters, the most a name may have. */
const LONG = ['Bartholomew Wilson', 'Maximilian Fischer'] as const;

const SOLO = [
  'trios',
  'snap',
  'pairs',
  'minesweeper',
  'liars-dice',
  'daily-word',
  'code-breaker',
  'make-24',
  'gomoku',
];

/** The bar's box, which carries the game's width. */
const barBox = (page: Page) => page.locator('[data-hint-row-below]').first();

interface Bar {
  width: number;
  below: number;
  row: boolean;
  cut: string[];
}

const read = (page: Page): Promise<Bar> =>
  barBox(page).evaluate((box) => {
    const cut = ['label', 'meta'].flatMap((part) => {
      const el = box.querySelector<HTMLElement>(`[class*="_${part}_"]`);
      return el?.textContent && el.scrollWidth > el.clientWidth
        ? [`${part} "${el.textContent}" ${el.scrollWidth} in ${el.clientWidth}`]
        : [];
    });
    return {
      width: box.clientWidth,
      below: Number(box.getAttribute('data-hint-row-below')),
      row: /rowBelow/.test(box.className),
      cut,
    };
  });

/** Sizes the window until the bar is `width` wide. */
async function barAt(page: Page, width: number) {
  let window = width + 143;
  for (let tries = 0; tries < 5; tries++) {
    await page.setViewportSize({ width: window, height: 900 });
    const bar = await read(page);
    if (bar.width === width) return;
    window += width - bar.width;
  }
  throw new Error(`no window gives a ${width} px bar`);
}

/** The hint is whole at the game's width, a pixel under it, and every window. */
async function hintsWhole(page: Page, at: string) {
  await expect(barBox(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const { below } = await read(page);
  if (below > 0 && Number.isFinite(below)) {
    for (const [width, row] of [
      [below, false],
      [below - 1, true],
    ] as const) {
      await barAt(page, width);
      // The bar takes its line once it has measured its new width.
      await expect
        .poll(async () => (await read(page)).row, {
          message: `${at}: ${row ? 'the hint’s own line' : 'one row'} at ${width} px`,
        })
        .toBe(row);
      expect((await read(page)).cut, `${at} at a ${width} px bar`).toEqual([]);
    }
  }
  for (const width of WINDOWS) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () => (await read(page)).cut, {
        message: `${at} at ${width}`,
      })
      .toEqual([]);
  }
}

/** Checks the bar as it is, in English and then in Chinese. */
async function bothLanguages(page: Page, at: string) {
  await hintsWhole(page, `${at} (en)`);
  await page.getByRole('radio', { name: '中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await hintsWhole(page, `${at} (zh)`);
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** How far the page scrolls, which a room at 1440 by 900 never needs to. */
const pageScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight,
  );

/** Two players with the longest names, in a started room. */
async function room(
  player: (name: string) => Promise<Page>,
  game: Parameters<typeof createRoom>[1],
  settings: Parameters<typeof createRoom>[2] = {},
) {
  const host = await player(LONG[0]);
  const guest = await player(LONG[1]);
  await joinRoom(guest, await createRoom(host, game, settings));
  await expect(host.getByText(LONG[1], { exact: true }).first()).toBeVisible();
  await host.getByRole('button', { name: 'Start game' }).click();
  return [host, guest] as const;
}

test('a solo game’s hint is never cut at a desktop width', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const page = await player('Sam');
  for (const game of SOLO) {
    await page.goto(`/games/${game}/solo`);
    await bothLanguages(page, game);
  }
});

test('a Gomoku room keeps its hints whole and the page still', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const pages = await room(player, 'gomoku');
  const black = await blackOf([...pages]);
  const white = black === pages[0] ? pages[1] : pages[0];
  await expect(gomokuTurn(white).getByText(/is thinking$/)).toBeVisible();
  await bothLanguages(white, 'waiting for Black');
  await place(black, 'D8');
  await expect(gomokuTurn(white).getByText(/played D8$/)).toBeVisible();
  await bothLanguages(white, 'after a move');
  await bothLanguages(black, 'the other’s turn');
  await expect.poll(() => pageScroll(white)).toBe(0);
});

test('a Trios room keeps its hints whole and the page still', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const [host, guest] = await room(player, 'trios', { seats: 2 });
  await readyToFind(guest);
  await expect(triosTurn(guest).getByText('Find a trio')).toBeVisible();
  await bothLanguages(guest, 'searching');
  await expect.poll(() => pageScroll(guest)).toBe(0);
  await pickMiss(host);
  await expect(triosTurn(host).getByText('Not a trio')).toBeVisible();
  await hintsWhole(host, 'locked out');
});

test('a Make 24 room counts who solved it and who it waits for', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const [host, guest] = await room(player, 'make-24');
  await solveHand(host);
  await expect(host.getByText('Waiting for 1 player')).toBeVisible();
  await bothLanguages(host, 'waiting');
  await expect(guest.getByText('1 player solved it')).toBeVisible();
  await bothLanguages(guest, 'racing');
});

test('a Daily Word room counts who found it and who it waits for', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const [host, guest] = await room(player, 'daily-word', { seats: 2 });
  await solve(host);
  await expect(host.getByText('Waiting for 1 player')).toBeVisible();
  await bothLanguages(host, 'waiting');
  await expect(guest.getByText('1 player found it')).toBeVisible();
  await bothLanguages(guest, 'racing');
});

test('a Minesweeper room keeps its hints whole while it waits', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const [host, guest] = await room(player, 'minesweeper');
  await expect(host.getByText('Pick a cell')).toBeVisible();
  await bothLanguages(host, 'picking');
  await host
    .getByRole('gridcell', { name: /: hidden$/, disabled: false })
    .first()
    .click();
  await expect(
    guest.getByRole('region', { name: 'Players' }).getByText('Locked in'),
  ).toBeVisible();
  await bothLanguages(host, 'locked in');
  await bothLanguages(guest, 'the other locked in');
});

test('a Liar’s Dice room keeps its hints whole through a bid', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const pages = await room(player, 'liars-dice', { dice: 3 });
  await expect(pages[0].getByText('Round 1', { exact: true })).toBeVisible();
  await expect.poll(() => whoseTurn([...pages])).not.toBeNull();
  const first = await whoseTurn([...pages]);
  const other = first === pages[0] ? pages[1] : pages[0];
  await bothLanguages(other, 'the other bidding');
  await move(first!);
  await expect.poll(() => whoseTurn([...pages])).toBe(other);
  await bothLanguages(other, 'to beat a bid');
  await bothLanguages(first!, 'after bidding');
});
