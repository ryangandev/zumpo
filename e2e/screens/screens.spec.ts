import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import {
  choose,
  createRoom,
  dropConnection,
  duplicateTab,
  expect,
  holdConnection,
  joinRoom,
  test,
  type PlayerOptions,
} from '../fixtures';
import { startServer } from '../own-server';
import { dailyAnswer, roomWords } from '../../shared/daily-word.js';
import { seededRandom, seedNumber } from '../../shared/seed.js';
import { MAX_SPECTATORS } from '../../shared/room.js';
import { guessesOf, solve, typeGuess } from '../play/daily-word';
import {
  ALL_CODES,
  dailyCode,
  MAX_GUESSES,
  roomCodes,
} from '../../shared/code-breaker.js';
import {
  guessesOf as codeGuessesOf,
  solve as solveCode,
  typeGuess as typeCode,
} from '../play/code-breaker';
import { missHand, solveHand, startHand } from '../play/make-24';
import { deal, handOf, play, pressReady, readyUp } from '../play/hush';
import {
  clearABoard,
  hiddenCell,
  hitAMine,
  openMiddle,
  playSure,
  provenMines,
} from '../play/minesweeper';
import {
  boardOf,
  playTurn,
  whoseTurn,
  yourTurn,
  type Memory,
} from '../play/pairs';
import {
  missWith,
  pickPlaces,
  pickTrio,
  readyToFind,
  tableOf,
  trioOn,
  turnOf as triosTurnOf,
  twoBesides,
} from '../play/trios';
import {
  readyToTap,
  tapMatch,
  tapMiss,
  turnOf as snapTurnOf,
} from '../play/snap';
import {
  bidCount,
  bidsOf,
  bidSurelyStands,
  pickBid,
  bluff,
  callLiar,
  move,
  whoseTurn as whoseLiarsDiceTurn,
  yourTurn as yourLiarsDiceTurn,
} from '../play/liars-dice';
import {
  blackOf,
  boardOf as gomokuBoardOf,
  place as placeStone,
  plainMove,
  pointOf,
  stonesOn,
  turnOf as gomokuTurnOf,
} from '../play/gomoku';
import { COMPARE_DIR, figmaSize, writeReport } from './report';

/*
 * Each test plays one stretch of the product and captures the Figma screens
 * it passes through, named by their codes. Captures are full pages at Figma's
 * scale, so a screen and its preview can be laid side by side. The tests run
 * one at a time, and each one's rooms close with its players, so a room list
 * shows only the rooms its own test made.
 */

mkdirSync(COMPARE_DIR, { recursive: true });

const desktop: PlayerOptions = { scale: 1, droppable: true };
const phone: PlayerOptions = { scale: 1, droppable: true, phone: true };

/**
 * Captures the page in a window as tall as the Figma frame, so a page shorter
 * than the frame fills it as it would on that screen, and a longer one runs on.
 */
async function shot(page: Page, code: string) {
  const viewport = page.viewportSize()!;
  const [, height] = figmaSize(code);
  await page.setViewportSize({ width: viewport.width, height });
  await page.evaluate(() => document.fonts.ready);
  // A winner's confetti clears itself; Figma draws the screen after it.
  await expect(page.locator('canvas[aria-hidden]')).toHaveCount(0, {
    timeout: 10_000,
  });
  // Away from every control, so no hover state is captured.
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: path.join(COMPARE_DIR, `${code}.png`),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });
  await page.setViewportSize(viewport);
}

/**
 * Captures the dialog `change` opens over a finished game on your own (MS01,
 * PR01, LD01, GM02), the one place such a game is set, then closes it with
 * nothing changed.
 */
async function shotChange(page: Page, change: string, code: string) {
  await page.getByRole('button', { name: change }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, code);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/**
 * Captures a state that passes on its own, such as a miss on show, and says
 * whether it held for the whole capture; if not, the capture is no good.
 */
async function shotWhile(
  page: Page,
  code: string,
  state: Locator,
): Promise<boolean> {
  if (!(await state.isVisible())) return false;
  await shot(page, code);
  return state.isVisible();
}

/**
 * Stops the page's clock for `capture`, so a state that passes on a timer
 * holds still. The page needs `page.clock.install()` before it loads.
 */
async function paused<T>(page: Page, capture: () => Promise<T>): Promise<T> {
  // A moment ahead: the page's time runs on while this call reaches it.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  try {
    return await capture();
  } finally {
    await page.clock.resume();
  }
}

/** What a game on your own keeps on this device, as if played before. */
async function keepOnDevice(page: Page, kept: Record<string, string>) {
  await page.goto('/');
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      localStorage.setItem(`zumpo:solo:${key}`, value);
    }
  }, kept);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A local calendar day `days` before today, as bests are kept by. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function startGame(host: Page) {
  await host.getByRole('button', { name: 'Start game' }).click();
}

test.afterAll(writeReport);

test('platform pages', async ({ player }) => {
  const visitor = await player('Sam', { ...desktop, named: false });
  await visitor.goto('/');
  await visitor.getByRole('button', { name: /: your name$/ }).click();
  await visitor.getByRole('textbox', { name: 'Your name' }).fill('');
  await visitor.getByRole('button', { name: 'Save' }).click();
  await expect(
    visitor.getByText('Enter a name with at least one visible character.'),
  ).toBeVisible();
  await shot(visitor, 'P03');

  const maya = await player('Maya', desktop);
  await maya.goto('/');
  await shot(maya, 'P01');
  await maya.getByRole('button', { name: 'Maya: your name' }).click();
  await expect(maya.getByRole('dialog', { name: 'Your name' })).toBeVisible();
  await shot(maya, 'P13');
  await maya.keyboard.press('Escape');
  await maya.goto('/games/draw-and-guess/rooms/gone');
  await expect(
    maya.getByRole('heading', { name: 'This room has packed up.' }),
  ).toBeVisible();
  await shot(maya, 'P09');
  await maya.goto('/no-such-page');
  await shot(maya, 'P10');

  const samOnPhone = await player('Sam', phone);
  await samOnPhone.goto('/');
  await shot(samOnPhone, 'MO01');
  await samOnPhone.getByRole('button', { name: 'Sam: your name' }).click();
  await expect(
    samOnPhone.getByRole('dialog', { name: 'Your name' }),
  ).toBeVisible();
  await shot(samOnPhone, 'MO02');
});

test('a picked name in a room, and changing it there', async ({ player }) => {
  const maya = await player('Maya', desktop);
  const link = await createRoom(maya, 'draw-and-guess', {
    name: 'Maya’s room',
    seats: 4,
    rounds: 2,
  });
  const ryan = await player('Ryan', desktop);
  await joinRoom(ryan, link);
  const leo = await player('Brave Noodle', desktop);
  await joinRoom(leo, link);
  await leo.getByRole('button', { name: 'Brave Noodle: your name' }).click();
  await leo.getByRole('textbox', { name: 'Your name' }).fill('Leo');
  await leo.getByRole('button', { name: 'Save' }).click();
  await expect(maya.getByText('Brave Noodle is now Leo.')).toBeVisible();

  const otter = await player('Sleepy Otter', { ...desktop, picked: true });
  await joinRoom(otter, link);
  await expect(
    otter.getByText(
      'You’re Sleepy Otter for now. Pick a name your friends will know.',
    ),
  ).toBeVisible();
  await shot(otter, 'P19');
  await otter.getByRole('button', { name: 'Sleepy Otter: your name' }).click();
  await otter.getByRole('textbox', { name: 'Your name' }).fill('Sam');
  await shot(otter, 'P20');
  await otter.keyboard.press('Escape');
  // Everybody leaves, so the room closes now rather than waiting out the away
  // grace on the shared server, where the next game's rooms are listed.
  for (const page of [otter, leo, ryan, maya]) {
    await page.getByRole('button', { name: 'Leave room' }).click();
    await expect(page).toHaveURL(/\/games\/draw-and-guess$/);
  }
});

test('before a connection, and when it fails', async ({ player }) => {
  const maya = await player('Maya', desktop);
  holdConnection(maya);
  await maya.goto('/games/draw-and-guess');
  await expect(maya.getByText('Finding your people…')).toBeVisible();
  await shot(maya, 'DL03');
  await maya.goto('/games/minesweeper');
  await expect(maya.getByText('Finding your people…')).toBeVisible();
  await shot(maya, 'ML03');
  await maya.goto('/games/draw-and-guess/rooms/somewhere');
  await expect(maya.getByText('Getting the room ready…')).toBeVisible();
  await shot(maya, 'P05');
  // Five retries with a growing delay before the client gives up.
  await expect(maya.getByRole('button', { name: 'Try again' })).toBeVisible({
    timeout: 60_000,
  });
  await shot(maya, 'P06');
});

test('a tab taken over, and a room closed by a restart', async ({ player }) => {
  for (const [name, options, code] of [
    ['Maya', desktop, 'P17'],
    ['Sam', phone, 'MO17'],
  ] as const) {
    const page = await player(name, options);
    const link = await createRoom(page, 'minesweeper');
    const copy = await duplicateTab(page);
    await joinRoom(copy, link);
    await expect(page.getByText('Zumpo is open in another tab.')).toBeVisible();
    await shot(page, code);
    // Leave from the tab that holds the seat, so the room closes now rather
    // than waiting out the away grace on the shared server.
    await copy.getByRole('button', { name: 'Leave room' }).click();
    await expect(copy).toHaveURL(/\/games\/minesweeper$/);
  }

  // A server of this test's own, so stopping it leaves the others alone.
  const server = await startServer();
  try {
    const own = { server: server.url };
    const maya = await player('Maya', { ...desktop, ...own });
    const sam = await player('Sam', { ...phone, ...own });
    await joinRoom(sam, await createRoom(maya, 'minesweeper'));
    server.process.kill('SIGTERM');
    for (const [page, code] of [
      [maya, 'P18'],
      [sam, 'MO18'],
    ] as const) {
      await expect(page.getByText('Zumpo just restarted.')).toBeVisible();
      await shot(page, code);
    }
  } finally {
    server.process.kill('SIGKILL');
  }
});

/**
 * A room in each state a game page lists beside an open one: private, full
 * and playing.
 */
async function roomInEachState(
  player: (name: string, options?: PlayerOptions) => Promise<Page>,
  game: 'draw-and-guess' | 'minesweeper' | 'code-breaker',
) {
  const ryan = await player('Ryan', desktop);
  const privateRoom = await createRoom(ryan, game, {
    name: 'Ryan’s room',
    password: 'otter',
  });
  const leo = await player('Leo', desktop);
  const ada = await player('Ada', desktop);
  await joinRoom(
    ada,
    await createRoom(leo, game, { name: 'Leo’s room', seats: 2 }),
  );
  const kai = await player('Kai', desktop);
  const noor = await player('Noor', desktop);
  const playing = await createRoom(kai, game, { name: 'Kai’s room' });
  await joinRoom(noor, playing);
  await startGame(kai);
  return { privateRoom, playing };
}

/** The lobby pages of one game, empty and then with a room in each state. */
async function lobbyScreens(
  player: (name: string, options?: PlayerOptions) => Promise<Page>,
  game: 'draw-and-guess' | 'minesweeper',
  codes: {
    list: string;
    empty: string;
    create: string;
    invalid: string;
    pending: string;
    menu: string;
    password: string;
    rejected: string;
    unavailable: string;
  },
) {
  const sam = await player('Sam', desktop);
  await sam.goto(`/games/${game}`);
  await expect(sam.getByText('No rooms yet.')).toBeVisible();
  await shot(sam, codes.empty);

  const maya = await player('Maya', desktop);
  await maya.goto(`/games/${game}/new`);
  await shot(maya, codes.create);
  await maya.getByRole('button', { name: 'More options' }).click();
  await maya.getByLabel('Room name').fill('');
  await maya.getByRole('button', { name: 'Create room' }).click();
  await shot(maya, codes.invalid);
  await maya.getByLabel('Room name').fill('Maya’s room');
  // Minesweeper's menu is its board, in view; Draw & Guess's is its seats,
  // under More options, as the name left them.
  if (game === 'minesweeper') await maya.reload();
  await maya
    .getByRole('combobox', {
      name: game === 'minesweeper' ? 'Board' : 'Seats',
      exact: true,
    })
    .click();
  await expect(maya.getByRole('listbox')).toBeVisible();
  await shot(maya, codes.menu);
  await maya.keyboard.press('Escape');
  // The request in flight leaves the form as it opens.
  await maya.reload();
  const restore = await dropConnection(maya);
  await maya.getByRole('button', { name: 'Create room' }).click();
  await expect(maya.getByText('Creating your room…')).toBeVisible();
  await shot(maya, codes.pending);
  restore();
  await expect(maya.getByRole('button', { name: 'Leave room' })).toBeVisible({
    timeout: 20_000,
  });

  const { privateRoom, playing } = await roomInEachState(player, game);
  await expect(sam.getByRole('article')).toHaveCount(4);
  await shot(sam, codes.list);
  if (game === 'draw-and-guess') {
    const samOnPhone = await player('Sam', phone);
    await samOnPhone.goto(`/games/${game}`);
    await expect(samOnPhone.getByRole('article')).toHaveCount(4);
    await shot(samOnPhone, 'MO04');
    await samOnPhone.goto(`/games/${game}/new`);
    await shot(samOnPhone, 'MO05');
    await samOnPhone.goto(privateRoom);
    await shot(samOnPhone, 'MO06');
  }

  await sam.goto(privateRoom);
  await shot(sam, codes.password);
  await sam.getByLabel('Room password').fill('seal');
  await sam.getByRole('button', { name: 'Join room' }).click();
  await expect(sam.getByText('That password didn’t work.')).toBeVisible();
  await shot(sam, codes.rejected);
  // Somebody arriving at a game under way watches it, so a room has moved on
  // only once its spectator seats are taken too.
  for (let seat = 1; seat <= MAX_SPECTATORS; seat++) {
    const watcher = await player(`Watcher ${seat}`, desktop);
    await watcher.goto(playing);
    await expect(
      watcher.getByText(
        'You’re watching this game. You can take a seat once it ends.',
      ),
    ).toBeVisible();
  }
  await sam.goto(playing);
  await expect(
    sam.getByRole('heading', { name: 'That room moved on.' }),
  ).toBeVisible();
  await shot(sam, codes.unavailable);
}

test('Draw & Guess rooms and their lists', async ({ player }) => {
  await lobbyScreens(player, 'draw-and-guess', {
    list: 'DL01',
    empty: 'DL02',
    create: 'DL04',
    invalid: 'DL05',
    pending: 'DL06',
    menu: 'DL10',
    password: 'DL07',
    rejected: 'DL08',
    unavailable: 'DL09',
  });
});

test('Draw & Guess rounds menu', async ({ player }) => {
  const maya = await player('Maya', desktop);
  await maya.goto('/games/draw-and-guess/new');
  await maya.getByRole('combobox', { name: 'Rounds', exact: true }).click();
  await expect(maya.getByRole('listbox')).toBeVisible();
  await shot(maya, 'DL11');
});

test('Minesweeper rooms and their lists', async ({ player }) => {
  await lobbyScreens(player, 'minesweeper', {
    list: 'ML01',
    empty: 'ML02',
    create: 'ML04',
    invalid: 'ML05',
    pending: 'ML06',
    menu: 'ML10',
    password: 'ML07',
    rejected: 'ML08',
    unavailable: 'ML09',
  });
});

interface Seat {
  name: string;
  page: Page;
  phone?: boolean;
}

/** The four players of Figma's example story; Leo is on a phone. */
async function fourPlayers(
  player: (name: string, options?: PlayerOptions) => Promise<Page>,
): Promise<Seat[]> {
  return [
    { name: 'Maya', page: await player('Maya', desktop) },
    { name: 'Ryan', page: await player('Ryan', desktop) },
    { name: 'Sam', page: await player('Sam', desktop) },
    { name: 'Leo', page: await player('Leo', phone), phone: true },
  ];
}

const WORD_CHOICE = /\d+ letters?$/;

/** Whoever is offered words, once the next turn has begun. */
async function nextDrawer(seats: Seat[]): Promise<Seat> {
  const offered = (seat: Seat) =>
    seat.page.getByRole('button', { name: WORD_CHOICE }).first();
  await expect
    .poll(
      async () => {
        for (const seat of seats) if (await offered(seat).isVisible()) return 1;
        return 0;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  for (const seat of seats) if (await offered(seat).isVisible()) return seat;
  throw new Error('no drawer');
}

/**
 * Chooses the shortest word offered, as Figma's "Turtle" is short: a long
 * word wraps the turn bar onto another line and makes the screen taller.
 */
async function chooseAndDraw(drawer: Page): Promise<string> {
  const choices = await drawer.getByRole('button', { name: WORD_CHOICE }).all();
  const words = await Promise.all(
    choices.map(async (choice) =>
      (await choice.locator('span').first().textContent())!.trim(),
    ),
  );
  const shortest = words.reduce(
    (best, word, i) => (word.length < words[best]!.length ? i : best),
    0,
  );
  const word = words[shortest]!;
  await choices[shortest]!.click();
  await draw(drawer);
  return word;
}

async function draw(drawer: Page) {
  const canvas = drawer.getByLabel('Drawing canvas');
  await expect(canvas).toBeVisible();
  // On a desktop the canvas runs below the fold, and a stroke there misses it.
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number) =>
    [box.x + box.width * x, box.y + box.height * y] as const;
  await drawer.mouse.move(...at(0.3, 0.6));
  await drawer.mouse.down();
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    await drawer.mouse.move(
      ...at(0.3 + 0.4 * t, 0.6 - 0.25 * Math.sin(Math.PI * t)),
    );
  }
  await drawer.mouse.up();
}

/** The word the drawer's turn bar shows. */
async function wordOf(drawer: Page): Promise<string> {
  return (await drawer
    .getByRole('region', { name: 'Turn' })
    .locator('p > span')
    .first()
    .textContent())!.trim();
}

async function guess(seat: Seat, text: string) {
  const box = seat.page.getByRole('textbox', {
    name: seat.phone ? 'Guess' : 'Message',
  });
  await box.fill(text);
  await box.press('Enter');
}

test('a Draw & Guess game', async ({ player }) => {
  test.setTimeout(600_000);
  const seats = await fourPlayers(player);
  const [maya, ryan, sam, leo] = seats;

  const link = await createRoom(maya!.page, 'draw-and-guess', { rounds: 1 });
  await shot(maya!.page, 'D01');
  for (const seat of [ryan, sam, leo]) await joinRoom(seat!.page, link);
  await expect(maya!.page.getByText('4 / 8')).toBeVisible();
  await shot(maya!.page, 'D02');
  await shot(ryan!.page, 'D03');
  await ryan!.page.getByRole('link', { name: 'Zumpo home' }).click();
  await shot(ryan!.page, 'P16');
  await ryan!.page.getByRole('button', { name: 'Stay' }).click();
  // P12 is where an invite the clipboard refuses goes.
  await maya!.page.evaluate(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  await maya!.page
    .getByRole('button', { name: 'Invite friends' })
    .first()
    .click();
  await shot(maya!.page, 'P12');
  await maya!.page.getByRole('button', { name: 'Done' }).click();
  await startGame(maya!.page);

  // One round: everybody draws once, Leo on his phone.
  const desktopTurns = ['plain', 'dropped', 'timed out'] as const;
  for (let turn = 0; turn < 4; turn++) {
    const drawer = await nextDrawer(seats);
    const guessers = seats.filter((seat) => seat !== drawer);
    const watcher = guessers.find((seat) => !seat.phone)!;

    if (drawer.phone) {
      await shot(drawer.page, 'MO07');
      const word = await chooseAndDraw(drawer.page);
      await shot(drawer.page, 'MO08');
      for (const seat of guessers) await guess(seat, word);
      continue;
    }

    const kind = desktopTurns[seats.filter((s) => !s.phone).indexOf(drawer)];
    if (kind === 'plain') {
      await shot(drawer.page, 'D04');
      await shot(watcher.page, 'D05');
      const word = await chooseAndDraw(drawer.page);
      await shot(drawer.page, 'D06');
      await shot(watcher.page, 'D07');
      await shot(leo!.page, 'MO09');
      await leo!.page.getByRole('tab', { name: /Players/ }).click();
      await shot(leo!.page, 'MO15');
      await leo!.page.getByRole('tab', { name: 'Chat' }).click();
      await shot(leo!.page, 'MO16');
      await leo!.page.getByRole('tab', { name: 'Game' }).click();

      await watcher.page.getByRole('button', { name: 'Leave room' }).click();
      await shot(watcher.page, 'P11');
      await watcher.page.getByRole('button', { name: 'Stay' }).click();
      await watcher.page.getByRole('button', { name: 'How to play' }).click();
      await shot(watcher.page, 'P15');
      await watcher.page.getByRole('button', { name: 'Full rules' }).click();
      await shot(watcher.page, 'P21');
      await watcher.page
        .getByRole('button', { name: 'Back to the game' })
        .click();

      await guess(watcher, word);
      await expect(watcher.page.getByText(/^You got it! \+\d+$/)).toBeVisible();
      await shot(watcher.page, 'D08');
      for (const seat of guessers)
        if (seat !== watcher) await guess(seat, word);
      await expect(
        maya!.page.getByText('The word was', { exact: true }),
      ).toBeVisible();
      await shot(drawer.page, 'D09');
      await shot(leo!.page, 'MO10');
    } else if (kind === 'dropped') {
      await chooseAndDraw(drawer.page);
      const restore = await dropConnection(drawer.page);
      const notice = watcher.page.getByText(/Their turn is skipped/);
      await expect(notice).toBeVisible();
      await shot(watcher.page, 'D10');
      await expect(drawer.page.getByText(/^Reconnecting to /)).toBeVisible();
      await shot(drawer.page, 'P07');
      // The hold runs out and the turn moves on without them.
      await expect(notice).toBeHidden({
        timeout: 20_000,
      });
      await shot(watcher.page, 'D11');
      restore();
      // Back in the room before the next turn, or its captures show the
      // stale turn this player was cut off in.
      await expect(drawer.page.getByText(/^Reconnecting to /)).toBeHidden({
        timeout: 20_000,
      });
    } else {
      await expect(
        drawer.page.getByText('Time ran out, so this one was picked for you'),
      ).toBeVisible({ timeout: 30_000 });
      await draw(drawer.page);
      await shot(drawer.page, 'D12');
      const word = await wordOf(drawer.page);
      for (const seat of guessers) await guess(seat, word);
    }
  }

  await expect(maya!.page.getByText('Game over', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await shot(maya!.page, 'D13');
  await shot(ryan!.page, 'D14');
});

/** A game left by all but its host: D15 and M16. */
async function endedEarly(
  player: (name: string, options?: PlayerOptions) => Promise<Page>,
  game: 'draw-and-guess' | 'minesweeper',
  code: string,
) {
  const maya = await player('Maya', desktop);
  const ryan = await player('Ryan', desktop);
  await joinRoom(ryan, await createRoom(maya, game));
  await startGame(maya);
  await ryan.getByRole('button', { name: 'Leave room' }).click();
  await ryan
    .getByRole('dialog')
    .getByRole('button', { name: 'Leave room' })
    .click();
  await expect(maya.getByText('Game ended', { exact: true })).toBeVisible();
  await shot(maya, code);
}

test('a Draw & Guess game left early', async ({ player }) => {
  await endedEarly(player, 'draw-and-guess', 'D15');
});

test('a seat released while away', async ({ player }) => {
  test.setTimeout(120_000);
  const maya = await player('Maya', desktop);
  const ryan = await player('Ryan', desktop);
  await joinRoom(ryan, await createRoom(maya, 'draw-and-guess'));
  const restore = await dropConnection(ryan);
  // The server keeps the seat for 30 seconds.
  await expect(
    maya.getByRole('region', { name: 'Players' }).getByText('Ryan'),
  ).toBeHidden({ timeout: 45_000 });
  restore();
  await expect(
    ryan.getByRole('heading', { name: 'Let’s find you a fresh start.' }),
  ).toBeVisible({ timeout: 20_000 });
  await shot(ryan, 'P08');
});

const HIDDEN = /: hidden$/;

function cell(page: Page, row: number, column: number) {
  return page.getByRole('gridcell', {
    name: new RegExp(`^Row ${row}, column ${column}: hidden$`),
  });
}

/** A desktop seat whose last pick found a mine, for M08. */
async function mineHitBy(seats: Seat[]): Promise<Seat | undefined> {
  for (const seat of seats.filter((candidate) => !candidate.phone)) {
    if (await seat.page.getByText(/^Mine\. /).isVisible()) return seat;
  }
  return undefined;
}

test('a Minesweeper game', async ({ player }) => {
  test.setTimeout(600_000);
  const seats = await fourPlayers(player);
  const [maya, ryan, sam, leo] = seats;

  const link = await createRoom(maya!.page, 'minesweeper');
  await shot(maya!.page, 'M01');
  for (const seat of [ryan, sam, leo]) await joinRoom(seat!.page, link);
  await expect(maya!.page.getByText('4 / 8')).toBeVisible();
  await shot(maya!.page, 'M02');
  await shot(ryan!.page, 'M03');
  await startGame(maya!.page);

  await expect(maya!.page.getByText('Pick a cell')).toBeVisible();
  await shot(maya!.page, 'M04');
  await cell(maya!.page, 2, 2).click();
  await expect(
    maya!.page.getByText('Waiting for Ryan, Sam and Leo'),
  ).toBeVisible();
  await shot(maya!.page, 'M05');
  await cell(leo!.page, 8, 2).click();
  await expect(leo!.page.getByText('Waiting for Ryan and Sam')).toBeVisible();
  await shot(leo!.page, 'MO12');
  // Ryan and Sam share a cell; their reward splits if it is safe.
  await cell(ryan!.page, 5, 5).click();
  await cell(sam!.page, 5, 5).click();
  await expect(maya!.page.getByText(/Round 1 results/).first()).toBeVisible();
  await shot(maya!.page, 'M07');
  for (const seat of [ryan, leo]) {
    await expect(seat!.page.getByText(/Round 1 results/).first()).toBeVisible();
  }
  await shot(ryan!.page, 'M09');
  await shot(leo!.page, 'MO13');
  let mine = await mineHitBy(seats);
  if (mine) await shot(mine.page, 'M08');
  // MO11 is a round after a mine was hit, which the turn bar counts.
  let hitCounted = false;
  const countHit = async () => {
    if (!mine || hitCounted) return;
    await expect(leo!.page.getByText('Pick a cell')).toBeVisible();
    await shot(leo!.page, 'MO11');
    hitCounted = true;
  };

  // Round 2: Sam does not pick, so the clock picks the safest cell for him.
  await expect(maya!.page.getByText('Pick a cell')).toBeVisible({
    timeout: 20_000,
  });
  await shot(maya!.page, 'M11');
  await countHit();
  for (const seat of [maya, ryan, leo]) {
    await seat!.page
      .getByRole('gridcell', { name: HIDDEN, disabled: false })
      .first()
      .click();
  }
  await expect(
    sam!.page.getByText('The safest cell was picked for you', { exact: false }),
  ).toBeVisible({ timeout: 30_000 });
  await shot(sam!.page, 'M10');
  await shot(leo!.page, 'MO19');

  // Then everybody picks, riskiest first, until somebody finds a mine and
  // the board is done.
  const over = maya!.page.getByText('Game over', { exact: true });
  for (let round = 3; !(await over.isVisible()); round++) {
    await expect(maya!.page.getByText('Pick a cell').or(over)).toBeVisible({
      timeout: 20_000,
    });
    if (await over.isVisible()) break;
    await countHit();
    for (const [index, seat] of seats.entries()) {
      const hidden = seat.page.getByRole('gridcell', {
        name: HIDDEN,
        disabled: false,
      });
      const count = await hidden.count();
      if (count) await hidden.nth((index * 7 + round) % count).click();
    }
    await expect(maya!.page.getByText('Pick a cell')).toBeHidden();
    if (!mine) {
      await expect(
        maya!.page.getByText(/Round \d+ results/).first(),
      ).toBeVisible();
      mine = await mineHitBy(seats);
      if (mine) await shot(mine.page, 'M08');
    }
  }

  await shot(maya!.page, 'M14');
  await shot(ryan!.page, 'M15');
});

test('a Minesweeper game left early', async ({ player }) => {
  await endedEarly(player, 'minesweeper', 'M16');
});

test('the bigger Minesweeper boards', async ({ player }) => {
  for (const [board, code] of [
    ['Medium', 'M12'],
    ['Large', 'M13'],
  ] as const) {
    const maya = await player('Maya', desktop);
    const ryan = await player('Ryan', desktop);
    const leo = await player('Leo', phone);
    const link = await createRoom(maya, 'minesweeper', { board });
    await joinRoom(ryan, link);
    await joinRoom(leo, link);
    await startGame(maya);
    await expect(maya.getByText('Pick a cell')).toBeVisible();
    await shot(maya, code);
    if (board === 'Large') await shot(leo, 'MO14');
    await maya.getByRole('button', { name: 'Leave room' }).click();
    await maya
      .getByRole('dialog')
      .getByRole('button', { name: 'Leave room' })
      .click();
  }
});

test('Minesweeper on your own', async ({ player }) => {
  test.setTimeout(300_000);
  const sam = await player('Sam', { ...desktop, named: false });
  await keepOnDevice(sam, {
    'minesweeper:board': 'Medium',
    'best:minesweeper:Small': '48000',
    'best:minesweeper:Medium': '192000',
  });
  await sam.goto('/games/minesweeper/solo');
  await openMiddle(sam);
  await playSure(sam, 2);
  await shot(sam, 'MS02');
  await hitAMine(sam);
  await shot(sam, 'MS03');
  await sam.getByRole('button', { name: 'Try again' }).first().click();
  await clearABoard(sam);
  await shot(sam, 'MS04');
  await shotChange(sam, 'Change board', 'MS01');

  const onPhone = await player('Sam', { ...phone, named: false });
  await onPhone.goto('/games/minesweeper/solo?board=Small');
  await openMiddle(onPhone);
  await onPhone.getByRole('button', { name: 'Flag' }).click();
  for (const mine of (await provenMines(onPhone)).slice(0, 3)) {
    await (await hiddenCell(onPhone, mine)).click();
  }
  await shot(onPhone, 'MS05');
});

test('Make 24 on your own', async ({ player }) => {
  test.setTimeout(300_000);
  const maya = await player('Maya', desktop);
  await keepOnDevice(maya, {
    'best:make-24:ten-hands': '185000',
    'days:make-24:ten-hands': JSON.stringify([
      { day: daysAgo(1), result: 185_000 },
      { day: daysAgo(3), result: 220_000 },
    ]),
  });
  await maya.goto('/games/make-24/solo');

  const turn = maya.getByRole('region', { name: 'Turn' });
  const startOver = maya.getByRole('button', { name: 'Start over' });
  let solvedShown = false;
  for (let hand = 1; hand <= 10; hand++) {
    await expect(turn.getByText(`Hand ${hand} of 10`)).toBeVisible();
    if (hand === 3) {
      await startHand(maya);
      await shot(maya, 'T02');
      await startOver.click();
      await missHand(maya);
      await expect(turn.getByText(/^That makes /)).toBeVisible();
      await shot(maya, 'T04');
      await startOver.click();
    }
    // One hand skipped, as Figma's run has.
    if (hand === 5) {
      await maya.getByRole('button', { name: 'Skip, +30 s' }).click();
      await expect(turn.getByText('Skipped')).toBeVisible();
      await shot(maya, 'T13');
      await maya.getByRole('button', { name: 'Next hand' }).click();
      continue;
    }
    await solveHand(maya);
    // "24! Nice." stays a moment, and the last hand goes straight to the end.
    if (hand >= 3 && hand < 10 && !solvedShown) {
      solvedShown = await shotWhile(maya, 'T03', turn.getByText('24! Nice.'));
    }
  }
  await expect(
    maya.getByRole('heading', { name: /^Solved 9 of 10 in / }),
  ).toBeVisible();
  await shot(maya, 'T05');

  const onPhone = await player('Maya', phone);
  await onPhone.goto('/games/make-24/solo');
  await startHand(onPhone);
  await shot(onPhone, 'T11');
});

const turnOf = (page: Page) => page.getByRole('region', { name: 'Turn' });

test('a Make 24 game', async ({ player }) => {
  test.setTimeout(300_000);
  const maya = await player('Maya', desktop);
  const sam = await player('Sam', desktop);
  const ryan = await player('Ryan', desktop);
  const leo = await player('Leo', phone);
  const seats = [maya, sam, ryan, leo];

  await maya.goto('/games/make-24/new');
  await shot(maya, 'T10');
  const link = await createRoom(maya, 'make-24');
  for (const seat of [sam, ryan, leo]) await joinRoom(seat, link);
  await startGame(maya);

  const handOn = async (hand: number) => {
    for (const seat of seats) {
      // After the last hand's reveal, which runs its own clock.
      await expect(
        turnOf(seat).getByText(`Hand ${hand} of 5`, { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    }
  };

  // Hand 1: Maya solves it first, Sam and Leo on the way, Ryan out of time.
  await handOn(1);
  await solveHand(maya);
  await startHand(sam);
  await shot(sam, 'T06');
  await startHand(leo);
  await shot(leo, 'T12');
  await sam.getByRole('button', { name: 'Start over' }).click();
  await solveHand(sam);
  await expect(turnOf(sam).getByText(/^Solved! \+\d+$/)).toBeVisible();
  await shot(sam, 'T07');
  await leo.getByRole('button', { name: 'Start over' }).click();
  await solveHand(leo);
  const results = sam.getByText('Hand 1 results').first();
  await expect(results).toBeVisible({ timeout: 75_000 });
  expect(await shotWhile(sam, 'T08', results)).toBe(true);

  // Then everybody solves every hand, so each ends early.
  for (let hand = 2; hand <= 5; hand++) {
    await handOn(hand);
    for (const seat of seats) await solveHand(seat);
  }
  // After the last hand's reveal.
  await expect(sam.getByText('Game over', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await shot(sam, 'T09');
});

/** Pairs found so far, by the matched cards on the board. */
const pairsFound = async (page: Page) =>
  (await boardOf(page)).filter((card) => card.matched).length / 2;

test('Pairs on your own', async ({ player }) => {
  test.setTimeout(300_000);
  const maya = await player('Maya', desktop);
  await keepOnDevice(maya, {
    'pairs:board': 'Large',
    'best:pairs:Small': JSON.stringify({ turns: 11, ms: 52_000 }),
    'best:pairs:Large': JSON.stringify({ turns: 31, ms: 201_000 }),
  });
  // A miss is on show for only a second.
  await maya.clock.install();
  await maya.goto('/games/pairs/solo');

  const memory: Memory = new Map();
  const cleared = maya.getByRole('heading', {
    name: /^18 pairs in \d+ turns\.$/,
  });
  const miss = maya
    .getByRole('region', { name: 'Turn' })
    .getByText('Not a pair');
  let firstUpShown = false;
  let missShown = false;
  while (!(await cleared.isVisible())) {
    // A few pairs in, as Figma's board is.
    const later = (await pairsFound(maya)) >= 4;
    await playTurn(maya, memory, async () => {
      if (later && !firstUpShown) {
        await shot(maya, 'PR02');
        firstUpShown = true;
      }
    });
    if (later && !missShown && (await miss.isVisible())) {
      missShown = await paused(maya, () => shotWhile(maya, 'PR03', miss));
    }
  }
  expect(missShown, 'a miss captured').toBe(true);
  await shot(maya, 'PR04');
  await shotChange(maya, 'Change board', 'PR01');

  const onPhone = await player('Maya', phone);
  await onPhone.goto('/games/pairs/solo');
  const phoneMemory: Memory = new Map();
  for (let turn = 0; turn < 5; turn++) await playTurn(onPhone, phoneMemory);
  await playTurn(onPhone, phoneMemory, () => shot(onPhone, 'PR09'));
});

test('a Pairs game', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  const sam = await player('Sam', desktop);
  const ryan = await player('Ryan', desktop);
  const leo = await player('Leo', phone);
  const seats = [maya, sam, ryan, leo];

  await maya.goto('/games/pairs/new');
  await choose(maya, 'Board', /^Large/);
  await shot(maya, 'PR08');
  const link = await createRoom(maya, 'pairs', { board: 'Large' });
  for (const seat of [sam, ryan, leo]) await joinRoom(seat, link);
  await startGame(maya);

  const samTurn = sam.getByRole('region', { name: 'Turn' });
  const shown = { yourTurn: false, miss: false, phone: false };
  const memory: Memory = new Map();
  const over = sam.getByText('Game over', { exact: true });
  while (!(await over.isVisible())) {
    await expect
      .poll(async () => (await whoseTurn(seats)) !== null || over.isVisible())
      .toBe(true);
    const mover = await whoseTurn(seats);
    if (!mover) break;
    // A few pairs in, as Figma's board is.
    const later = (await pairsFound(sam)) >= 4;
    if (later && mover === sam && !shown.yourTurn) {
      await expect(yourTurn(sam)).toBeVisible();
      await shot(sam, 'PR06');
      shown.yourTurn = true;
    }
    const samIsNext =
      mover !== sam && (await samTurn.getByText('You’re next.').isVisible());
    // Once a few pairs are in, turns pass on until every shot is taken.
    const exploring = later && Object.values(shown).includes(false);
    await playTurn(
      mover,
      memory,
      async () => {
        if (later && mover === leo && !shown.phone) {
          await shot(leo, 'PR10');
          shown.phone = true;
        }
      },
      exploring,
    );
    if (later && samIsNext && !shown.miss) {
      shown.miss = await shotWhile(
        sam,
        'PR05',
        samTurn.getByText('Not a pair'),
      );
    }
  }
  expect(shown).toEqual({ yourTurn: true, miss: true, phone: true });
  await shot(sam, 'PR07');
});

test('Trios on your own', async ({ player }) => {
  test.setTimeout(300_000);
  const maya = await player('Maya', desktop);
  await keepOnDevice(maya, {
    'best:trios:ten-trios': '168000',
    'days:trios:ten-trios': JSON.stringify([
      { day: daysAgo(1), result: 168_000 },
      { day: daysAgo(2), result: 192_000 },
    ]),
  });
  // "Not a trio" is on show for only a moment.
  await maya.clock.install();
  await maya.goto('/games/trios/solo');

  const turn = triosTurnOf(maya);
  const miss = turn.getByText('Not a trio, +5 s');
  for (let trio = 1; trio <= 10; trio++) {
    await expect(turn.getByText(`Trio ${trio} of 10`)).toBeVisible();
    await readyToFind(maya);
    // A wrong pick on the way to the second trio and the fourth, as
    // Figma's run has, and a hint for the last.
    if (trio === 2) {
      await pickPlaces(maya, missWith(await tableOf(maya), [0, 1]));
      await expect(miss).toBeVisible();
      await readyToFind(maya);
    }
    if (trio === 4) {
      const places = missWith(await tableOf(maya), [7, 8], [11, 10, 9]);
      await pickPlaces(maya, places.slice(0, 2));
      await shot(maya, 'TS02');
      const missShown = await paused(maya, async () => {
        await pickPlaces(maya, places.slice(2));
        return shotWhile(maya, 'TS03', miss);
      });
      expect(missShown, 'a miss captured').toBe(true);
      await readyToFind(maya);
    }
    if (trio === 10) {
      await maya.getByRole('button', { name: 'Hint, +10 s' }).click();
    }
    await pickTrio(maya);
    // The last trio ends the run at once.
    if (trio < 10) await expect(turn.getByText('A trio!')).toBeVisible();
  }
  await expect(
    maya.getByRole('heading', { name: /^10 trios in \d+:\d\d\.$/ }),
  ).toBeVisible();
  await shot(maya, 'TS04');

  const onPhone = await player('Maya', phone);
  await onPhone.goto('/games/trios/solo');
  for (let trio = 1; trio <= 3; trio++) {
    await readyToFind(onPhone);
    await pickTrio(onPhone);
    await expect(triosTurnOf(onPhone).getByText('A trio!')).toBeVisible();
  }
  await expect(triosTurnOf(onPhone).getByText('Trio 4 of 10')).toBeVisible();
  await readyToFind(onPhone);
  // Two cards picked where Figma picks them.
  await pickPlaces(onPhone, [7, 8]);
  await shot(onPhone, 'TS11');
});

test('a Trios game', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  const sam = await player('Sam', desktop);
  const leo = await player('Leo', phone);
  const ryan = await player('Ryan', desktop);
  const seats = [maya, sam, leo, ryan];

  await maya.goto('/games/trios/new');
  await shot(maya, 'TS10');
  const link = await createRoom(maya, 'trios');
  for (const seat of [sam, leo, ryan]) await joinRoom(seat, link);
  await startGame(maya);

  /** `finder` takes the `found`th trio, and everybody sees it taken. */
  const take = async (finder: Page, found: number) => {
    await readyToFind(finder);
    await pickTrio(finder);
    for (const seat of seats) {
      await expect(
        seat.getByText(`${found} of 10 trios`, { exact: true }),
      ).toBeVisible();
    }
  };

  // Four trios in, scored as Figma's are: Maya 2, Sam 1, Leo 1, Ryan 0.
  await take(leo, 1);
  await take(maya, 2);
  await take(maya, 3);
  await take(sam, 4);

  // Sam and Leo each have two cards picked when Maya takes the fifth.
  for (const seat of seats) await readyToFind(seat);
  const trio = trioOn(await tableOf(sam));
  const picks = twoBesides(trio, [3, 8]);
  await pickPlaces(sam, picks);
  await shot(sam, 'TS05');
  await pickPlaces(leo, picks);
  await shot(leo, 'TS12');
  // Leo puts his back, so his own trio later is picked from none.
  await pickPlaces(leo, picks);
  await pickPlaces(maya, trio);
  const taken = triosTurnOf(sam).getByText('Maya found a trio');
  await expect(taken).toBeVisible();
  expect(await shotWhile(sam, 'TS06', taken)).toBe(true);

  // Sam's picks stay through the new cards, and his third is wrong.
  await readyToFind(sam);
  const [, , third] = missWith(await tableOf(sam), picks);
  await pickPlaces(sam, [third!]);
  const locked = triosTurnOf(sam).getByText('locked out');
  await expect(locked).toBeVisible();
  expect(await shotWhile(sam, 'TS07', locked)).toBe(true);

  // Nobody finds one for 30 seconds.
  const hinted = triosTurnOf(sam).getByText('One card of a trio is marked');
  await expect(hinted).toBeVisible({ timeout: 45_000 });
  await shot(sam, 'TS08');

  // Then the rest, to Maya 4, Sam 3, Leo 2 and Ryan 1.
  await take(ryan, 6);
  await take(leo, 7);
  await take(sam, 8);
  await take(sam, 9);
  await readyToFind(maya);
  await pickTrio(maya);
  await expect(sam.getByText('Game over', { exact: true })).toBeVisible();
  await shot(sam, 'TS09');
});

test('Snap on your own', async ({ player }) => {
  test.setTimeout(300_000);
  const maya = await player('Maya', desktop);
  await keepOnDevice(maya, {
    'best:snap:thirty-cards': '112000',
    'days:snap:thirty-cards': JSON.stringify([
      { day: daysAgo(1), result: 112_000 },
      { day: daysAgo(2), result: 125_000 },
    ]),
  });
  // "Not a match" is on show for only a moment.
  await maya.clock.install();
  await maya.goto('/games/snap/solo');

  const turn = snapTurnOf(maya);
  const miss = turn.getByText('Not a match, +3 s');
  for (let card = 1; card <= 30; card++) {
    await expect(turn.getByText(`Card ${card} of 30`)).toBeVisible();
    await readyToTap(maya);
    // A wrong tap on the way to the fifth card and the twelfth, as Figma's
    // run has.
    if (card === 5) {
      await tapMiss(maya);
      await expect(miss).toBeVisible();
      await readyToTap(maya);
    }
    if (card === 12) {
      await shot(maya, 'SN02');
      const missShown = await paused(maya, async () => {
        await tapMiss(maya);
        return shotWhile(maya, 'SN03', miss);
      });
      expect(missShown, 'a miss captured').toBe(true);
      await readyToTap(maya);
    }
    await tapMatch(maya);
  }
  await expect(
    maya.getByRole('heading', { name: /^30 cards in \d+:\d\d\.$/ }),
  ).toBeVisible();
  await shot(maya, 'SN04');

  const onPhone = await player('Maya', phone);
  await onPhone.goto('/games/snap/solo');
  for (let card = 1; card <= 11; card++) {
    await readyToTap(onPhone);
    await tapMatch(onPhone);
  }
  await expect(snapTurnOf(onPhone).getByText('Card 12 of 30')).toBeVisible();
  await readyToTap(onPhone);
  await shot(onPhone, 'SN11');
});

test('a Snap game', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  const sam = await player('Sam', desktop);
  const leo = await player('Leo', phone);
  const ryan = await player('Ryan', desktop);
  const seats = [maya, sam, leo, ryan];

  await maya.goto('/games/snap/new');
  await shot(maya, 'SN10');
  const link = await createRoom(maya, 'snap');
  for (const seat of [sam, leo, ryan]) await joinRoom(seat, link);
  await startGame(maya);

  /** `taker` takes the `taken`th card, and everybody sees it taken. */
  const take = async (taker: Page, taken: number) => {
    await readyToTap(taker);
    await tapMatch(taker);
    for (const seat of seats) {
      await expect(
        seat.getByText(`${taken} of 27 cards`, { exact: true }),
      ).toBeVisible();
    }
  };

  // Nine cards in, scored as Figma's are: Maya 3, Sam 2, Leo 3, Ryan 1.
  const order = [leo, maya, sam, leo, maya, ryan, sam, leo, maya];
  for (const [index, taker] of order.entries()) await take(taker, index + 1);

  for (const seat of seats) await readyToTap(seat);
  await shot(sam, 'SN05');
  await shot(leo, 'SN12');

  // Jo comes in after the start, and watches; only SN13 has Jo.
  const jo = await player('Jo', desktop);
  await joinRoom(jo, link);
  await expect(snapTurnOf(jo).getByText('Everyone is looking')).toBeVisible();
  await shot(jo, 'SN13');
  // Leaving while watching asks nothing.
  await jo.getByRole('button', { name: 'Leave room' }).click();
  await expect(sam.getByRole('region', { name: /^Watching/ })).toBeHidden();

  // Maya takes the tenth, as Sam sees it.
  await tapMatch(maya);
  const taken = snapTurnOf(sam).getByText('Maya took it');
  await expect(taken).toBeVisible();
  expect(await shotWhile(sam, 'SN06', taken)).toBe(true);

  // Sam taps a symbol only on their card, and is locked out.
  await readyToTap(sam);
  await tapMiss(sam);
  const locked = snapTurnOf(sam).getByText('locked out', { exact: true });
  await expect(locked).toBeVisible();
  expect(await shotWhile(sam, 'SN07', locked)).toBe(true);

  // Once it is over, Sam takes the eleventh.
  await readyToTap(sam);
  await tapMatch(sam);
  const yours = snapTurnOf(sam).getByText('You took it!');
  await expect(yours).toBeVisible();
  expect(await shotWhile(sam, 'SN08', yours)).toBe(true);

  // Then the rest, to Maya 9, Sam 7, Leo 6 and Ryan 5, Maya taking the last.
  const rest = [
    ...Array<Page>(4).fill(ryan),
    ...Array<Page>(3).fill(leo),
    ...Array<Page>(4).fill(maya),
    ...Array<Page>(4).fill(sam),
    maya,
  ];
  for (const [index, taker] of rest.entries()) {
    if (index === rest.length - 1) {
      await readyToTap(taker);
      await tapMatch(taker);
    } else await take(taker, index + 12);
  }
  await expect(sam.getByText('Game over', { exact: true })).toBeVisible();
  await shot(sam, 'SN09');
});

/** What a table of bots keeps on this device before each game: 5 of 10 won. */
const LIARS_DICE_RECORD = {
  'record:liars-dice': JSON.stringify({ wins: 5, games: 10, run: 2 }),
  'picks:liars-dice': JSON.stringify({ bots: 3, dicePerPlayer: 3 }),
};

test('Liar’s Dice on your own', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  await keepOnDevice(maya, LIARS_DICE_RECORD);
  // A bot takes a second over its turn; the clock skips it.
  await maya.clock.install();
  await maya.goto('/games/liars-dice/solo');

  const won = maya.getByRole('heading', { name: /^You won in \d+ rounds?\.$/ });
  const out = maya.getByRole('heading', {
    name: /^You finished \d\w\w of 4\.$/,
  });
  const nextRound = maya.getByRole('button', { name: 'Next round' });
  const thinking = maya
    .getByRole('region', { name: 'Turn' })
    .getByText(/ is thinking$/);
  const shown = new Set<string>();
  let calledToLose = false;
  const LD_SOLO = ['LD01', 'LD02', 'LD03', 'LD04', 'LD05', 'LD06'];
  // Until every screen is captured: a mistaken call (LD04) is a chance too.
  for (let games = 1; !LD_SOLO.every((code) => shown.has(code)); games++) {
    // Last of four is a long shot for a player this plain: a game takes a
    // second or two on the fast clock, so it can afford many tries.
    expect(games, 'a game won and a game lost').toBeLessThanOrEqual(100);
    while (!(await won.isVisible()) && !(await out.isVisible())) {
      if (await nextRound.isVisible()) {
        if (calledToLose && !shown.has('LD04')) {
          await shot(maya, 'LD04');
          shown.add('LD04');
        }
        calledToLose = false;
        await nextRound.click();
      } else if (await yourLiarsDiceTurn(maya).isVisible()) {
        const opening = !(await bidsOf(maya).isVisible());
        if (opening && !shown.has('LD02')) {
          // Figma's opening bid: three 4s.
          await pickBid(maya, 3, 4);
          await shot(maya, 'LD02');
          shown.add('LD02');
        }
        // Liar on a bid your own dice already make: a mistake, on purpose.
        if (!shown.has('LD04') && (await bidSurelyStands(maya))) {
          calledToLose = true;
          await callLiar(maya);
        } else {
          await move(maya);
        }
      } else if (await thinking.isVisible()) {
        // A round two bids in, as Figma's is.
        if (!shown.has('LD03') && (await bidCount(maya)) >= 2) {
          if (await paused(maya, () => shotWhile(maya, 'LD03', thinking))) {
            shown.add('LD03');
          }
        }
        await maya.clock.fastForward(1000);
      } else {
        await maya.clock.fastForward(100);
      }
    }
    const code = (await won.isVisible()) ? 'LD05' : 'LD06';
    if (!shown.has(code)) {
      await shot(maya, code);
      shown.add(code);
    }
    if (!shown.has('LD01')) {
      await shotChange(maya, 'Change table', 'LD01');
      shown.add('LD01');
    }
    // The record as Figma's next game starts from.
    await maya.evaluate((entries) => {
      for (const [key, value] of Object.entries(entries)) {
        localStorage.setItem(`zumpo:solo:${key}`, value);
      }
    }, LIARS_DICE_RECORD);
    await maya.getByRole('button', { name: 'Play again' }).click();
  }
  expect(shown).toEqual(new Set(LD_SOLO));

  const onPhone = await player('Maya', phone);
  await onPhone.clock.install();
  await onPhone.goto('/games/liars-dice/solo');
  const phoneNext = onPhone.getByRole('button', { name: 'Next round' });
  const phoneAgain = onPhone.getByRole('button', { name: 'Play again' });
  // Three or four bids in, so they wrap onto a second row as Figma's do.
  const twoRows = async () => [3, 4].includes(await bidCount(onPhone));
  while (!(
    (await yourLiarsDiceTurn(onPhone).isVisible()) && (await twoRows())
  )) {
    if (await phoneNext.isVisible()) await phoneNext.click();
    else if (await phoneAgain.isVisible()) await phoneAgain.click();
    else if (await yourLiarsDiceTurn(onPhone).isVisible()) await move(onPhone);
    else await onPhone.clock.fastForward(1000);
  }
  await shot(onPhone, 'LD13');
});

/** A phone's width for the same page, as Figma draws a screen again for one. */
async function narrow<T>(page: Page, capture: () => Promise<T>): Promise<T> {
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    return await capture();
  } finally {
    await page.setViewportSize(viewport);
  }
}

test('a Liar’s Dice game', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  const sam = await player('Sam', desktop);
  const ryan = await player('Ryan', desktop);
  const leo = await player('Leo', desktop);
  const seats = [maya, sam, ryan, leo];

  const shown = new Set<string>();
  const capture = async (page: Page, code: string) => {
    await shot(page, code);
    shown.add(code);
  };

  await maya.goto('/games/liars-dice/new');
  await capture(maya, 'LD07');
  const link = await createRoom(maya, 'liars-dice', { dice: 3 });
  for (const seat of [sam, ryan, leo]) await joinRoom(seat, link);
  await startGame(maya);

  // Figma follows Sam, on a desktop and again on a phone (LD14, LD15).
  const samNext = sam
    .getByRole('region', { name: 'Sam (you)' })
    .getByText('You go next');
  const ryanOut = ryan.getByText(/^You are out of dice\./);
  const samCalled = sam
    .getByRole('region', { name: 'Turn' })
    .getByText('You called Liar');
  const over = sam.getByText('Game over', { exact: true });
  while (!(await over.isVisible())) {
    await expect
      .poll(
        async () =>
          (await whoseLiarsDiceTurn(seats)) !== null || over.isVisible(),
        { timeout: 30_000 },
      )
      .toBe(true);
    const mover = await whoseLiarsDiceTurn(seats);
    if (!mover) break;
    // A round some bids in, as Figma's are: one row of them on a desktop,
    // three on a phone.
    const bids = await bidCount(mover);
    if (mover !== sam && bids >= 4 && bids <= 5 && !shown.has('LD08')) {
      if (await samNext.isVisible()) await capture(sam, 'LD08');
    }
    if (mover === sam && bids >= 5 && bids <= 6 && !shown.has('LD09')) {
      await capture(sam, 'LD09');
      await narrow(sam, () => capture(sam, 'LD14'));
    }
    if (mover !== ryan && bids > 0 && !shown.has('LD11')) {
      if (await ryanOut.isVisible()) await capture(ryan, 'LD11');
    }

    // Sam calls a bid his own dice already make, and loses a die over it.
    if (
      mover === sam &&
      shown.has('LD09') &&
      !shown.has('LD10') &&
      (await bidSurelyStands(sam))
    ) {
      await callLiar(sam);
      if (await shotWhile(sam, 'LD10', samCalled)) {
        shown.add('LD10');
        await narrow(sam, async () => {
          if (await shotWhile(sam, 'LD15', samCalled)) shown.add('LD15');
        });
      }
      continue;
    }
    // Then Ryan bids every die on the table until he is out.
    if (mover === ryan && shown.has('LD10')) {
      await bluff(ryan);
      continue;
    }
    await move(mover);
  }
  expect(shown).toEqual(
    new Set(['LD07', 'LD08', 'LD09', 'LD10', 'LD11', 'LD14', 'LD15']),
  );
  await shot(sam, 'LD12');
});

test('a Hush game', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  const sam = await player('Sam', desktop);
  const ryan = await player('Ryan', desktop);
  const leo = await player('Leo', phone);
  const seats = [maya, sam, ryan, leo];

  await maya.goto('/games/hush/new');
  await shot(maya, 'HU09');
  const link = await createRoom(maya, 'hush');
  for (const seat of [sam, ryan, leo]) await joinRoom(seat, link);
  await startGame(maya);

  const levelOn = async (level: number) => {
    for (const seat of seats) {
      await expect(
        turnOf(seat).getByText(`Level ${level} of 5`, { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(turnOf(seat).getByText('Get ready')).toBeVisible();
    }
  };
  /** Every card still held, played in order: a clean finish. */
  const playOut = async () => {
    for (const { page, card } of await deal(seats)) {
      await play(page, card, seats);
    }
  };
  /**
   * A card played too soon: only a lowest card can be played, so the highest
   * of those.
   */
  const slip = async () => {
    const lowests = await Promise.all(
      seats.map(async (page) => ({ page, card: (await handOf(page))[0] })),
    );
    const over = lowests.toSorted((a, b) => b.card! - a.card!)[0];
    await play(over!.page, over!.card!, [over!.page]);
  };
  /** Play goes on after a slip, unless it took every card still held. */
  const goOn = () =>
    expect(turnOf(maya).getByText(/^(Hush|Level cleared!)$/)).toBeVisible({
      timeout: 10_000,
    });

  // Level 1 is played clean, and level 2 costs a life, as in Figma's story;
  // Leo looks at level 2 from his phone.
  await levelOn(1);
  await readyUp(seats);
  await playOut();
  await levelOn(2);
  await pressReady([maya]);
  await expect(turnOf(leo).getByText('Maya is ready.')).toBeVisible();
  await shot(leo, 'HU11');
  await readyUp(seats.filter((seat) => seat !== maya));
  await slip();
  await goOn();
  await playOut();

  // Level 3: Maya and Ryan are ready, then the rest, and the cards are dealt.
  await levelOn(3);
  await pressReady([maya, ryan]);
  await expect(turnOf(sam).getByText('Maya and Ryan are ready.')).toBeVisible();
  await shot(sam, 'HU01');
  await pressReady([leo, sam]);
  const counting = turnOf(sam).getByText('Everybody holds 3 cards.');
  await expect(counting).toBeVisible();
  expect(await shotWhile(sam, 'HU02', counting), 'the countdown captured').toBe(
    true,
  );
  await expect(sam.getByRole('button', { name: /^Play \d+$/ })).toBeVisible({
    timeout: 10_000,
  });

  // A few cards in order, while Sam and Leo still hold some, as Figma's are.
  let played = 0;
  for (const { page, card } of await deal(seats)) {
    const keeps = [sam, leo].includes(page) && (await handOf(page)).length < 2;
    if (played === 4 || keeps) break;
    await play(page, card, seats);
    played++;
  }
  await shot(sam, 'HU03');
  await shot(leo, 'HU10');

  // Leo drops, holding cards: the level waits for him.
  const restore = await dropConnection(leo);
  await expect(turnOf(sam).getByText('Paused')).toBeVisible();
  await shot(sam, 'HU05');
  restore();
  await expect(leo.getByRole('button', { name: 'Leave room' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(sam.getByRole('button', { name: /^Play \d+$/ })).toBeVisible({
    timeout: 10_000,
  });

  // A card over somebody's lower one: a life lost. The smallest such slip
  // that Sam does not make, so his hand stays as Figma draws it.
  const lowests = (
    await Promise.all(
      seats.map(async (page) => ({ page, card: (await handOf(page))[0] })),
    )
  )
    .filter(({ card }) => card !== undefined)
    .toSorted((a, b) => a.card! - b.card!);
  const over = lowests.slice(1).find(({ page }) => page !== sam);
  expect(over, 'a card over another player’s').toBeDefined();
  await play(over!.page, over!.card!, [over!.page]);
  const lost = turnOf(sam).getByText(/One life lost\.$/);
  await expect(lost).toBeVisible();
  expect(await shotWhile(sam, 'HU04', lost), 'the mistake captured').toBe(true);
  await goOn();
  await playOut();

  // Level 4, clean, wins the life back.
  await levelOn(4);
  await readyUp(seats);
  await playOut();
  const lifeBack = turnOf(sam).getByText('Not one slip: a life back.');
  await expect(lifeBack).toBeVisible();
  expect(
    await shotWhile(sam, 'HU06', lifeBack),
    'the cleared level captured',
  ).toBe(true);

  // Level 5, the last: the team wins.
  await levelOn(5);
  await readyUp(seats);
  await playOut();
  await expect(
    maya.getByRole('heading', { name: 'All 5 levels cleared.' }),
  ).toBeVisible();
  await shot(maya, 'HU07');

  // Another game, each level lost to a card played too soon, until the
  // lives run out.
  await maya.getByRole('button', { name: 'Play again' }).click();
  for (let level = 1; level <= 3; level++) {
    await levelOn(level);
    await readyUp(seats);
    await slip();
    if (level < 3) {
      await goOn();
      await playOut();
    }
  }
  await expect(
    maya.getByRole('heading', { name: 'Out of lives on level 3.' }),
  ).toBeVisible({ timeout: 15_000 });
  await shot(maya, 'HU08');
});

/*
 * Daily Word on your own runs on the device's date, so each screen is played
 * on Figma's day: word #12 on 16 October 2026, #13 the day after, with the
 * clock stopped at Figma's 09:41:18 to the next word.
 */
const dailyWordDay = (day: number) => new Date(2026, 9, day, 14, 18, 42);

/**
 * Eleven words played before #12, as Figma's device has: 91% found, the last
 * four in a row. Figma's best streak of 7 cannot go with them, so it is 6.
 */
function pastDailyWords(): Record<number, string[]> {
  const fillers = ['stare', 'cloud', 'giant', 'pound', 'hatch', 'match'];
  const played = (puzzle: number, guesses: number, found: boolean) =>
    found
      ? [...fillers.slice(0, guesses - 1), dailyAnswer(puzzle)]
      : fillers.slice(0, 6);
  const lengths = [3, 2, 3, 4, 3, 5, 0, 4, 3, 4, 5];
  return Object.fromEntries(
    lengths.map((guesses, index) => [
      index + 1,
      played(index + 1, guesses || 6, guesses > 0),
    ]),
  );
}

const yourGuesses = (page: Page) =>
  page.getByRole('group', { name: 'Your guesses' });

/** Guesses each word in turn, waiting for each to be marked. */
async function guessWords(page: Page, words: readonly string[]) {
  for (const word of words) {
    const count = (await guessesOf(page)).length;
    await typeGuess(page, word);
    await expect
      .poll(async () => (await guessesOf(page)).length)
      .toBe(count + 1);
  }
}

test('Daily Word on your own', async ({ player }) => {
  test.setTimeout(300_000);
  const kept = { 'daily-word:puzzles': JSON.stringify(pastDailyWords()) };
  const maya = await player('Maya', desktop);
  await maya.clock.setFixedTime(dailyWordDay(16));
  await keepOnDevice(maya, kept);
  await maya.goto('/games/daily-word/solo');
  await expect(yourGuesses(maya)).toBeVisible();
  await shot(maya, 'DW01');

  // Word #12 is UNITE.
  await guessWords(maya, ['stare', 'cloud']);
  await maya.keyboard.type('unt');
  await shot(maya, 'DW02');
  await maya.keyboard.type('ie');
  await maya.keyboard.press('Enter');
  await expect.poll(async () => (await guessesOf(maya)).length).toBe(3);
  await typeGuess(maya, 'blant');
  await expect(maya.getByText('Not in the word list')).toBeVisible();
  await shot(maya, 'DW03');
  for (let i = 0; i < 5; i++) await maya.keyboard.press('Backspace');
  await typeGuess(maya, 'unite');
  await expect(
    maya.getByRole('heading', { name: 'Found in 4.' }),
  ).toBeVisible();
  await shot(maya, 'DW04');

  await maya.getByRole('button', { name: 'Practice word' }).click();
  await solve(maya);
  await expect(
    maya.getByRole('heading', { name: /^Found in \d\.$/ }),
  ).toBeVisible();
  await shot(maya, 'DW06');

  // The next day's word, #13, is SPECK: six guesses that miss it.
  await maya.clock.setFixedTime(dailyWordDay(17));
  await maya.goto('/games/daily-word/solo');
  await expect(yourGuesses(maya)).toBeVisible();
  await guessWords(maya, [
    'hatch',
    'match',
    'latch',
    'batch',
    'patch',
    'catch',
  ]);
  await expect(
    maya.getByRole('heading', { name: 'Not this time.' }),
  ).toBeVisible();
  await shot(maya, 'DW05');

  const onPhone = await player('Maya', phone);
  await onPhone.clock.setFixedTime(dailyWordDay(16));
  await keepOnDevice(onPhone, kept);
  await onPhone.goto('/games/daily-word/solo');
  await expect(yourGuesses(onPhone)).toBeVisible();
  await guessWords(onPhone, ['stare', 'cloud']);
  await onPhone.keyboard.type('unt');
  await shot(onPhone, 'DW12');
});

/**
 * Plays a guess on the way to the word: Figma's own, or, should the seed's
 * word be that one, a word that is never an answer, so it still misses.
 */
const missing = (answer: string) => (word: string) =>
  word === answer ? 'tears' : word;

/**
 * Figma's guesses, then the word itself. Each is waited for until it is
 * marked, but for the word found last, which ends the word at once.
 */
async function findIt(
  page: Page,
  answer: string,
  misses: readonly string[],
  last = false,
) {
  await guessWords(page, misses.map(missing(answer)));
  if (last) await typeGuess(page, answer);
  else await guessWords(page, [answer]);
}

async function say(page: Page, text: string, onPhone = false) {
  if (onPhone) await page.getByRole('tab', { name: 'Chat' }).click();
  const box = page.getByRole('textbox', { name: 'Message' });
  await box.fill(text);
  await box.press('Enter');
  await expect(page.getByText(text, { exact: true }).last()).toBeVisible();
  // Back to the board, whose keys are not heard while the chat has focus.
  await box.blur();
  if (onPhone) {
    await page.getByRole('tab', { name: 'Game' }).click();
    // A thumb on the on-screen keys leaves the tab without a focus ring.
    await page.getByRole('tab', { name: 'Game' }).blur();
  }
}

test('a Daily Word game', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  const sam = await player('Sam', desktop);
  const ryan = await player('Ryan', desktop);
  const leo = await player('Leo', phone);
  const seats = [maya, sam, ryan, leo];

  await maya.goto('/games/daily-word/new');
  await shot(maya, 'DW11');
  const link = await createRoom(maya, 'daily-word');
  for (const seat of [sam, ryan, leo]) await joinRoom(seat, link);
  await startGame(maya);

  const wordOn = async (word: number) => {
    for (const seat of seats) {
      // After the last word's reveal, which runs its own clock.
      await expect(
        turnOf(seat).getByText(`Word ${word} of 3`, { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(yourGuesses(seat)).toBeVisible();
    }
  };

  // The server deals from the seed in screens.config.ts, so the words are
  // known here and Figma's story plays the same whatever they are.
  const [first, second, third] = roomWords(
    seededRandom(seedNumber(process.env.DAILY_WORD_SEED!)),
    3,
    new Date(),
  );

  // Word 1: everybody finds it in three.
  await wordOn(1);
  for (const seat of seats) {
    await findIt(seat, first!, ['stare', 'cloud'], seat === seats.at(-1));
  }

  // Word 2, as Figma tells it: Maya finds it while the others are guessing.
  await wordOn(2);
  const miss = missing(second!);
  await say(ryan, 'good luck');
  await findIt(maya, second!, ['stare', 'hoist']);
  await say(leo, 'how?!', true);
  await guessWords(sam, ['crane', 'south', 'moist'].map(miss));
  await guessWords(ryan, ['audio', 'those', 'shoot', 'boost'].map(miss));
  await guessWords(leo, ['lemon', 'sport', 'frost'].map(miss));
  await sam.keyboard.type(second!.slice(0, 3));
  await shot(sam, 'DW07');
  await leo.keyboard.type(second!.slice(0, 3));
  await shot(leo, 'DW13');
  await leo.getByRole('tab', { name: /^Players/ }).click();
  await shot(leo, 'DW14');
  await leo.getByRole('tab', { name: 'Game' }).click();
  await leo.getByRole('tab', { name: 'Game' }).blur();
  for (let i = 0; i < 3; i++) await leo.keyboard.press('Backspace');

  // Sam finds it in four; Ryan and Leo guess on.
  for (let i = 0; i < 3; i++) await sam.keyboard.press('Backspace');
  await findIt(sam, second!, []);
  await guessWords(ryan, [miss('roost')]);
  await guessWords(leo, [miss('hoist')]);
  await expect(
    turnOf(sam).getByText('Got it in 4! +', { exact: false }),
  ).toBeVisible();
  await shot(sam, 'DW08');

  // Leo finds it in five and Ryan's last guess misses, which ends the word.
  await findIt(leo, second!, []);
  // Ryan's sixth guess is the last of the word, which ends at once.
  await typeGuess(ryan, miss('hoist'));
  const results = sam.getByRole('heading', { name: 'Word 2 results' });
  await expect(results).toBeVisible();
  await expect(
    turnOf(sam).getByText(second!.toUpperCase(), { exact: true }),
  ).toBeVisible();
  await say(ryan, 'HOIST was so close');
  expect(await shotWhile(sam, 'DW09', results)).toBe(true);
  expect(
    await shotWhile(
      leo,
      'DW15',
      leo.getByRole('heading', { name: 'Word 2 results' }),
    ),
  ).toBe(true);

  // Word 3, as Figma's boards have it, and the game is over.
  await wordOn(3);
  await findIt(ryan, third!, ['stale', 'alike']);
  await findIt(sam, third!, ['crane', 'plate', 'blame']);
  await findIt(maya, third!, ['share', 'blade', 'place', 'flake']);
  await findIt(
    leo,
    third!,
    ['audio', 'trend', 'slick', 'plumb', 'clamp'],
    true,
  );
  await expect(maya.getByText('Game over', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await say(sam, 'by nine points!');
  await say(leo, 'gg', true);
  await shot(maya, 'DW10');
  await shot(leo, 'DW16');
});

/*
 * Code Breaker on your own runs on the device's date too: code #12 on
 * 1 November 2026, #13 the day after, the clock stopped at Figma's 09:41:18
 * to the next code. Figma's guesses are played as they are, against whatever
 * the codes turn out to be, so the pegs are the codes' own.
 */
const codeBreakerDay = (day: number) => new Date(2026, 10, day, 14, 18, 42);

/** Figma's guess, or, should it be the code itself, the next code that is not. */
function missingCode(code: string, guesses: readonly string[]) {
  const played = new Set<string>();
  return guesses.map((figma) => {
    const miss =
      figma !== code && !played.has(figma)
        ? figma
        : ALL_CODES.find((other) => other !== code && !played.has(other))!;
    played.add(miss);
    return miss;
  });
}

/**
 * Eleven codes played before #12, as Figma's device has: 91% cracked, the
 * last four in a row, a best streak of 6, and the bars CB06 draws once #12 is
 * cracked in 6.
 */
function pastCodes(): Record<number, string[]> {
  const lengths = [6, 5, 7, 4, 6, 8, 0, 5, 9, 7, 6];
  return Object.fromEntries(
    lengths.map((guesses, index) => {
      const code = dailyCode(index + 1);
      const misses = ALL_CODES.filter((other) => other !== code);
      return [
        index + 1,
        guesses === 0
          ? misses.slice(0, MAX_GUESSES)
          : [...misses.slice(0, guesses - 1), code],
      ];
    }),
  );
}

/** Guesses each code in turn, waiting for each to be marked. */
async function guessCodes(page: Page, codes: readonly string[]) {
  for (const code of codes) {
    const count = (await codeGuessesOf(page)).length;
    await typeCode(page, code);
    await expect
      .poll(async () => (await codeGuessesOf(page)).length)
      .toBe(count + 1);
  }
}

/** Notes, with the Notes toggle on: each digit key pressed `times` times. */
async function note(page: Page, presses: Record<string, number>) {
  for (const [digit, times] of Object.entries(presses)) {
    for (let i = 0; i < times; i++) await page.keyboard.press(digit);
  }
}

const notesToggle = (page: Page) =>
  page.getByRole('button', { name: 'Notes', exact: true });

/** Maya's notes in CB03: 2 and 9 out, 1 and 4 in. */
const MAYA_NOTES = { 2: 1, 9: 1, 1: 2, 4: 2 };

test('the Code Breaker game page', async ({ player }) => {
  const maya = await player('Maya', desktop);
  await createRoom(maya, 'code-breaker', { name: 'Maya’s room' });
  await roomInEachState(player, 'code-breaker');

  const sam = await player('Sam', desktop);
  await sam.goto('/games/code-breaker');
  await expect(sam.getByRole('article')).toHaveCount(4);
  await shot(sam, 'CB01');
  const samOnPhone = await player('Sam', phone);
  await samOnPhone.goto('/games/code-breaker');
  await expect(samOnPhone.getByRole('article')).toHaveCount(4);
  await shot(samOnPhone, 'CB15');
});

test('Code Breaker on your own', async ({ player }) => {
  test.setTimeout(300_000);
  const kept = { 'code-breaker:puzzles': JSON.stringify(pastCodes()) };
  const twelfth = dailyCode(12);
  const [first, second, third, fourth, fifth] = missingCode(twelfth, [
    '1234',
    '5689',
    '2149',
    '4310',
    '4170',
  ]);

  const maya = await player('Maya', desktop);
  await maya.clock.setFixedTime(codeBreakerDay(1));
  await keepOnDevice(maya, kept);
  await maya.goto('/games/code-breaker/solo');
  await expect(yourGuesses(maya)).toBeVisible();
  await shot(maya, 'CB02');

  await guessCodes(maya, [first!, second!, third!]);
  await notesToggle(maya).click();
  await note(maya, MAYA_NOTES);
  await notesToggle(maya).click();
  await maya.keyboard.type('43');
  await shot(maya, 'CB03');
  await notesToggle(maya).click();
  await note(maya, { 5: 1, 6: 1 });
  await shot(maya, 'CB04');
  // Back to CB03's notes, and Notes off.
  await note(maya, { 5: 2, 6: 2 });
  await notesToggle(maya).click();

  for (let i = 0; i < 2; i++) await maya.keyboard.press('Backspace');
  await typeCode(maya, third!);
  await expect(maya.getByText('Already guessed')).toBeVisible();
  await shot(maya, 'CB05');
  for (let i = 0; i < 4; i++) await maya.keyboard.press('Backspace');
  await guessCodes(maya, [fourth!, fifth!]);
  await typeCode(maya, twelfth);
  await expect(
    maya.getByRole('heading', { name: 'Cracked in 6.' }),
  ).toBeVisible();
  await shot(maya, 'CB06');

  await maya.getByRole('button', { name: 'Practice code' }).click();
  await solveCode(maya);
  await expect(
    maya.getByRole('heading', { name: /^(Cracked in \d+\.|Not this time\.)$/ }),
  ).toBeVisible();
  await shot(maya, 'CB08');

  // The next day's code, #13: ten guesses that miss it.
  await maya.clock.setFixedTime(codeBreakerDay(2));
  await maya.goto('/games/code-breaker/solo');
  await expect(yourGuesses(maya)).toBeVisible();
  await guessCodes(
    maya,
    missingCode(dailyCode(13), [
      '1234',
      '8749',
      '9726',
      '9386',
      '0294',
      '6345',
      '3821',
      '7582',
      '8931',
      '2503',
    ]),
  );
  await expect(
    maya.getByRole('heading', { name: 'Not this time.' }),
  ).toBeVisible();
  await shot(maya, 'CB07');

  const onPhone = await player('Maya', phone);
  await onPhone.clock.setFixedTime(codeBreakerDay(1));
  await keepOnDevice(onPhone, kept);
  await onPhone.goto('/games/code-breaker/solo');
  await expect(yourGuesses(onPhone)).toBeVisible();
  await guessCodes(onPhone, [first!, second!, third!]);
  await notesToggle(onPhone).click();
  await note(onPhone, MAYA_NOTES);
  await shot(onPhone, 'CB16');
  await notesToggle(onPhone).click();
  await guessCodes(onPhone, [fourth!, fifth!]);
  await typeCode(onPhone, twelfth);
  await expect(
    onPhone.getByRole('heading', { name: 'Cracked in 6.' }),
  ).toBeVisible();
  await shot(onPhone, 'CB17');
});

/**
 * Figma's guesses, then the code itself. Each is waited for until it is
 * marked, but for the code cracked last, which ends the round at once.
 */
async function crackIt(
  page: Page,
  code: string,
  misses: readonly string[],
  last = false,
) {
  await guessCodes(page, missingCode(code, misses));
  if (last) await typeCode(page, code);
  else await guessCodes(page, [code]);
}

test('a Code Breaker game', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  const sam = await player('Sam', desktop);
  const ryan = await player('Ryan', desktop);
  const leo = await player('Leo', phone);
  const seats = [maya, sam, ryan, leo];

  await maya.goto('/games/code-breaker/new');
  await shot(maya, 'CB14');
  const link = await createRoom(maya, 'code-breaker');
  for (const seat of [sam, ryan, leo]) await joinRoom(seat, link);
  await startGame(maya);

  const codeOn = async (code: number) => {
    for (const seat of seats) {
      // After the last code's reveal, which runs its own clock.
      await expect(
        turnOf(seat).getByText(`Code ${code} of 3`, { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(yourGuesses(seat)).toBeVisible();
    }
  };

  // The server deals from the seed in screens.config.ts, so the codes are
  // known here and Figma's story plays the same whatever they are.
  const [first, second, third] = roomCodes(
    seededRandom(seedNumber(process.env.CODE_BREAKER_SEED!)),
    3,
    new Date(),
  );

  // Code 1: everybody cracks it in three.
  await codeOn(1);
  for (const seat of seats) {
    await crackIt(seat, first!, ['1234', '5678'], seat === seats.at(-1));
  }

  // Code 2, as Figma tells it: Maya cracks it in 5 while the others guess.
  await codeOn(2);
  const sams = missingCode(second!, ['0123', '5231', '6310', '4302', '8302']);
  const ryans = missingCode(second!, [
    '9876',
    '2506',
    '0815',
    '8630',
    '9420',
    '8217',
    '1467',
    '1238',
    '8947',
    '9167',
  ]);
  const leos = missingCode(second!, [
    '5678',
    '6059',
    '3028',
    '0182',
    '7485',
    '2983',
    '0698',
  ]);
  await crackIt(maya, second!, ['1234', '2495', '7382', '0382']);
  await guessCodes(sam, sams.slice(0, 3));
  await guessCodes(ryan, ryans.slice(0, 4));
  await guessCodes(leo, leos.slice(0, 3));
  await sam.keyboard.type(sams[3]!.slice(0, 2));
  await shot(sam, 'CB09');
  await leo.keyboard.type(leos[3]!.slice(0, 2));
  await shot(leo, 'CB18');
  await leo.getByRole('tab', { name: /^Players/ }).click();
  await shot(leo, 'CB19');
  await leo.getByRole('tab', { name: 'Game' }).click();
  await leo.getByRole('tab', { name: 'Game' }).blur();
  for (let i = 0; i < 2; i++) await leo.keyboard.press('Backspace');

  // Sam cracks it in six; Ryan reaches seven guesses and Leo five.
  for (let i = 0; i < 2; i++) await sam.keyboard.press('Backspace');
  await crackIt(sam, second!, sams.slice(3));
  await guessCodes(ryan, ryans.slice(4, 7));
  await guessCodes(leo, leos.slice(3, 5));
  await expect(
    turnOf(sam).getByText('Cracked it in 6! +', { exact: false }),
  ).toBeVisible();
  await shot(sam, 'CB10');

  // Ryan runs out of guesses while Leo, at seven, guesses on.
  await guessCodes(ryan, ryans.slice(7));
  await guessCodes(leo, leos.slice(5));
  await expect(
    turnOf(ryan).getByText('Out of guesses', { exact: true }),
  ).toBeVisible();
  await shot(ryan, 'CB11');

  // Leo cracks it in eight, the last guess of the code, which ends at once.
  await typeCode(leo, second!);
  const results = sam.getByRole('heading', { name: 'Code 2 results' });
  await expect(results).toBeVisible();
  expect(await shotWhile(sam, 'CB12', results)).toBe(true);
  expect(
    await shotWhile(
      leo,
      'CB20',
      leo.getByRole('heading', { name: 'Code 2 results' }),
    ),
  ).toBe(true);

  // Code 3, as Figma's boards have it, and the game is over.
  await codeOn(3);
  await crackIt(maya, third!, ['1234', '0789', '6750', '9586']);
  await crackIt(sam, third!, ['0347', '6259', '8296', '2169']);
  await crackIt(ryan, third!, ['4567', '1247', '6583', '5860', '5360']);
  const leoMisses = missingCode(third!, [
    '1023',
    '1038',
    '8047',
    '7605',
    '3476',
    '0523',
    '6859',
    '0146',
    '4296',
    '3748',
  ]);
  await guessCodes(leo, leoMisses.slice(0, -1));
  // Leo's tenth guess is the last of the code, which ends the game.
  await typeCode(leo, leoMisses.at(-1)!);
  await expect(maya.getByText('Game over', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await shot(sam, 'CB13');
  await shot(leo, 'CB21');
});

/** Gomoku's record on this device, as Figma's: 4 of 9 won, the last two. */
const GOMOKU_RECORD = {
  'record:gomoku': JSON.stringify({
    easy: { wins: 4, losses: 5, draws: 0, run: 2 },
    medium: { wins: 4, losses: 5, draws: 0, run: 2 },
  }),
};

/** Your turn on your own: the hint under the board is back. */
const yourGomokuTurn = (page: Page) =>
  page.getByText(/^(Hover a point|Tap the faint stone)/);

/** Places a stone on your own, with a second tap on a phone. */
async function placeAlone(page: Page, name: string, stone: 'black' | 'white') {
  await pointOf(page, name).click();
  const placed = gomokuBoardOf(page).getByRole('gridcell', {
    name: new RegExp(`^${name}, ${stone} stone`),
  });
  const faint = page.getByRole('button', { name: 'Place stone' });
  await expect(placed.or(faint)).toBeVisible();
  if (await faint.isVisible()) await pointOf(page, name).click();
  await expect(placed).toBeVisible();
}

/** Points two apart each way, where a player's stones never make five. */
const APART = [1, 3, 5, 7, 9, 11, 13, 15].flatMap((row) =>
  [...'ACEGIKMO'].map((column) => `${column}${row}`),
);

test('Gomoku on your own', async ({ player }) => {
  test.setTimeout(300_000);
  const maya = await player('Maya', desktop);
  await keepOnDevice(maya, GOMOKU_RECORD);
  // The computer takes half a second at least; the clock can hold it there.
  await maya.clock.install();
  await maya.goto('/games/gomoku/solo');

  // Sixteen stones down, as Figma's are, Maya playing Black as plainly as a
  // newcomer: her longest open line, or a block of the computer's.
  for (let stones = 0; stones < 8; stones++) {
    await expect(yourGomokuTurn(maya)).toBeVisible();
    await placeAlone(maya, plainMove(await stonesOn(maya), 'black'), 'black');
  }
  await expect(yourGomokuTurn(maya)).toBeVisible();
  await shot(maya, 'GM03');
  const thinking = gomokuTurnOf(maya).getByText('The computer is thinking');
  const held = await paused(maya, async () => {
    const name = plainMove(await stonesOn(maya), 'black');
    await pointOf(maya, name).click();
    await expect(thinking).toBeVisible();
    return shotWhile(maya, 'GM04', thinking);
  });
  expect(held, 'the computer captured thinking').toBe(true);

  // A game won, against Easy: it stops a four, but not an open three.
  await keepOnDevice(maya, {
    'picks:gomoku': JSON.stringify({ level: 'easy', color: 'black' }),
  });
  await maya.goto('/games/gomoku/solo');
  const won = maya.getByRole('heading', {
    name: /^You won on move \d+\.$/,
  });
  for (;;) {
    await expect(yourGomokuTurn(maya).or(won)).toBeVisible();
    if (await won.isVisible()) break;
    await placeAlone(maya, plainMove(await stonesOn(maya), 'black'), 'black');
  }
  await shot(maya, 'GM05');
  await shotChange(maya, 'Change level', 'GM02');

  // And one lost, Maya now White, her stones kept far apart.
  await maya.getByRole('button', { name: 'Play again' }).click();
  const lost = maya.getByRole('heading', {
    name: /^The computer won on move \d+\.$/,
  });
  for (;;) {
    await expect(yourGomokuTurn(maya).or(lost)).toBeVisible();
    if (await lost.isVisible()) break;
    const stones = await stonesOn(maya);
    await placeAlone(
      maya,
      APART.find((name) => !stones.has(name))!,
      'white',
    );
  }
  await shot(maya, 'GM06');

  const onPhone = await player('Maya', phone);
  await onPhone.goto('/games/gomoku/solo');
  for (let stones = 0; stones < 4; stones++) {
    await expect(yourGomokuTurn(onPhone)).toBeVisible();
    const name = plainMove(await stonesOn(onPhone), 'black');
    await placeAlone(onPhone, name, 'black');
  }
  await expect(yourGomokuTurn(onPhone)).toBeVisible();
  // A first tap: the faint stone, and Place stone.
  await pointOf(onPhone, plainMove(await stonesOn(onPhone), 'black')).tap();
  await expect(
    onPhone.getByRole('button', { name: 'Place stone' }),
  ).toBeVisible();
  await shot(onPhone, 'GM17');
});

test('Gomoku rooms and their list', async ({ player }) => {
  // A room in each state the list shows: open, private, full and playing.
  const maya = await player('Maya', desktop);
  await createRoom(maya, 'gomoku', { name: 'Maya’s room' });
  const ryan = await player('Ryan', desktop);
  await createRoom(ryan, 'gomoku', { name: 'Ryan’s room', password: 'otter' });
  const leo = await player('Leo', desktop);
  const ada = await player('Ada', desktop);
  await joinRoom(ada, await createRoom(leo, 'gomoku', { name: 'Leo’s room' }));
  const kai = await player('Kai', desktop);
  const noor = await player('Noor', desktop);
  const playing = await createRoom(kai, 'gomoku', { name: 'Kai’s room' });
  await joinRoom(noor, playing);
  await startGame(kai);

  const sam = await player('Sam', desktop);
  await sam.goto('/games/gomoku');
  await expect(sam.getByRole('article')).toHaveCount(4);
  await shot(sam, 'GM01');
  const samOnPhone = await player('Sam', phone);
  await samOnPhone.goto('/games/gomoku');
  await expect(samOnPhone.getByRole('article')).toHaveCount(4);
  await shot(samOnPhone, 'GM20');
});

/**
 * Plays `moves` in turn, Black's first: each a pair of a stone for Black and
 * one for White, a null one left out. A player's stones go at most three a
 * second, under the server's room rate limit, which drops a faster one.
 */
async function playGomoku(
  black: Page,
  white: Page,
  moves: readonly (readonly [string | null, string | null])[],
) {
  const last = new Map<Page, number>();
  const paced = async (page: Page, name: string) => {
    const wait = (last.get(page) ?? 0) + 350 - Date.now();
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    last.set(page, Date.now());
    await placeStone(page, name);
  };
  for (const [forBlack, forWhite] of moves) {
    if (forBlack) await paced(black, forBlack);
    if (forWhite) await paced(white, forWhite);
  }
}

test('a Gomoku game', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  const leo = await player('Leo', desktop);
  const sam = await player('Sam', desktop);
  const ryan = await player('Ryan', desktop);
  await maya.goto('/games/gomoku/new');
  await shot(maya, 'GM07');
  const link = await createRoom(maya, 'gomoku');
  await joinRoom(leo, link);
  await joinRoom(sam, link);
  await expect(maya.getByRole('button', { name: 'Start game' })).toBeVisible();
  await shot(maya, 'GM08');
  await joinRoom(ryan, link);

  // Game 1 goes to Leo, whichever colour the draw gives him.
  await startGame(maya);
  const firstBlack = await blackOf([maya, leo]);
  const leoLine = ['E8', 'F8', 'G8', 'H8', 'I8'];
  const mayaApart = ['A1', 'C1', 'E1', 'G1', 'J1'];
  if (firstBlack === leo) {
    await playGomoku(leo, maya, [
      ...leoLine.slice(0, 4).map((name, i) => [name, mayaApart[i]!] as const),
      [leoLine[4]!, null],
    ]);
  } else {
    await playGomoku(
      maya,
      leo,
      mayaApart.map((name, i) => [name, leoLine[i] ?? null] as const),
    );
  }
  await expect(
    maya.getByText('Game over', { exact: true }).first(),
  ).toBeVisible();

  // Game 2, the colours swapped: Maya builds on a slant while Leo plays
  // elsewhere, then it is Maya's turn.
  await maya.getByRole('button', { name: 'Start game 2' }).click();
  const black = await blackOf([maya, leo]);
  const white = black === maya ? leo : maya;
  const mayaMoves = ['E5', 'F6', 'G7', 'H8', 'D6'];
  const leoMoves = ['H6', 'I7', 'J9', 'G9', 'F9'];
  await playGomoku(
    black,
    white,
    mayaMoves.map(
      (mine, i) =>
        (black === maya ? [mine, leoMoves[i]!] : [leoMoves[i]!, mine]) as [
          string,
          string,
        ],
    ),
  );
  // Leo, playing Black, has one more stone before it is Maya's turn.
  if (black === leo) await placeStone(leo, 'K8');
  await expect(gomokuTurnOf(maya).getByText('Your turn')).toBeVisible();
  await shot(maya, 'GM09');
  await shot(sam, 'GM16');
  await maya.getByRole('button', { name: 'Resign' }).click();
  await expect(maya.getByRole('dialog')).toBeVisible();
  await shot(maya, 'GM12');
  await maya.getByRole('button', { name: 'Keep playing' }).click();
  await placeStone(maya, 'L11');
  await expect(gomokuTurnOf(maya).getByText('Leo’s turn')).toBeVisible();
  await shot(maya, 'GM10');

  // Leo lets his 30 seconds run out; the turn passes back to Maya.
  await expect(gomokuTurnOf(leo).getByText('Your turn passed')).toBeVisible({
    timeout: 45_000,
  });
  await shot(leo, 'GM11');
  // Maya's fifth on the slant.
  await placeStone(maya, 'I9');
  await expect(
    maya.getByRole('heading', { name: 'You win with five in a row.' }),
  ).toBeVisible();
  await shot(maya, 'GM13');

  // Game 3: Leo leaves under way, and loses it.
  await maya.getByRole('button', { name: 'Start game 3' }).click();
  const third = await blackOf([maya, leo]);
  await placeStone(third, 'H8');
  await leo.getByRole('button', { name: 'Leave room' }).click();
  await leo
    .getByRole('dialog')
    .getByRole('button', { name: 'Leave room' })
    .click();
  await expect(
    maya.getByRole('heading', { name: 'You win: Leo left the room.' }),
  ).toBeVisible();
  await shot(maya, 'GM14');
});

test('a Gomoku game played to a full board', async ({ player }) => {
  test.setTimeout(600_000);
  const maya = await player('Maya', desktop);
  const leo = await player('Leo', desktop);
  await joinRoom(leo, await createRoom(maya, 'gomoku'));
  await startGame(maya);
  const black = await blackOf([maya, leo]);
  const white = black === maya ? leo : maya;
  // Stripes two wide on a slant, so no line holds five of either colour.
  const blacks: string[] = [];
  const whites: string[] = [];
  for (let row = 0; row < 15; row++) {
    for (let column = 0; column < 15; column++) {
      const name = `${'ABCDEFGHIJKLMNO'[column]}${row + 1}`;
      ((column + 2 * row) % 4 < 2 ? blacks : whites).push(name);
    }
  }
  await playGomoku(
    black,
    white,
    blacks.map((name, i) => [name, whites[i] ?? null] as const),
  );
  await expect(
    maya.getByRole('heading', { name: 'A draw: the board is full.' }),
  ).toBeVisible();
  await expect(gomokuBoardOf(maya)).toBeVisible();
  await shot(maya, 'GM15');
});

test('a Gomoku game on a phone', async ({ player }) => {
  test.setTimeout(300_000);
  const maya = await player('Maya', phone);
  const leo = await player('Leo', desktop);
  await joinRoom(leo, await createRoom(maya, 'gomoku'));
  await startGame(maya);
  const black = await blackOf([maya, leo]);
  const white = black === maya ? leo : maya;
  const mayaMoves = ['E5', 'F6', 'G7', 'H8'];
  const leoMoves = ['H6', 'I7', 'J9', 'G9'];
  await playGomoku(
    black,
    white,
    mayaMoves.map(
      (mine, i) =>
        (black === maya ? [mine, leoMoves[i]!] : [leoMoves[i]!, mine]) as [
          string,
          string,
        ],
    ),
  );
  if (black !== maya) await placeStone(leo, 'K8');
  await expect(gomokuTurnOf(maya).getByText('Your turn')).toBeVisible();
  await shot(maya, 'GM18');
  await pointOf(maya, 'I9').tap();
  await maya.getByRole('button', { name: 'Place stone' }).click();
  await expect(gomokuTurnOf(maya).getByText('Game over')).toBeVisible();
  await shot(maya, 'GM19');
});
