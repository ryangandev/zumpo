import type { Locator, Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';

/**
 * Where the drawing sheet stands. Figma draws it right under what is above
 * it: 12 px under the toolbar or the turn bar on a phone (MO08, MO09, PH05),
 * 16 px under the toolbar beside the side column (D06). Code keeps the
 * sheet's 798 by 598 proportions, which leave height spare on a tall phone,
 * and that spare height goes under the sheet, not over it. The round's
 * results stay on the sheet's foot, and the word choices stay centred in the
 * room (MO07).
 */
const PHONES = [
  // The smallest phone: the sheet is as tall as the room allows, so this is
  // a smoke check of the gap, the stroke and the results.
  { width: 360, height: 640, spare: false },
  { width: 390, height: 844, spare: true },
  { width: 430, height: 932, spare: true },
] as const;
const PHONE_GAP = 12;
const DESKTOP_GAP = 16;

const offered = (page: Page) =>
  page.getByRole('button', { name: /\d+ letters?$/ }).first();

const sheetOf = (page: Page) =>
  page.getByLabel('The drawing').or(page.getByLabel('Drawing canvas'));

/** The white sheet: the canvas's own box, with its border. */
const sheetBox = async (page: Page) =>
  (await sheetOf(page).locator('..').boundingBox())!;

/**
 * What the sheet stands under: the drawer's tools, or for a guesser the
 * turn bar. The tools are a toolbar inside their card, which is the box.
 */
const aboveOf = (page: Page): Locator =>
  page
    .getByRole('toolbar', { name: 'Drawing tools' })
    .locator('..')
    .or(page.getByRole('region', { name: 'Turn' }))
    .last();

/** px between what is above the sheet and the sheet. */
async function gapAbove(page: Page): Promise<number> {
  const above = (await aboveOf(page).boundingBox())!;
  const sheet = await sheetBox(page);
  return sheet.y - (above.y + above.height);
}

/** Whether the canvas is painted at the point `x`, `y` of it (0 to 1). */
const paintedAt = (page: Page, x: number, y: number) =>
  sheetOf(page).evaluate(
    (canvas: HTMLCanvasElement, [fx, fy]) => {
      const context = canvas.getContext('2d')!;
      const px = Math.round(fx! * canvas.width);
      const py = Math.round(fy! * canvas.height);
      const { data } = context.getImageData(px - 3, py - 3, 7, 7);
      return data.some((value, index) => index % 4 === 3 && value > 0);
    },
    [x, y],
  );

type Seat = (name: string, options?: { phone?: boolean }) => Promise<Page>;

/**
 * Two players in a Draw & Guess room, `rounds` long, in windows of `size`,
 * the game started.
 */
async function inRoom(
  player: Seat,
  size: { width: number; height: number },
  phone: boolean,
  rounds: 1 | 2,
) {
  const maya = await player('Maya', { phone });
  const leo = await player('Leo', { phone });
  for (const page of [maya, leo]) await page.setViewportSize(size);
  await joinRoom(
    leo,
    await createRoom(maya, 'draw-and-guess', { seats: 2, rounds }),
  );
  await maya.getByRole('button', { name: 'Start game' }).click();
  return [maya, leo] as const;
}

/** Whoever is offered words, and the other player. */
async function whoDraws([maya, leo]: readonly [Page, Page]) {
  await expect
    .poll(
      async () =>
        (await offered(maya).isVisible()) || (await offered(leo).isVisible()),
    )
    .toBe(true);
  return (await offered(leo).isVisible())
    ? { drawer: leo, guesser: maya }
    : { drawer: maya, guesser: leo };
}

/** Chooses the first word and waits until both players see the sheet. */
async function chooseWord(drawer: Page, guesser: Page): Promise<string> {
  const word = (await offered(drawer).locator('span').first().textContent())!;
  await offered(drawer).click();
  await expect(
    drawer.getByRole('region', { name: 'Turn' }).getByText('Draw this'),
  ).toBeVisible();
  await expect(sheetOf(guesser)).toBeVisible();
  return word.trim();
}

/** The drawer chooses a word and the guesser, on a phone, guesses it. */
async function guessRight(drawer: Page, guesser: Page) {
  const word = await chooseWord(drawer, guesser);
  const guess = guesser.getByRole('textbox', { name: 'Guess' });
  await expect(guess).toBeEnabled();
  await guess.fill(word);
  await guess.press('Enter');
}

for (const size of PHONES) {
  const at = `${size.width} by ${size.height}`;

  test(`the sheet sits ${PHONE_GAP} px under what is above it on a ${at} phone`, async ({
    player,
  }) => {
    test.setTimeout(90_000);
    const seats = await inRoom(player, size, true, 1);
    const { drawer, guesser } = await whoDraws(seats);
    await chooseWord(drawer, guesser);
    for (const [who, page] of [
      ['drawer', drawer],
      ['guesser', guesser],
    ] as const) {
      await expect
        .poll(async () => Math.abs((await gapAbove(page)) - PHONE_GAP), {
          message: `the ${who}'s gap`,
        })
        .toBeLessThanOrEqual(1);
    }

    // Strokes still land under the pointer, on the drawer's sheet and, as
    // the room sees them, on the guesser's.
    const box = (await sheetOf(drawer).boundingBox())!;
    const pointAt = (fx: number, fy: number) => ({
      x: box.x + box.width * fx,
      y: box.y + box.height * fy,
    });
    await drawer.mouse.move(pointAt(0.2, 0.3).x, pointAt(0.2, 0.3).y);
    await drawer.mouse.down();
    await drawer.mouse.move(pointAt(0.8, 0.3).x, pointAt(0.8, 0.3).y, {
      steps: 12,
    });
    await drawer.mouse.up();
    for (const page of [drawer, guesser]) {
      await expect.poll(() => paintedAt(page, 0.5, 0.3)).toBe(true);
      expect(await paintedAt(page, 0.5, 0.7)).toBe(false);
    }
  });

  test(`the round's results stay on the sheet's foot, and the choices centred, on a ${at} phone`, async ({
    player,
  }) => {
    test.setTimeout(90_000);
    const seats = await inRoom(player, size, true, 2);
    const first = await whoDraws(seats);
    await guessRight(first.drawer, first.guesser);
    // A round is a turn for each of the two. When the second is guessed the
    // round's results lie over the foot of the sheet of the one who is not
    // offered the next round's words, which of them draws first is the
    // server's pick.
    await expect(offered(first.guesser)).toBeVisible();
    await guessRight(first.guesser, first.drawer);
    const { drawer: offeredTo, guesser: shown } = await whoDraws(seats);

    const results = shown.getByRole('region', {
      name: 'Round 1 results',
    });
    await expect(results).toBeVisible();
    await expect
      .poll(
        async () => {
          const sheet = await sheetBox(shown);
          const panel = (await results.boundingBox())!;
          return Math.abs(sheet.y + sheet.height - (panel.y + panel.height));
        },
        { message: "the results' foot against the sheet's" },
      )
      .toBeLessThanOrEqual(1);
    const sheet = await sheetBox(shown);
    const panel = (await results.boundingBox())!;
    expect(panel.y, 'the results stay inside the sheet').toBeGreaterThanOrEqual(
      sheet.y - 1,
    );
    expect(Math.abs((await gapAbove(shown)) - PHONE_GAP)).toBeLessThan(1.5);

    if (!size.spare) return;
    // MO07: the choices are centred in the room the board is given.
    const choices = offeredTo.getByRole('button', {
      name: /\d+ letters?$/,
    });
    await expect(choices).toHaveCount(3);
    const room = (await offeredTo.locator('[data-play-board]').boundingBox())!;
    const top = (await choices.first().boundingBox())!;
    const foot = (await choices.last().boundingBox())!;
    const middle = (top.y + foot.y + foot.height) / 2;
    expect(Math.abs(middle - (room.y + room.height / 2))).toBeLessThanOrEqual(
      1,
    );
  });
}

test(`the sheet sits ${DESKTOP_GAP} px under the toolbar or turn bar beside the side column`, async ({
  player,
}) => {
  test.setTimeout(90_000);
  const seats = await inRoom(player, { width: 1440, height: 900 }, false, 1);
  const { drawer, guesser } = await whoDraws(seats);
  await chooseWord(drawer, guesser);
  // A guesser has no toolbar: the turn bar's gap is the stage's.
  for (const page of [drawer, guesser]) {
    await expect
      .poll(async () => Math.abs((await gapAbove(page)) - DESKTOP_GAP))
      .toBeLessThanOrEqual(1);
  }
});

/**
 * A short phone (design.md#in-code, PH09): the sheet is never narrower than
 * 5/8 of its column, the page scrolls instead, and each phase starts with
 * the whole turn in sight, from the turn bar to the newest chat line or the
 * guess field. A finger on the drawer's sheet draws and never scrolls. The
 * sizes are the smallest phones in use, an iPhone SE in Safari among them.
 */
const SHORT_PHONES = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 548 },
  { width: 375, height: 667 },
] as const;
const FLOOR = 5 / 8;

/** The canvas, the column it stands in, and where the page is scrolled. */
const layoutOf = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const column = document
      .querySelector('[data-play-board]')!
      .getBoundingClientRect();
    const root = document.documentElement;
    return {
      canvas: { width: canvas.width, height: canvas.height },
      column: column.width,
      scrollY: window.scrollY,
      scrolls: root.scrollHeight > innerHeight + 1,
      innerHeight,
    };
  });

/** Whether `locator` is wholly in the window. */
const wholeInView = (locator: Locator) =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= -0.5 && box.bottom <= innerHeight + 0.5;
  });

/** A finger drawn across the sheet, from `from` to `to` (0 to 1 of it). */
async function swipe(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number],
) {
  const box = (await sheetOf(page).boundingBox())!;
  const at = ([fx, fy]: readonly [number, number], t: number) => ({
    x: box.x + box.width * fx + box.width * (to[0] - fx) * t,
    y: box.y + box.height * fy + box.height * (to[1] - fy) * t,
  });
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    point?: { x: number; y: number },
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: point ? [{ ...point, id: 1 }] : [],
    });
  await touch('touchStart', at(from, 0));
  for (let step = 1; step <= 12; step++) {
    await touch('touchMove', at(from, step / 12));
  }
  await touch('touchEnd');
  await cdp.detach();
}

for (const size of SHORT_PHONES) {
  const at = `${size.width} by ${size.height}`;

  test(`a short ${at} phone keeps the sheet drawable and the whole turn in sight`, async ({
    player,
  }) => {
    test.setTimeout(90_000);
    const seats = await inRoom(player, size, true, 1);
    const { drawer, guesser } = await whoDraws(seats);
    // The word choices run on down the page rather than over the turn.
    const choices = drawer.getByRole('button', { name: /\d+ letters?$/ });
    await expect(choices).toHaveCount(3);
    const turn = drawer.getByRole('region', { name: 'Turn' });
    const turnBox = (await turn.boundingBox())!;
    const first = (await choices.first().boundingBox())!;
    expect(first.y, 'the choices start under the turn bar').toBeGreaterThan(
      turnBox.y + turnBox.height,
    );

    await chooseWord(drawer, guesser);
    const guess = guesser.getByRole('textbox', { name: 'Guess' });
    await expect(guess).toBeEnabled();
    for (const [who, page, foot] of [
      ['drawer', drawer, drawer.getByRole('log')],
      ['guesser', guesser, guess],
    ] as const) {
      const { canvas, column } = await layoutOf(page);
      expect(
        canvas.width,
        `the ${who}'s sheet is at least 5/8 of the column`,
      ).toBeGreaterThanOrEqual(column * FLOOR - 3);
      await expect
        .poll(() => wholeInView(page.getByRole('region', { name: 'Turn' })), {
          message: `the ${who}'s turn bar in sight`,
        })
        .toBe(true);
      expect(await wholeInView(sheetOf(page)), `the ${who}'s sheet`).toBe(true);
      expect(await wholeInView(foot), `the ${who}'s foot`).toBe(true);
    }
    // The drawer's page is past the window: the sheet's floor scrolled it.
    expect((await layoutOf(drawer)).scrolls).toBe(true);

    // A finger on the sheet draws, and the page stays where it is.
    const before = (await layoutOf(drawer)).scrollY;
    await swipe(drawer, [0.2, 0.3], [0.8, 0.3]);
    for (const page of [drawer, guesser]) {
      await expect.poll(() => paintedAt(page, 0.5, 0.3)).toBe(true);
    }
    expect((await layoutOf(drawer)).scrollY, 'the page did not scroll').toBe(
      before,
    );
  });
}

for (const size of PHONES.filter(({ spare }) => spare)) {
  const at = `${size.width} by ${size.height}`;

  test(`a tall ${at} phone keeps the sheet the column's width on one screen`, async ({
    player,
  }) => {
    test.setTimeout(90_000);
    const seats = await inRoom(player, size, true, 1);
    const { drawer, guesser } = await whoDraws(seats);
    await chooseWord(drawer, guesser);
    for (const page of [drawer, guesser]) {
      const { canvas, column, scrolls } = await layoutOf(page);
      // The canvas is the sheet's inside, a pixel of border either side.
      expect(Math.abs(canvas.width - (column - 2))).toBeLessThanOrEqual(1);
      expect(scrolls, 'the page does not scroll').toBe(false);
    }
  });
}

test('a desktop sheet is in sight without a scroll, as before', async ({
  player,
}) => {
  test.setTimeout(90_000);
  const seats = await inRoom(player, { width: 1440, height: 900 }, false, 1);
  const { drawer, guesser } = await whoDraws(seats);
  await chooseWord(drawer, guesser);
  for (const page of [drawer, guesser]) {
    const { scrolls } = await layoutOf(page);
    expect(scrolls, 'the page does not scroll').toBe(false);
    expect(await wholeInView(sheetOf(page))).toBe(true);
  }
});
