import type { Locator, Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';
import * as codeBreaker from './play/code-breaker';
import * as dailyWord from './play/daily-word';
import { blackOf, pointOf } from './play/gomoku';
import { deal, play, readyUp } from './play/hush';
import { move, yourTurn } from './play/liars-dice';
import { missHand, solveHand, startHand } from './play/make-24';
import { openMiddle } from './play/minesweeper';
import { playTurn, type Memory } from './play/pairs';
import { readyToTap, tapMatch, tapMiss } from './play/snap';
import { pickMiss, pickTrio, readyToFind } from './play/trios';

/**
 * On a phone a game plays on one screen: the room bar, the turn bar, the
 * board and, at the foot, what the player touches. That last is on screen
 * from the first move, and stays where the thumb found it for the whole
 * game, whatever the turn bar says or the board shows. At 360 by 640, the
 * smallest phone in common use, and at 390 by 844, Figma's.
 */
const SIZES = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
] as const;

interface Place {
  top: number;
  /** Every edge within the window. */
  inside: boolean;
  /** Whether the page itself scrolls, either way. */
  scrolls: boolean;
}

const placeOf = (input: Locator): Promise<Place> =>
  input.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const root = document.documentElement;
    return {
      top: Math.round(box.top),
      inside:
        box.top >= -0.5 &&
        box.left >= -0.5 &&
        box.bottom <= innerHeight + 0.5 &&
        box.right <= innerWidth + 0.5,
      scrolls:
        root.scrollHeight > innerHeight + 1 ||
        root.scrollWidth > innerWidth + 1,
    };
  });

/**
 * Checks `input` is on screen, on a page that does not scroll, and returns
 * a check that it is still there, at the same height.
 */
async function heldStill(input: Locator, state: string) {
  await expect(input, state).toBeVisible();
  await expect
    .poll(() => placeOf(input), { message: `${state}: on screen` })
    .toMatchObject({ inside: true, scrolls: false });
  const { top } = await placeOf(input);
  return async (later: string) => {
    await expect
      .poll(() => placeOf(input), { message: `${later}: where it was` })
      .toEqual({ top, inside: true, scrolls: false });
  };
}

/** A player on a phone of `size`, with Leo's or Sam's name. */
async function onPhone(
  player: (name: string, options?: { phone?: boolean }) => Promise<Page>,
  name: string,
  size: { width: number; height: number },
) {
  const page = await player(name, { phone: true });
  await page.setViewportSize(size);
  return page;
}

const turnOf = (page: Page) => page.getByRole('region', { name: 'Turn' });

/** Draws one stroke across the canvas. */
async function scribble(page: Page) {
  const box = (await page.getByLabel('Drawing canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, {
    steps: 12,
  });
  await page.mouse.up();
}

const placeStone = (page: Page) =>
  page.getByRole('button', { name: 'Place stone' });

/** The words a Draw & Guess drawer is offered, the first of them. */
const offered = (page: Page) =>
  page.getByRole('button', { name: /\d+ letters?$/ }).first();

/** Whether the board's current row or entry is wholly in the board's view. */
const currentInBoard = (page: Page) =>
  page.locator('[data-play-board]').evaluate((board) => {
    const current = board.querySelector('[data-play-current]');
    if (!current) return false;
    const room = board.getBoundingClientRect();
    const rect = current.getBoundingClientRect();
    return rect.top >= room.top - 1 && rect.bottom <= room.bottom + 1;
  });

/** Writes `text` in a Doodle Chain step's field and presses Done. */
async function write(page: Page, field: string, text: string) {
  await page.getByRole('textbox', { name: field }).fill(text);
  await page.getByRole('button', { name: 'Done' }).click();
}

for (const size of SIZES) {
  const at = `${size.width} by ${size.height}`;

  test.describe(`on a ${at} phone`, () => {
    test('code breaker keeps the digit pad still', async ({ player }) => {
      const sam = await onPhone(player, 'Sam', size);
      await sam.goto('/games/code-breaker/solo');
      const still = await heldStill(
        sam.getByRole('group', { name: 'Digit pad' }),
        'the first guess',
      );
      // Enough guesses to fill the board's foot, and scroll it if it must.
      for (let row = 1; row <= 4; row++) {
        const guesses = await codeBreaker.guessesOf(sam);
        await codeBreaker.typeGuess(sam, codeBreaker.nextGuess(guesses));
        await expect
          .poll(async () => (await codeBreaker.guessesOf(sam)).length)
          .toBe(row);
        if (codeBreaker.isCracked(await codeBreaker.guessesOf(sam))) break;
        await still(`after guess ${row}`);
      }
    });

    test('daily word keeps the keyboard still', async ({ player }) => {
      const sam = await onPhone(player, 'Sam', size);
      await sam.goto('/games/daily-word/solo');
      const still = await heldStill(
        sam.getByRole('group', { name: 'Keyboard' }),
        'the first guess',
      );
      // A word not in the list says so, above the keyboard.
      await dailyWord.typeGuess(sam, 'qzxvj');
      await expect(sam.getByRole('alert')).toHaveText('Not in the word list');
      await still('a word not in the list');
      for (let letter = 0; letter < 5; letter++) {
        await sam.keyboard.press('Backspace');
      }
      for (let row = 1; row <= 4; row++) {
        const guesses = await dailyWord.guessesOf(sam);
        await dailyWord.typeGuess(sam, dailyWord.nextGuess(guesses));
        await expect
          .poll(async () => (await dailyWord.guessesOf(sam)).length)
          .toBe(row);
        if (dailyWord.isFound(await dailyWord.guessesOf(sam))) break;
        await still(`after guess ${row}`);
      }
    });

    test('snap keeps both cards still', async ({ player }) => {
      const sam = await onPhone(player, 'Sam', size);
      await sam.goto('/games/snap/solo');
      await readyToTap(sam);
      const middle = await heldStill(
        sam.getByRole('group', { name: /^Middle card/ }),
        'the first card',
      );
      const mine = await heldStill(
        sam.getByRole('group', { name: /^Your card/ }),
        'the first card',
      );
      await tapMiss(sam);
      await middle('a miss');
      await mine('a miss');
      await readyToTap(sam);
      await tapMatch(sam);
      await expect(sam.getByText('Card 2 of 30').first()).toBeVisible();
      await readyToTap(sam);
      await middle('the next card');
      await mine('the next card');
    });

    test('pairs keeps the cards still', async ({ player }) => {
      const sam = await onPhone(player, 'Sam', size);
      await sam.goto('/games/pairs/solo');
      const still = await heldStill(
        sam.getByRole('grid', { name: 'Cards' }),
        'the first turn',
      );
      const memory: Memory = new Map();
      for (let turn = 1; turn <= 3; turn++) {
        await playTurn(sam, memory, () => still(`one card up, turn ${turn}`));
        await still(`after turn ${turn}`);
      }
    });

    test('trios keeps the table still', async ({ player }) => {
      const sam = await onPhone(player, 'Sam', size);
      await sam.goto('/games/trios/solo');
      const still = await heldStill(
        sam.getByRole('group', { name: 'Table' }),
        'the first trio',
      );
      await pickMiss(sam);
      await still('a miss');
      await readyToFind(sam);
      await pickTrio(sam);
      await expect(sam.getByText('Trio 2 of 10').first()).toBeVisible();
      await still('a trio found');
    });

    test('make 24 keeps the signs still', async ({ player }) => {
      const sam = await onPhone(player, 'Sam', size);
      await sam.goto('/games/make-24/solo');
      await expect(sam.getByText('Hand 1 of 10').first()).toBeVisible();
      // With every card used the signs keep their room, out of sight.
      const signs = sam.locator('[aria-label="Signs"]');
      const still = await heldStill(signs, 'the first hand');
      const startOver = sam.getByRole('button', { name: 'Start over' });
      const tools = await heldStill(startOver, 'the first hand');
      await startHand(sam);
      await still('a step taken');
      await tools('a step taken');
      await startOver.click();
      await missHand(sam);
      await still('a hand that misses 24');
      await tools('a hand that misses 24');
      await startOver.click();
      await solveHand(sam);
      await expect(sam.getByText('Hand 2 of 10').first()).toBeVisible();
      await expect(signs).toBeVisible();
      await still('the next hand');
      await tools('the next hand');
    });

    test('minesweeper fits a small board and keeps its toggle still', async ({
      player,
    }) => {
      const sam = await onPhone(player, 'Sam', size);
      await sam.goto('/games/minesweeper/solo?board=Small');
      const board = sam.getByRole('grid', { name: /^Board, / });
      const grid = await heldStill(board, 'a fresh board');
      const still = await heldStill(
        sam.getByRole('group', { name: 'A click' }),
        'a fresh board',
      );
      await openMiddle(sam);
      await grid('the first cells open');
      await still('the first cells open');
      await sam.getByRole('button', { name: 'Flag' }).click();
      await still('flagging');
    });

    test("liar's dice keeps the bid picker still", async ({ player }) => {
      test.setTimeout(90_000);
      const sam = await onPhone(player, 'Sam', size);
      await sam.goto('/games/liars-dice/solo');
      const nextRound = sam.getByRole('button', { name: 'Next round' });
      let still: ((later: string) => Promise<void>) | null = null;
      for (let turn = 1; turn <= 4; turn++) {
        // The bots may end a round before it comes to Sam.
        while (!(await yourTurn(sam).isVisible())) {
          await expect
            .poll(
              async () =>
                (await yourTurn(sam).isVisible()) || nextRound.isVisible(),
              { timeout: 30_000 },
            )
            .toBe(true);
          if (await nextRound.isVisible()) await nextRound.click();
        }
        const picker = sam.getByRole('group', { name: 'Your bid' });
        if (still) await still(`turn ${turn}`);
        else still = await heldStill(picker, 'the first turn');
        await move(sam);
      }
    });

    test('gomoku keeps Place stone still', async ({ player }) => {
      const maya = await onPhone(player, 'Maya', size);
      const leo = await onPhone(player, 'Leo', size);
      await joinRoom(leo, await createRoom(maya, 'gomoku'));
      await maya.getByRole('button', { name: 'Start game' }).click();
      const black = await blackOf([maya, leo]);
      const white = black === maya ? leo : maya;
      const blackStill = await heldStill(placeStone(black), 'the first move');
      const whiteStill = await heldStill(placeStone(white), 'the first move');
      await expect(placeStone(black)).toBeDisabled();

      await pointOf(black, 'H8').tap();
      await expect(turnOf(black).getByText('Tap again to place')).toBeVisible();
      await expect(placeStone(black)).toBeEnabled();
      await blackStill('a faint stone down');
      await placeStone(black).click();
      await expect(pointOf(white, 'H8')).toHaveAccessibleName(
        'H8, black stone, last placed',
      );
      await blackStill('a stone placed');
      await whiteStill('the second move');

      await pointOf(white, 'J9').tap();
      await pointOf(white, 'J9').tap();
      await expect(pointOf(black, 'J9')).toHaveAccessibleName(
        'J9, white stone, last placed',
      );
      await blackStill('the third move');
      await whiteStill('a stone placed with a second tap');
    });

    test('hush keeps Ready and Play in one place', async ({ player }) => {
      const maya = await player('Maya');
      const leo = await onPhone(player, 'Leo', size);
      await joinRoom(leo, await createRoom(maya, 'hush', { seats: 2 }));
      await maya.getByRole('button', { name: 'Start game' }).click();
      // Ready, then Play: one button in one place, held while it cannot be
      // pressed, so the hand above it never moves either.
      const button = leo.getByRole('button', {
        name: /^(I’m ready|Play \d+)$/,
      });
      const still = await heldStill(button, 'getting ready');
      await readyUp([maya, leo]);
      await expect(leo.getByRole('button', { name: /^Play / })).toBeVisible();
      await still('play open');
      const hand = await heldStill(
        leo.getByRole('region', { name: 'Your hand' }),
        'play open',
      );
      // Level 1 is one card each: the lower of the two goes first.
      const [first] = await deal([maya, leo]);
      if (first!.page === maya) {
        await play(maya, first!.card, [maya, leo]);
        await still('a card played by the other player');
        await hand('a card played by the other player');
      } else {
        await play(leo, first!.card, [maya, leo]);
      }
    });

    test('draw and guess keeps the guess field and the canvas still', async ({
      player,
    }) => {
      test.setTimeout(90_000);
      const maya = await player('Maya');
      const leo = await onPhone(player, 'Leo', size);
      await joinRoom(
        leo,
        await createRoom(maya, 'draw-and-guess', { seats: 2, rounds: 1 }),
      );
      await maya.getByRole('button', { name: 'Start game' }).click();

      for (let turn = 1; turn <= 2; turn++) {
        await expect
          .poll(
            async () =>
              (await offered(maya).isVisible()) ||
              (await offered(leo).isVisible()),
          )
          .toBe(true);
        const drawer = (await offered(leo).isVisible()) ? leo : maya;
        const guesser = drawer === leo ? maya : leo;
        const word = (await offered(drawer)
          .locator('span')
          .first()
          .textContent())!.trim();
        await offered(drawer).click();
        await expect(turnOf(drawer).getByText('Draw this')).toBeVisible();
        // A phone guesses in a field under the canvas, a desktop in the chat.
        const guess = guesser.getByRole('textbox', {
          name: guesser === leo ? 'Guess' : 'Message',
        });
        await expect(guess).toBeEnabled();
        const still =
          drawer === leo
            ? await heldStill(leo.getByLabel('Drawing canvas'), 'drawing')
            : await heldStill(guess, 'guessing');
        await guess.fill('not the word');
        await guess.press('Enter');
        // The phone's chat is a tab of its own; the desktop player sees it.
        await expect(
          maya.getByText('not the word', { exact: true }).first(),
        ).toBeVisible();
        await still('a wrong guess');
        await guess.fill(word);
        await guess.press('Enter');
        await expect(
          maya.getByText(/guessed the word, \+\d+\./).nth(turn - 1),
        ).toBeVisible();
      }
      await expect(leo.getByRole('list', { name: 'Standings' })).toBeVisible();
    });

    test('doodle chain keeps each step on screen', async ({ player }) => {
      test.setTimeout(90_000);
      const maya = await onPhone(player, 'Maya', size);
      const others = [await player('Leo'), await player('Sam')];
      const link = await createRoom(maya, 'doodle-chain', { seats: 3 });
      for (const other of others) await joinRoom(other, link);
      await expect(maya.getByText(/^3 players, so 3 steps/)).toBeVisible();
      await maya.getByRole('button', { name: 'Start game' }).click();

      const done = maya.getByRole('button', { name: 'Done' });
      await heldStill(
        maya.getByRole('textbox', { name: 'Your first line' }),
        'writing',
      );
      await heldStill(done, 'writing');
      for (const page of [maya, ...others]) {
        await write(page, 'Your first line', 'A cat riding a bicycle');
      }

      await expect(turnOf(maya).getByText('Draw this')).toBeVisible();
      // Once Done, the canvas is only a picture, and says so.
      const canvas = maya.getByRole('img', {
        name: /^(Drawing canvas|The drawing)$/,
      });
      const sheet = await heldStill(canvas, 'drawing');
      const doneStill = await heldStill(done, 'drawing');
      await scribble(maya);
      await sheet('a stroke drawn');
      await doneStill('a stroke drawn');
      await done.click();
      await sheet('done, waiting for the others');

      for (const page of others) {
        await expect(turnOf(page).getByText('Draw this')).toBeVisible();
        await scribble(page);
        await page.getByRole('button', { name: 'Done' }).click();
      }
      await expect(
        turnOf(maya).getByText('What does this drawing show?'),
      ).toBeVisible();
      const field = await heldStill(
        maya.getByRole('textbox', { name: 'Your description' }),
        'describing',
      );
      await heldStill(done, 'describing');
      await write(maya, 'Your description', 'A cat, I think');
      await expect(
        maya.getByRole('button', { name: 'Keep editing' }),
      ).toBeVisible();
      await field('described, waiting for the others');
      for (const page of others) {
        await write(page, 'Your description', 'A cat, I think');
      }

      // The host shows the chains an entry at a time, from the same place.
      const next = maya.getByRole('button', {
        name: /^(Next|Next chain|See the album)$/,
      });
      const showing = await heldStill(next, 'the first entry');
      for (let shown = 2; shown <= 4; shown++) {
        await next.click();
        await expect(
          turnOf(maya).getByText(`${((shown - 1) % 3) + 1} of 3 shown`),
        ).toBeVisible();
        await showing(`entry ${shown}`);
        // The entry it shows is whole, even the first that makes the
        // board scroll.
        await expect.poll(() => currentInBoard(maya)).toBe(true);
      }
    });
  });
}

/**
 * Whether a tap anywhere in the 44 px around the middle of `control`, up,
 * down, left and right as far as its own width allows, lands on it.
 */
const takesAThumb = (control: Locator) =>
  control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const reach = 21;
    const across = Math.min(reach, box.width / 2 + 3);
    const points = [
      [x, y - reach],
      [x, y + reach],
      [x - across, y],
      [x + across, y],
    ] as const;
    return points.every(([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return hit !== null && element.contains(hit);
    });
  });

test('the controls a phone taps often take a thumb', async ({ player }) => {
  const maya = await player('Maya', { phone: true });
  await maya.goto('/');
  const controls = [
    maya.getByRole('button', { name: 'All', exact: true }),
    maya.getByRole('button', { name: 'Puzzles', exact: true }),
    maya.getByRole('radio', { name: 'English' }),
    maya.getByRole('radio', { name: '中文' }),
    maya.getByRole('button', { name: 'Maya: your name' }),
  ];
  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    expect(await takesAThumb(control), String(control)).toBe(true);
  }
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'pairs', { seats: 2 }));
  for (const name of ['Game', /^Players/, /^Chat/]) {
    const tab = maya.getByRole('tab', { name });
    expect(await takesAThumb(tab), String(name)).toBe(true);
  }
});

test('a phone on its side shows the whole Gomoku board beside the turn', async ({
  player,
}) => {
  const sam = await onPhone(player, 'Sam', { width: 844, height: 390 });
  await sam.goto('/games/gomoku/solo');
  const board = sam.getByRole('grid', { name: 'Gomoku board' });
  await expect
    .poll(async () => (await placeOf(board)).inside, { message: 'in sight' })
    .toBe(true);
  const turn = (await turnOf(sam).boundingBox())!;
  const grid = (await board.boundingBox())!;
  // The turn bar is the compact row, at the top of the column beside it.
  expect(turn.height).toBeLessThan(80);
  expect(turn.x).toBeGreaterThan(grid.x + grid.width);
  // A touch screen shows the stone first; Place stone then places it.
  await expect(placeStone(sam)).toBeDisabled();
});
