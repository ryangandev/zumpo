import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';
import { blackOf, place, turnOf as gomokuTurn } from './play/gomoku';
import { solve } from './play/daily-word';
import { solveHand } from './play/make-24';
import { move, whoseTurn } from './play/liars-dice';
import { startServer } from './own-server';
import {
  pickMiss,
  pickTrio,
  readyToFind,
  turnOf as triosTurn,
} from './play/trios';

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
  /** Whether the bar still says its phase's words, where a check names them. */
  showing: boolean;
  /** Whether the bar has the layout its width asks for: the hint row under its game's width. */
  settled: boolean;
}

/** Words a phase's bar says, in each language, to tell it from the next. */
interface Phase {
  en: string;
  zh: string;
}

/**
 * The bar as it stands, read in one step, so a phase that ends between two
 * reads cannot pass for a measured one. A label, main line or meta is cut
 * when its words are wider than its box by any fraction of a pixel: the
 * label and meta then end in an ellipsis, and the main line, scaled to its
 * box (Fit), would run past it. The whole pixels of scrollWidth and
 * clientWidth round a cut of under one away. It waits two frames first, so
 * the bar's and Fit's ResizeObservers have answered the last resize.
 */
const read = (page: Page, phase?: Phase): Promise<Bar> =>
  barBox(page).evaluate(async (box, phase) => {
    for (let frame = 0; frame < 2; frame++) {
      await new Promise((done) => requestAnimationFrame(done));
    }
    const zh = document.documentElement.lang.startsWith('zh');
    const words = phase ? (zh ? phase.zh : phase.en) : '';
    const cut = ['label', 'mainBox', 'meta'].flatMap((part) => {
      const el = box.querySelector<HTMLElement>(`[class*="_${part}_"]`);
      if (!el?.textContent) return [];
      const words = document.createRange();
      words.selectNodeContents(el);
      const needs = words.getBoundingClientRect().width;
      const has = el.getBoundingClientRect().width;
      return needs > has + 0.01
        ? [
            `${part} "${el.textContent}" ${needs.toFixed(2)} in ${has.toFixed(2)}`,
          ]
        : [];
    });
    const width = box.clientWidth;
    const below = Number(box.getAttribute('data-hint-row-below'));
    const row = /rowBelow/.test(box.className);
    // A phone's bar, 560 px or less, never takes the desktop hint row.
    const wanted = width > 560 && width < below;
    return {
      width,
      below,
      row,
      cut,
      showing: (box.textContent ?? '').includes(words),
      settled: row === wanted,
    };
  }, phase);

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

/**
 * The hint is whole at the game's width, a pixel under it, and every window;
 * with a phase, every measure is taken while the bar says its words.
 */
async function hintsWhole(page: Page, at: string, phase?: Phase) {
  await expect(barBox(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const whole = async () => {
    const { showing, settled, cut } = await read(page, phase);
    return { showing, settled, cut };
  };
  const measured = { showing: true, settled: true, cut: [] };
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
      await expect
        .poll(whole, { message: `${at} at a ${width} px bar` })
        .toEqual(measured);
    }
  }
  for (const width of WINDOWS) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(whole, { message: `${at} at ${width}` })
      .toEqual(measured);
  }
}

/** Checks the bar as it is, in English and then in Chinese. */
async function bothLanguages(page: Page, at: string, phase?: Phase) {
  await hintsWhole(page, `${at} (en)`, phase);
  await page.getByRole('radio', { name: '中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await hintsWhole(page, `${at} (zh)`, phase);
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
  test.setTimeout(180_000);
  // A lockout and a trio taken held for 59 s, so every width is measured
  // while they show; their clocks keep the digits of the 3 s and 2 s ones.
  const server = await startServer(0, {
    TRIOS_LOCKOUT_SECONDS: '59',
    TRIOS_TAKEN_SECONDS: '59',
  });
  try {
    const own = { server: server.url };
    const [host, guest] = await room((name) => player(name, own), 'trios', {
      seats: 2,
    });
    await readyToFind(guest);
    await expect(triosTurn(guest).getByText('Find a trio')).toBeVisible();
    await bothLanguages(guest, 'searching');
    await expect.poll(() => pageScroll(guest)).toBe(0);
    // Why three cards are not a trio has the main line to itself.
    await pickMiss(guest);
    await bothLanguages(guest, 'locked out', {
      en: 'Not a trio',
      zh: '不成一组',
    });
    // Its widest hint, beside a long name finding a trio.
    await readyToFind(host);
    await pickTrio(host);
    await bothLanguages(guest, 'a trio taken', {
      en: `${LONG[0]} found a trio`,
      zh: `${LONG[0]} 找到了一组`,
    });
  } finally {
    server.process.kill('SIGKILL');
  }
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
