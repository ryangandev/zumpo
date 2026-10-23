import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test, type GameType } from './fixtures';
import { blackOf, place } from './play/gomoku';
import { typeGuess as guessWord } from './play/daily-word';
import { typeGuess as guessCode } from './play/code-breaker';
import { whoseTurn } from './play/liars-dice';
import { readyToTap } from './play/snap';

/**
 * On a 1440 × 900 desktop, the most common, a room in play never scrolls:
 * the board scales down to end inside the window (useFitHeight, or a sheet's
 * height left), so the board and the controls a player needs this turn are
 * all in sight. Each room is played to a turn by two players with the
 * longest names a player can choose, in English and then in Chinese.
 */

/** 18 characters, the most a name may have. */
const LONG = [
  'Bartholomew Wilson',
  'Maximilian Fischer',
  'Constantine Ramos',
  'Alexandria Brooks',
] as const;

/**
 * That no page scrolls, once settled, in English and in Chinese; it leaves
 * them in English, as the rest of a test reads them.
 */
async function expectFits(pages: readonly Page[], what: string) {
  for (const [language, name] of [
    ['Chinese', '中文'],
    ['English', 'English'],
  ] as const) {
    for (const page of pages) {
      // The footer's language switch.
      await page.getByRole('radio', { name }).click();
    }
    for (const page of pages) {
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollHeight - window.innerHeight,
            ),
          { message: `${what} in ${language} scrolls` },
        )
        .toBeLessThanOrEqual(0);
    }
  }
}

async function startRoom(
  game: GameType,
  player: (name: string) => Promise<Page>,
  seats: 2 | 3 | 4 = 2,
): Promise<Page[]> {
  const pages = [await player(LONG[0]), await player(LONG[1])];
  const link = await createRoom(pages[0]!, game);
  await joinRoom(pages[1]!, link);
  for (const name of LONG.slice(2, seats)) {
    const joined = await player(name);
    await joinRoom(joined, link);
    pages.push(joined);
  }
  await expect(
    pages[0]!.getByText(LONG[1], { exact: true }).first(),
  ).toBeVisible();
  await pages[0]!.getByRole('button', { name: 'Start game' }).click();
  return pages;
}

/** Rooms in play from the start, and how to tell they are. */
const DEALT: readonly {
  game: GameType;
  ready: (pages: readonly Page[]) => Promise<void>;
}[] = [
  { game: 'minesweeper', ready: turnSays('Pick a cell') },
  { game: 'make-24', ready: turnSays('Make 24') },
  { game: 'pairs', ready: turnSays('turn') },
  { game: 'trios', ready: turnSays('Find a trio') },
  {
    game: 'snap',
    ready: async (pages) => {
      for (const page of pages) await readyToTap(page);
    },
  },
  {
    game: 'liars-dice',
    ready: async (pages) => {
      await expect.poll(() => whoseTurn(pages)).not.toBeNull();
    },
  },
  { game: 'hush', ready: turnSays('Level 1') },
];

function turnSays(words: string) {
  return async (pages: readonly Page[]) => {
    for (const page of pages) {
      await expect(
        page.getByRole('region', { name: 'Turn' }).getByText(words).first(),
      ).toBeVisible();
    }
  };
}

for (const { game, ready } of DEALT) {
  test(`a ${game} room in play fits a 1440 × 900 window`, async ({
    player,
  }) => {
    const pages = await startRoom(game, player);
    await ready(pages);
    await expectFits(pages, game);
  });
}

/** The first word offered to a drawer, which says how many letters it has. */
const offered = (page: Page) =>
  page.getByRole('button', { name: /\d+ letters?$/ }).first();

test('a Draw & Guess room fits a 1440 × 900 window for the drawer and a guesser', async ({
  player,
}) => {
  const [a, b] = await startRoom('draw-and-guess', player);
  await expect(
    offered(a!).or(a!.getByText(/is choosing a word/)),
  ).toBeVisible();
  const drawer = (await offered(a!).isVisible()) ? a! : b!;
  const guesser = drawer === a ? b! : a!;
  await expectFits([drawer, guesser], 'choosing a word');
  await offered(drawer).click();
  await expect(drawer.getByText('Draw this', { exact: true })).toBeVisible();
  // A chat full of guesses scrolls its messages, not the page. Four a
  // second, as the server lets a player send them.
  const input = guesser.getByRole('textbox', { name: 'Message' });
  for (let guess = 0; guess < 16; guess++) {
    await input.fill(`a zebra crossing ${guess}`);
    await input.press('Enter');
    await guesser.waitForTimeout(260);
  }
  await expect(guesser.getByText('a zebra crossing 15')).toBeVisible();
  await expectFits([drawer, guesser], 'drawing and guessing');
});

test('a Daily Word room fits a 1440 × 900 window with its keyboard', async ({
  player,
}) => {
  const pages = await startRoom('daily-word', player);
  for (const page of pages) {
    await expect(
      page.getByRole('group', { name: 'Your guesses' }),
    ).toBeVisible();
    await guessWord(page, 'slate');
    await page.keyboard.type('cra');
  }
  await expectFits(pages, 'a word in play');
});

test('a Code Breaker room fits a 1440 × 900 window with its keypad', async ({
  player,
}) => {
  const pages = await startRoom('code-breaker', player);
  for (const page of pages) {
    await expect(
      page.getByRole('group', { name: 'Your guesses' }),
    ).toBeVisible();
    await guessCode(page, '1234');
    await page.keyboard.type('56');
  }
  await expectFits(pages, 'a code in play');
});

test('a Gomoku room fits a 1440 × 900 window', async ({ player }) => {
  const pages = await startRoom('gomoku', player);
  const black = await blackOf(pages);
  const white = black === pages[0] ? pages[1]! : pages[0]!;
  await place(black, 'H8');
  await place(white, 'G15');
  await expectFits(pages, 'a game in play');
});

test('a Doodle Chain room fits a 1440 × 900 window at each step, and its drawing 1280 × 720', async ({
  player,
}) => {
  const pages = await startRoom('doodle-chain', player, 3);
  await expectFits(pages, 'writing');
  for (const page of pages) {
    await page
      .getByRole('textbox', { name: 'Your first line' })
      .fill('A cat riding a bicycle to the moon');
    await page.getByRole('button', { name: 'Done' }).click();
  }
  for (const page of pages) {
    await expect(page.getByLabel('Drawing canvas')).toBeVisible();
  }
  await expectFits(pages, 'drawing');
  // A 13-inch laptop's window, where the sheet is at its narrowest.
  for (const page of pages) {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await expectFits(pages, 'drawing at 1280 × 720');
  for (const page of pages) {
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  for (const page of pages) {
    const box = (await page.getByLabel('Drawing canvas').boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Done' }).click();
  }
  for (const page of pages) {
    await expect(
      page.getByRole('img', { name: 'The drawing you were given' }),
    ).toBeVisible();
  }
  await expectFits(pages, 'describing');
});

/** Where a board is on the page, to the pixel. */
const boxOf = async (page: Page, board: string) => {
  const box = (await page.locator(board).first().boundingBox())!;
  return [box.x, box.y, box.width, box.height].map(Math.round);
};

test('a Minesweeper board keeps its size as a round is revealed under it', async ({
  player,
}) => {
  const pages = await startRoom('minesweeper', player);
  // 720 px tall, where the board is scaled to fit in play.
  for (const page of pages) {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  const grid = '[role="grid"][aria-label^="Board, "]';
  for (const page of pages) {
    await expect(
      page.getByRole('region', { name: 'Turn' }).getByText('Pick a cell'),
    ).toBeVisible();
  }
  const before = await Promise.all(pages.map((page) => boxOf(page, grid)));
  for (const [index, page] of pages.entries()) {
    await page
      .locator(`${grid} [aria-label^="Row ${index + 2}, column 2:"]`)
      .click();
  }
  for (const page of pages) {
    await expect(
      page.getByRole('heading', { name: 'Round 1 results' }),
    ).toBeVisible();
  }
  for (const [index, page] of pages.entries()) {
    await expect.poll(() => boxOf(page, grid)).toEqual(before[index]);
  }
});

const hiddenCell = (page: Page) =>
  page.getByRole('gridcell', { name: /: hidden$/, disabled: false });

/**
 * A round's results and a game's standings come under the board, and the
 * page still ends inside the window, with the board where it was in play,
 * however many players the results list.
 */
for (const seats of [2, 4] as const) {
  test(`a Minesweeper room of ${seats} fits a 1440 × 900 window from a round's reveal to the results`, async ({
    player,
  }) => {
    test.setTimeout(180_000);
    const pages = await startRoom('minesweeper', player, seats);
    for (const page of pages) {
      await expect(
        page.getByRole('region', { name: 'Turn' }).getByText('Pick a cell'),
      ).toBeVisible();
    }
    await expectFits(pages, 'a round being picked');
    const before = await Promise.all(
      pages.map((page) => boxOf(page, '[role="grid"]')),
    );
    const sameBoard = async (what: string) => {
      for (const [index, page] of pages.entries()) {
        await expect
          .poll(() => boxOf(page, '[role="grid"]'), {
            message: `the board moved ${what}`,
          })
          .toEqual(before[index]);
      }
    };

    // Everyone picks a cell of their own, so every row of the results has a
    // pick of its own.
    for (const [index, page] of pages.entries()) {
      await hiddenCell(page).nth(index).click();
    }
    for (const page of pages) {
      await expect(
        page.getByRole('heading', { name: 'Round 1 results' }),
      ).toBeVisible();
    }
    await expectFits(pages, 'a round revealed');
    await sameBoard('as the first round was revealed');
    if (seats > 2) return;

    // Played to the end, the standings take the results' place.
    const over = pages[0]!
      .getByRole('banner')
      .getByText('Game over', { exact: true });
    while (!(await over.isVisible())) {
      const picking = pages[0]!
        .getByRole('region', { name: 'Turn' })
        .getByText('Pick a cell');
      await expect(picking.or(over).first()).toBeVisible();
      if (await over.isVisible()) break;
      await hiddenCell(pages[0]!).first().click();
      await hiddenCell(pages[1]!).last().click();
      await expect(picking).toBeHidden();
    }
    for (const page of pages) {
      await expect(
        page.getByRole('heading', { name: 'Standings' }),
      ).toBeVisible();
    }
    await expectFits(pages, 'the results');
    await sameBoard('as the game ended');
  });
}

test('a Daily Word board keeps its size as the other player guesses', async ({
  player,
}) => {
  const [me, other] = await startRoom('daily-word', player);
  const board = '[role="group"][aria-label="Your guesses"]';
  await expect(me!.locator(board)).toBeVisible();
  await guessWord(me!, 'slate');
  const before = await boxOf(me!, board);
  await guessWord(other!, 'crane');
  await expect(me!.getByText('1 guess').first()).toBeVisible();
  await expect.poll(() => boxOf(me!, board)).toEqual(before);
});
