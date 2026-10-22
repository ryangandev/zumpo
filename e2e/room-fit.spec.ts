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
const LONG = ['Bartholomew Wilson', 'Maximilian Fischer'] as const;

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
  seats = 2,
): Promise<Page[]> {
  const pages = [await player(LONG[0]), await player(LONG[1])];
  const link = await createRoom(pages[0]!, game);
  await joinRoom(pages[1]!, link);
  if (seats === 3) {
    const third = await player('Constantine Ramos');
    await joinRoom(third, link);
    pages.push(third);
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

test('a Doodle Chain room fits a 1440 × 900 window at each step', async ({
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
