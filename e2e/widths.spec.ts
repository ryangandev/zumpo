import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';
import { readyUp } from './play/hush';
import { yourTurn } from './play/liars-dice';
import { openMiddle } from './play/minesweeper';

/**
 * Figma draws the screens at 1440 and 390 px; a window can be any width. At
 * each of these, from a laptop to a phone in a tablet's narrow split view,
 * nothing may reach out of what holds it: a board scales down, a toolbar
 * takes two lines, a bar's words end in an ellipsis. Between a board that
 * fits and one that does not, 1024 and 641 are the layouts' edges, 820 a
 * tablet, 360 and 320 the narrowest phones.
 */
const WIDTHS = [1280, 1024, 820, 641, 390, 360, 320];

interface Spill {
  element: string;
  content: number;
  box: number;
}

/**
 * Every element whose children reach past its padding box, or the page if
 * anything reaches past the window. A child's negative margin is a bleed on
 * purpose, into the padding of what holds it, so a child counts as its margin
 * box; a horizontal scroller shows what is in it by scrolling, so what is in
 * one is left alone, and a transformed child is where it was put. Artwork,
 * hidden from assistive technology, is drawn by hand and left alone too. The
 * tap areas of small controls are not elements and are not counted; a box
 * narrower than 48 px is a control's own.
 */
async function spillsAt(page: Page): Promise<Spill[]> {
  return page.evaluate(() => {
    const spills: Spill[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) {
      spills.push({
        element: 'page',
        content: root.scrollWidth,
        box: root.clientWidth,
      });
    }
    for (const el of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(el);
      if (style.overflowX !== 'visible') continue;
      if (style.display === 'inline' || style.display === 'contents') continue;
      if (el.clientWidth < 48 || el.closest('[aria-hidden="true"]')) continue;
      let scrolled = false;
      for (
        let p = el.parentElement;
        p && p !== document.body;
        p = p.parentElement
      ) {
        const { overflowX } = getComputedStyle(p);
        if (overflowX === 'auto' || overflowX === 'scroll') scrolled = true;
      }
      if (scrolled) continue;
      const left = el.getBoundingClientRect().left + el.clientLeft;
      const right = left + el.clientWidth;
      let from = left;
      let to = right;
      // The children with boxes of their own: through `display: contents`.
      const children = [...el.children];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const childStyle = getComputedStyle(child!);
        if (childStyle.display === 'contents') {
          children.push(...child!.children);
          continue;
        }
        if (
          childStyle.position === 'fixed' ||
          childStyle.transform !== 'none'
        ) {
          continue;
        }
        const rect = child!.getBoundingClientRect();
        if (rect.width === 0) continue;
        from = Math.min(
          from,
          rect.left - Math.min(0, parseFloat(childStyle.marginLeft)),
        );
        to = Math.max(
          to,
          rect.right + Math.min(0, parseFloat(childStyle.marginRight)),
        );
      }
      if (to > right + 1 || from < left - 1) {
        const classes = [...el.classList]
          .map((c) => c.replace(/^_(.*)_[a-z0-9]+_\d+$/, '$1'))
          .join('.');
        const label = el.getAttribute('aria-label');
        spills.push({
          element: `${el.tagName.toLowerCase()}${classes && `.${classes}`}${label ? `[${label}]` : ''}`,
          content: Math.round(to - from),
          box: el.clientWidth,
        });
      }
    }
    return spills;
  });
}

/** The page at every width, each held still a moment for the layout to settle. */
async function fitsEveryWidth(page: Page, state: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => spillsAt(page), { message: `${state} at ${width} px` })
      .toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

const start = (page: Page) =>
  page.getByRole('button', { name: 'Start game' }).click();

const startSolo = async (page: Page) => {
  const button = page.getByRole('button', { name: 'Start' });
  if (await button.isVisible()) await button.click();
};

const offeredWord = (page: Page) =>
  page.getByRole('button', { name: /\d+ letters?$/ }).first();

test('the platform pages fit every width', async ({ player }) => {
  const maya = await player('Maya');
  await maya.goto('/');
  await fitsEveryWidth(maya, 'home');
  await maya.goto('/games/trios');
  await fitsEveryWidth(maya, 'trios lobby');
  await maya.getByRole('button', { name: 'Full rules' }).click();
  await fitsEveryWidth(maya, 'trios lobby, every rule open');
  await maya.goto('/games/pairs/new');
  await maya.getByRole('button', { name: 'More options' }).click();
  await fitsEveryWidth(maya, 'create a pairs room');
});

test('a draw and guess room fits every width', async ({ player }) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(
    leo,
    await createRoom(maya, 'draw-and-guess', { seats: 2, rounds: 1 }),
  );
  await fitsEveryWidth(maya, 'waiting');
  await start(maya);
  await expect
    .poll(
      async () =>
        (await offeredWord(maya).isVisible()) ||
        (await offeredWord(leo).isVisible()),
    )
    .toBe(true);
  const drawer = (await offeredWord(maya).isVisible()) ? maya : leo;
  const guesser = drawer === maya ? leo : maya;
  await fitsEveryWidth(drawer, 'choosing a word');
  await offeredWord(drawer).click();
  await expect(drawer.getByText('Draw this', { exact: true })).toBeVisible();
  await fitsEveryWidth(drawer, 'drawing');
  await fitsEveryWidth(guesser, 'guessing');
});

test('minesweeper fits every width', async ({ player }) => {
  const sam = await player('Sam');
  for (const board of ['Medium', 'Large'] as const) {
    await sam.goto(`/games/minesweeper/solo?board=${board}`);
    await startSolo(sam);
    await openMiddle(sam);
    await fitsEveryWidth(sam, `a ${board} board on your own`);
  }
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(
    leo,
    await createRoom(maya, 'minesweeper', { seats: 2, board: 'Large' }),
  );
  await start(maya);
  await expect(maya.getByText('Pick a cell')).toBeVisible();
  await fitsEveryWidth(maya, 'a Large board in a room');
});

test('make 24 fits every width', async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/make-24/solo');
  await fitsEveryWidth(sam, 'before the first hand');
  await startSolo(sam);
  await expect(sam.getByText('Hand 1 of 10').first()).toBeVisible();
  await fitsEveryWidth(sam, 'a hand on your own');
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'make-24', { seats: 2 }));
  await start(maya);
  await expect(
    maya.getByRole('region', { name: 'Turn' }).getByText('Make 24'),
  ).toBeVisible();
  await fitsEveryWidth(maya, 'a hand in a room');
});

test('pairs fits every width', async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/pairs/solo?board=Large');
  await startSolo(sam);
  await expect(sam.getByRole('region', { name: 'Turn' })).toBeVisible();
  await fitsEveryWidth(sam, 'a Large board on your own');
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(
    leo,
    await createRoom(maya, 'pairs', { seats: 2, board: 'Large' }),
  );
  await start(maya);
  await expect(maya.getByText(/0 of \d+ pairs/)).toBeVisible();
  await fitsEveryWidth(maya, 'a Large board in a room');
});

test('trios fits every width', async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/trios/solo');
  await startSolo(sam);
  await expect(sam.getByText('Trio 1 of 10').first()).toBeVisible();
  await fitsEveryWidth(sam, 'a table on your own');
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'trios', { seats: 2 }));
  await start(maya);
  await expect(maya.getByText('0 of 10 trios').first()).toBeVisible();
  await fitsEveryWidth(maya, 'a table in a room');
});

test('snap fits every width', async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/snap/solo');
  await startSolo(sam);
  await expect(sam.getByText('Card 1 of 30').first()).toBeVisible();
  await fitsEveryWidth(sam, 'two cards on your own');
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'snap', { seats: 2 }));
  await start(maya);
  await expect(maya.getByText('0 of 29 cards').first()).toBeVisible();
  await fitsEveryWidth(maya, 'two cards in a room');
});

test("liar's dice fits every width", async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/liars-dice/solo');
  await startSolo(sam);
  // The bots may end a round before it comes to Sam, who starts the next.
  const nextRound = sam.getByRole('button', { name: 'Next round' });
  while (!(await yourTurn(sam).isVisible())) {
    await expect
      .poll(
        async () => (await yourTurn(sam).isVisible()) || nextRound.isVisible(),
        { timeout: 30_000 },
      )
      .toBe(true);
    if (await nextRound.isVisible()) await nextRound.click();
  }
  await expect(sam.getByRole('group', { name: 'Your bid' })).toBeVisible();
  await fitsEveryWidth(sam, 'bidding on your own');
  const maya = await player('Maya');
  const others = [
    await player('Leo'),
    await player('Ryan'),
    await player('Ann'),
  ];
  const link = await createRoom(maya, 'liars-dice', { dice: 5 });
  for (const other of others) await joinRoom(other, link);
  await start(maya);
  await expect(maya.getByText('Round 1', { exact: true })).toBeVisible();
  await fitsEveryWidth(maya, 'four players with five dice each');
});

test('hush fits every width', async ({ player }) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'hush', { seats: 2 }));
  await start(maya);
  await expect(
    maya.getByRole('region', { name: 'Turn' }).getByText('Get ready'),
  ).toBeVisible();
  await fitsEveryWidth(maya, 'getting ready');
  await readyUp([maya, leo]);
  await fitsEveryWidth(maya, 'playing');
});

test('daily word fits every width', async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/daily-word/solo');
  await expect(sam.getByRole('group', { name: 'Keyboard' })).toBeVisible();
  await fitsEveryWidth(sam, 'a word on your own');
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'daily-word', { seats: 2 }));
  await start(maya);
  await expect(maya.getByText('Word 1 of 3').first()).toBeVisible();
  await fitsEveryWidth(maya, 'a word in a room');
});

test('code breaker fits every width', async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/code-breaker/solo');
  await expect(sam.getByRole('group', { name: 'Digit pad' })).toBeVisible();
  await fitsEveryWidth(sam, 'a code on your own');
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'code-breaker', { seats: 2 }));
  await start(maya);
  await expect(maya.getByText('Code 1 of 3').first()).toBeVisible();
  await fitsEveryWidth(maya, 'a code in a room');
});

test('doodle chain fits every width', async ({ player }) => {
  const maya = await player('Maya');
  const link = await createRoom(maya, 'doodle-chain', { seats: 3 });
  for (const name of ['Leo', 'Sam']) await joinRoom(await player(name), link);
  await expect(maya.getByText(/^3 players, so 3 steps/)).toBeVisible();
  await start(maya);
  const field = maya.getByRole('textbox', { name: 'Your first line' });
  await field.fill('A turtle on a skateboard');
  await fitsEveryWidth(maya, 'writing the first line');
  await maya.getByRole('button', { name: 'Done' }).click();
  await fitsEveryWidth(maya, 'done, waiting for the others');
});

test('gomoku fits every width', async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/gomoku/solo');
  await startSolo(sam);
  await expect(sam.getByText('Move 1').first()).toBeVisible();
  await fitsEveryWidth(sam, 'a board on your own');
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'gomoku'));
  await start(maya);
  await expect(maya.getByText('Game 1').first()).toBeVisible();
  await fitsEveryWidth(maya, 'a board in a room');
});
