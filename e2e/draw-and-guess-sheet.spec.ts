import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';

/**
 * Where the drawing sheet stands. Figma draws it right under what is above
 * it: 12 px under the toolbar or the turn bar on a phone (MO08, MO09, PH05),
 * 16 px under the toolbar beside the side column (D06). Code keeps the
 * sheet's 798 by 598 proportions, which leave height spare on a tall phone,
 * and that spare height goes under the sheet, not over it.
 */
const PHONES = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;
const PHONE_GAP = 12;
const DESKTOP_GAP = 16;

const offered = (page: Page) =>
  page.getByRole('button', { name: /\d+ letters?$/ }).first();

const sheetOf = (page: Page) =>
  page.getByLabel('The drawing').or(page.getByLabel('Drawing canvas'));

/** px between what is above the sheet in its column and the sheet. */
const gapAbove = (page: Page) =>
  sheetOf(page).evaluate((canvas) => {
    const sheet = canvas.parentElement!.getBoundingClientRect();
    const column = canvas.closest('[data-play-board]')!.parentElement!;
    const above = column.previousElementSibling!.getBoundingClientRect();
    return sheet.top - above.bottom;
  });

/** Whether the canvas is painted at the point `x`, `y` of its sheet (0 to 1). */
const paintedAt = (page: Page, x: number, y: number) =>
  page
    .getByLabel('Drawing canvas')
    .or(page.getByLabel('The drawing'))
    .evaluate(
      (canvas: HTMLCanvasElement, [fx, fy]) => {
        const context = canvas.getContext('2d')!;
        const px = Math.round(fx! * canvas.width);
        const py = Math.round(fy! * canvas.height);
        const { data } = context.getImageData(px - 3, py - 3, 7, 7);
        return data.some((value, index) => index % 4 === 3 && value > 0);
      },
      [x, y],
    );

/** Two players, `drawer` having chosen a word, `size` the windows. */
async function inDrawing(
  player: (name: string, options?: { phone?: boolean }) => Promise<Page>,
  size: { width: number; height: number },
  phone: boolean,
) {
  const maya = await player('Maya', { phone });
  const leo = await player('Leo', { phone });
  for (const page of [maya, leo]) await page.setViewportSize(size);
  await joinRoom(
    leo,
    await createRoom(maya, 'draw-and-guess', { seats: 2, rounds: 1 }),
  );
  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect
    .poll(
      async () =>
        (await offered(maya).isVisible()) || (await offered(leo).isVisible()),
    )
    .toBe(true);
  const drawer = (await offered(leo).isVisible()) ? leo : maya;
  const guesser = drawer === leo ? maya : leo;
  await offered(drawer).click();
  await expect(
    drawer.getByRole('region', { name: 'Turn' }).getByText('Draw this'),
  ).toBeVisible();
  await expect(sheetOf(guesser)).toBeVisible();
  return { drawer, guesser };
}

for (const size of PHONES) {
  test(`the sheet sits ${PHONE_GAP} px under what is above it on a ${size.width} by ${size.height} phone`, async ({
    player,
  }) => {
    test.setTimeout(90_000);
    const { drawer, guesser } = await inDrawing(player, size, true);
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
    const at = (fx: number, fy: number) => ({
      x: box.x + box.width * fx,
      y: box.y + box.height * fy,
    });
    await drawer.mouse.move(at(0.2, 0.3).x, at(0.2, 0.3).y);
    await drawer.mouse.down();
    await drawer.mouse.move(at(0.8, 0.3).x, at(0.8, 0.3).y, { steps: 12 });
    await drawer.mouse.up();
    for (const page of [drawer, guesser]) {
      await expect.poll(() => paintedAt(page, 0.5, 0.3)).toBe(true);
      expect(await paintedAt(page, 0.5, 0.7)).toBe(false);
    }
  });
}

test(`the sheet sits ${DESKTOP_GAP} px under the toolbar or turn bar beside the side column`, async ({
  player,
}) => {
  test.setTimeout(90_000);
  const { drawer, guesser } = await inDrawing(
    player,
    { width: 1440, height: 900 },
    false,
  );
  // A guesser has no toolbar: the turn bar's gap is the stage's.
  for (const page of [drawer, guesser]) {
    await expect
      .poll(async () => Math.abs((await gapAbove(page)) - DESKTOP_GAP))
      .toBeLessThanOrEqual(1);
  }
});
