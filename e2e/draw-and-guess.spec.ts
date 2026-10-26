import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';

const WORD_CHOICE = /\d+ letters?$/;

interface Seat {
  name: string;
  page: Page;
}

/** The words a drawer is offered to choose from. */
const offered = (page: Page) =>
  page.getByRole('button', { name: WORD_CHOICE }).first();

/** The drawer is whoever is offered words to choose from. */
async function whoDraws(a: Seat, b: Seat): Promise<[Seat, Seat]> {
  await expect(
    offered(a.page).or(a.page.getByText(/is choosing a word/)),
  ).toBeVisible();
  return (await offered(a.page).isVisible()) ? [a, b] : [b, a];
}

/** How many letters a guess is measured by: spaces and hyphens aside. */
const letters = (word: string) => word.replace(/[\s-]/g, '').length;

/**
 * Chooses the first word with at least `minLetters` letters, or the first
 * word when none has, and draws a stroke; returns the word.
 */
async function drawAWord(drawer: Page, minLetters = 0): Promise<string> {
  await expect(offered(drawer)).toBeVisible();
  const choices = await drawer.getByRole('button', { name: WORD_CHOICE }).all();
  const words = await Promise.all(
    choices.map(async (choice) =>
      (await choice.locator('span').first().textContent())!.trim(),
    ),
  );
  const pick = Math.max(
    0,
    words.findIndex((word) => letters(word) >= minLetters),
  );
  const word = words[pick]!;
  await choices[pick]!.click();
  await expect(drawer.getByText('Draw this', { exact: true })).toBeVisible();

  const canvas = drawer.getByLabel('Drawing canvas');
  const box = (await canvas.boundingBox())!;
  await drawer.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await drawer.mouse.down();
  await drawer.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, {
    steps: 12,
  });
  await drawer.mouse.up();
  return word;
}

/** Whether anything has been painted on this page's canvas. */
function painted(page: Page): Promise<boolean> {
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const { width, height } = canvas;
    const pixels = canvas
      .getContext('2d')!
      .getImageData(0, 0, width, height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  });
}

async function say(page: Page, text: string, box = 'Message') {
  const input = page.getByRole('textbox', { name: box });
  await input.fill(text);
  await input.press('Enter');
}

/**
 * With two players the turn ends the moment the guesser scores, so the
 * guesser's "You got it!" is gone at once; the room's chat line stays.
 */
async function expectScored(watcher: Page, guesser: Seat) {
  await expect(
    watcher.getByText(
      new RegExp(`^${guesser.name} guessed the word, \\+\\d+\\.$`),
    ),
  ).toBeVisible();
}

/**
 * Two guesses the server calls close: a letter off the word, changed and
 * dropped; or, for a word under four letters, which no misspelling makes
 * close, the word inside a question and the word shouted.
 */
function closeGuesses(word: string): [string, string] {
  const lower = word.toLowerCase();
  if (letters(word) < 4) return [`a ${lower}?`, `${lower}!`];
  const last = lower.at(-1) === 'x' ? 'y' : 'x';
  return [`${lower.slice(0, -1)}${last}`, lower.slice(0, -1)];
}

/**
 * A close guess goes back to the guesser alone, marked close, and so does a
 * second; the drawer is told once that they are close and never sees what
 * they typed.
 */
async function expectClose(
  drawer: Seat,
  guesser: Seat,
  word: string,
  turn: number,
) {
  const [near, nearer] = closeGuesses(word);
  const drawerChat = drawer.page.getByRole('region', { name: 'Chat' });
  // The drawer may have been close themselves as a guesser last turn.
  const theirOwn = await drawerChat.getByText('So close!').count();
  await say(guesser.page, near);
  const own = guesser.page
    .getByRole('region', { name: 'Chat' })
    .getByRole('listitem')
    .filter({ hasText: near });
  await expect(own).toHaveText(`You${near}So close!`);
  const told = drawer.page.getByText(`${guesser.name} is close!`, {
    exact: true,
  });
  await expect(told).toBeVisible();

  await say(guesser.page, nearer);
  await expect(guesser.page.getByText(nearer, { exact: true })).toBeVisible();
  // Once the line after them reaches the drawer, the server has dealt with
  // both close guesses.
  const after = `still guessing, turn ${turn}`;
  await say(guesser.page, after);
  await expect(drawer.page.getByText(after)).toBeVisible();
  await expect(drawerChat.getByText(near)).toHaveCount(0);
  await expect(drawerChat.getByText(nearer, { exact: true })).toHaveCount(0);
  await expect(drawerChat.getByText('So close!')).toHaveCount(theirOwn);
  await expect(told).toHaveCount(1);
}

/**
 * On a desktop the whole sheet and the chat's input are in sight without a
 * scroll, and the spectators beside it are folded to one line.
 */
async function expectAllInSight(page: Page) {
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeInViewport({
    ratio: 1,
  });
  await expect(page.locator('canvas')).toBeInViewport({ ratio: 1 });
  const watching = page.getByRole('region', { name: 'Watching' });
  await expect(
    watching.getByText('Sam', { exact: true }).first(),
  ).toBeVisible();
  await expect(watching.locator('li')).toHaveCount(1);
  await expect(watching.locator('li')).toBeHidden();
}

test('two players play a whole game', async ({ player }) => {
  const maya = { name: 'Maya', page: await player('Maya') };
  const leo = { name: 'Leo', page: await player('Leo') };
  await joinRoom(
    leo.page,
    await createRoom(maya.page, 'draw-and-guess', { rounds: 1 }),
  );
  await maya.page.getByRole('button', { name: 'Start game' }).click();

  for (let turn = 1; turn <= 2; turn++) {
    const [drawer, guesser] = await whoDraws(maya, leo);
    const word = await drawAWord(drawer.page, 4);
    await expect.poll(() => painted(guesser.page)).toBe(true);

    const miss = `not it, turn ${turn}`;
    await say(guesser.page, miss);
    await expect(drawer.page.getByText(miss)).toBeVisible();
    await expectClose(drawer, guesser, word, turn);
    await say(guesser.page, word.toUpperCase());
    await expectScored(drawer.page, guesser);
  }

  await expect(maya.page.getByText('Game over', { exact: true })).toBeVisible();
  await expect(
    maya.page.getByRole('list', { name: 'Standings' }).getByRole('listitem'),
  ).toHaveCount(2);
  await expect(
    maya.page.getByRole('button', { name: 'Play again' }),
  ).toBeVisible();
});

test('a spectator watches the drawing, talks only to the stands, cannot guess, and sees the round sum', async ({
  player,
}) => {
  const maya = { name: 'Maya', page: await player('Maya') };
  const leo = { name: 'Leo', page: await player('Leo') };
  const sam = await player('Sam');
  const link = await createRoom(maya.page, 'draw-and-guess', { rounds: 2 });
  await joinRoom(leo.page, link);
  await joinRoom(sam, link);
  await sam.getByRole('button', { name: 'Watch instead' }).click();
  await expect(
    sam.getByRole('heading', { name: 'You’re watching.' }),
  ).toBeVisible();
  await maya.page.getByRole('button', { name: 'Start game' }).click();

  for (let turn = 1; turn <= 2; turn++) {
    const [drawer, guesser] = await whoDraws(maya, leo);
    const word = await drawAWord(drawer.page);
    await expect.poll(() => painted(sam)).toBe(true);
    if (turn === 1) await expectAllInSight(drawer.page);

    // The word from a spectator is swallowed: it neither shows nor scores.
    // Anything else they say while it is drawn stays among the spectators;
    // once it reaches Sam, the server has dealt with both.
    await say(sam, word);
    const after = `watching turn ${turn}`;
    await say(sam, after);
    const stands = sam.getByRole('region', { name: 'Chat' });
    await expect(stands.getByText(after)).toBeVisible();
    await expect(stands.getByText(word, { exact: true })).toHaveCount(0);
    for (const seat of [drawer, guesser]) {
      const chat = seat.page.getByRole('region', { name: 'Chat' });
      await expect(chat.getByText(after)).toHaveCount(0);
      await expect(chat.getByText(word, { exact: true })).toHaveCount(0);
      await expect(chat.getByText(/^Sam guessed/)).toHaveCount(0);
    }

    await say(guesser.page, word);
    await expectScored(drawer.page, guesser);
  }

  const sum = sam.getByRole('region', { name: 'Round 1 results' });
  await expect(sum).toBeVisible();
  await expect(sum.getByRole('listitem')).toHaveCount(2);
  await expect(sum).not.toContainText('Sam');
});

test('a phone player draws from the words alone and guesses under the board', async ({
  player,
}) => {
  const maya = { name: 'Maya', page: await player('Maya') };
  const leo = { name: 'Leo', page: await player('Leo', { phone: true }) };
  await joinRoom(
    leo.page,
    await createRoom(maya.page, 'draw-and-guess', { rounds: 1 }),
  );
  await maya.page.getByRole('button', { name: 'Start game' }).click();

  for (let turn = 1; turn <= 2; turn++) {
    const [drawer, guesser] = await whoDraws(maya, leo);
    if (drawer === leo) {
      await expect(leo.page.locator('canvas')).toHaveCount(0);
      const word = await drawAWord(leo.page);
      await say(maya.page, word);
    } else {
      const word = await drawAWord(maya.page, 4);
      const board = leo.page.getByRole('tabpanel', { name: 'Game' });
      await expect(board.getByText(/type your guess/)).toHaveCount(0);
      await expect(board.getByRole('textbox', { name: 'Guess' })).toBeVisible();
      // A wrong guess lands under the board, with the newest lines.
      await say(leo.page, 'not it', 'Guess');
      const recent = board.getByRole('log', { name: 'Chat' });
      await expect(recent.getByText('not it')).toBeVisible();
      await expect(recent.getByText(/^Round 1 · \w+ draws$/)).toBeVisible();
      // A close guess lands there too, the guesser's alone, and the room's
      // notice under it.
      const [near] = closeGuesses(word);
      await say(leo.page, near, 'Guess');
      await expect(
        recent.getByRole('listitem').filter({ hasText: near }),
      ).toHaveText(`You${near}So close!`);
      await expect(recent.getByText('Leo is close!')).toBeVisible();
      await say(leo.page, word, 'Guess');
    }
    // The phone's chat is a tab of its own, so the desktop player watches.
    await expectScored(maya.page, guesser);
  }
  await expect(leo.page.getByText('Game over', { exact: true })).toBeVisible();
});

test('leaving a game in progress asks first', async ({ player }) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  const roomName = 'Friday table';
  await joinRoom(
    leo,
    await createRoom(maya, 'draw-and-guess', { name: roomName }),
  );
  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect(leo.getByText('Round 1 of 2')).toBeVisible();

  await leo.getByRole('button', { name: 'Leave room' }).click();
  const confirm = leo.getByRole('dialog', { name: `Leave ${roomName}?` });
  await confirm.getByRole('button', { name: 'Stay' }).click();
  await expect(confirm).toBeHidden();
  await expect(leo).toHaveURL(/\/rooms\//);

  await leo.getByRole('button', { name: 'Leave room' }).click();
  await confirm.getByRole('button', { name: 'Leave room' }).click();
  await expect(leo).toHaveURL(/\/games\/draw-and-guess$/);
  await expect(maya.getByText('Game ended', { exact: true })).toBeVisible();
});
