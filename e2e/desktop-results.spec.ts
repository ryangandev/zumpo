import type { Locator, Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';
import { blackOf, boardOf, place, turnOf } from './play/gomoku';

/**
 * On a desktop a room's results come beside the board, not over it: the
 * board a game ended on keeps its size and place for the players and for
 * anybody watching, and the result and the next game's button are in sight
 * without scrolling.
 */

/** Where a board is on the page, to the pixel. */
const boxOf = (board: Locator) =>
  board.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return [
      rect.left + window.scrollX,
      rect.top + window.scrollY,
      rect.width,
      rect.height,
    ].map(Math.round);
  });

/** Every page's board box, the fonts loaded so nothing reflows after. */
const boxesOf = (pages: readonly Page[], board: (page: Page) => Locator) =>
  Promise.all(
    pages.map(async (page) => {
      await page.evaluate(() => document.fonts.ready);
      return boxOf(board(page));
    }),
  );

/** In sight in the window as it is, with no scrolling. */
const inSight = (locator: Locator) =>
  expect(locator).toBeInViewport({ ratio: 1 });

/**
 * Windows at which a Gomoku bar has its hints beside the main line, and
 * under it (TurnBar's hintRowBelow), where the result bar must keep that
 * line too. Under 1024 px the room is one column, the next game under the
 * board rather than beside it.
 */
const GOMOKU_WINDOWS = [
  { width: 1440, row: false, beside: true },
  { width: 900, row: true, beside: false },
] as const;

for (const window of GOMOKU_WINDOWS) {
  test(`a Gomoku board keeps its size and place from a game to its results on a ${window.width} px desktop`, async ({
    player,
  }) => {
    const maya = await player('Maya');
    const leo = await player('Leo');
    const link = await createRoom(maya, 'gomoku');
    await joinRoom(leo, link);
    await maya.getByRole('button', { name: 'Start game' }).click();
    // Both seats are taken: a third comes in to watch.
    const sam = await player('Sam');
    await joinRoom(sam, link);
    for (const page of [maya, leo, sam]) {
      await page.setViewportSize({ width: window.width, height: 900 });
    }
    const black = await blackOf([maya, leo]);
    const white = black === maya ? leo : maya;
    for (const [mine, theirs] of [
      ['D8', 'A1'],
      ['E8', 'C1'],
      ['F8', 'E1'],
      ['G8', 'G1'],
    ] as const) {
      await place(black, mine);
      await place(white, theirs);
    }
    const pages = [black, white, sam];
    await expectRow(pages, window.row);
    const before = await boxesOf(pages, boardOf);
    expect(before[1]).toEqual(before[0]);
    expect(before[2]).toEqual(before[0]);

    await place(black, 'H8');
    for (const page of pages) {
      await expect(turnOf(page).getByText(/five in a row/i)).toBeVisible();
    }
    expect(await boxesOf(pages, boardOf)).toEqual(before);
    await expectRow(pages, window.row);
    // The result and what comes next, at once.
    await inSight(turnOf(white).getByText(/wins with five in a row/));
    if (window.beside) {
      await inSight(maya.getByRole('button', { name: 'Play again' }));
      await inSight(leo.getByRole('button', { name: 'Ready', exact: true }));
    }
    // The result is the stage's heading and takes the focus, for the players
    // and the spectator alike.
    for (const page of pages) {
      await expect(
        turnOf(page).getByRole('heading', { level: 2, name: /five in a row/ }),
      ).toBeFocused();
    }
  });
}

/** Whether every page's turn bar has its meta on a line of its own. */
const expectRow = async (pages: readonly Page[], row: boolean) => {
  for (const page of pages) {
    await expect(page.locator('[data-hint-row-below]').first()).toHaveClass(
      row ? /rowBelow/ : /^(?!.*rowBelow)/,
    );
  }
};

const minefieldOf = (page: Page) =>
  page.getByRole('grid', { name: /^Board, / });

const hiddenCell = (page: Page) =>
  page.getByRole('gridcell', { name: /: hidden$/, disabled: false });

test('a Minesweeper board keeps its size and place from a game to its results on a desktop', async ({
  player,
}) => {
  test.setTimeout(180_000);
  const maya = await player('Maya');
  const leo = await player('Leo');
  const sam = await player('Sam');
  const link = await createRoom(maya, 'minesweeper');
  await joinRoom(leo, link);
  await joinRoom(sam, link);
  await sam.getByRole('button', { name: 'Watch instead' }).click();
  await expect(
    sam.getByRole('heading', { name: 'You’re watching.' }),
  ).toBeVisible();
  await maya.getByRole('button', { name: 'Start game' }).click();

  // Both always pick, so no round waits out its clock. The box is taken
  // while a round is open, where nobody has picked yet.
  const pages = [maya, leo, sam];
  const over = maya.getByRole('banner').getByText('Game over', { exact: true });
  let before: number[][] = [];
  while (!(await over.isVisible())) {
    await expect(
      turnOf(maya).getByText('Pick a cell').or(over).first(),
    ).toBeVisible();
    if (await over.isVisible()) break;
    before = await boxesOf(pages, minefieldOf);
    await hiddenCell(maya).first().click();
    await hiddenCell(leo).last().click();
    await expect(turnOf(maya).getByText('Pick a cell')).toBeHidden();
  }
  expect(before[1]).toEqual(before[0]);
  expect(before[2]).toEqual(before[0]);
  for (const page of pages) {
    await expect(
      page.getByRole('banner').getByText('Game over', { exact: true }),
    ).toBeVisible();
  }
  expect(await boxesOf(pages, minefieldOf)).toEqual(before);
  await inSight(turnOf(sam).getByText(/wins with|tie with/));
  await inSight(maya.getByRole('button', { name: 'Play again' }));
  await inSight(leo.getByRole('button', { name: 'Ready', exact: true }));
  for (const page of pages) {
    await expect(
      turnOf(page).getByRole('heading', {
        level: 2,
        name: /wins? with|tie with/,
      }),
    ).toBeFocused();
  }
});
