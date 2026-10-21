import type { Page } from '@playwright/test';
import { createRoom, dropConnection, expect, joinRoom, test } from './fixtures';

const turn = (page: Page) => page.getByRole('region', { name: 'Turn' });

/** Writes `text` in the step's field and presses Done. */
async function write(page: Page, field: string, text: string) {
  await page.getByRole('textbox', { name: field }).fill(text);
  await page.getByRole('button', { name: 'Done' }).click();
}

/** Draws one stroke across the canvas. */
async function scribble(page: Page) {
  const canvas = page.getByLabel('Drawing canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, {
    steps: 12,
  });
  await page.mouse.up();
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

/** Maya hosts, Leo and Sam join: three, the fewest a game takes. */
async function threePlayers(
  player: (name: string, options?: { droppable?: boolean }) => Promise<Page>,
) {
  const maya = await player('Maya');
  const leo = await player('Leo');
  const sam = await player('Sam', { droppable: true });
  const link = await createRoom(maya, 'doodle-chain', { seats: 3 });
  await joinRoom(leo, link);
  await joinRoom(sam, link);
  await expect(
    maya.getByText(/^3 players, so 3 steps: write, draw, describe\./),
  ).toBeVisible();
  await maya.getByRole('button', { name: 'Start game' }).click();
  return { maya, leo, sam };
}

test('three players write, draw and describe, then watch every chain unfold', async ({
  player,
}) => {
  test.setTimeout(180_000);
  const { maya, leo, sam } = await threePlayers(player);
  const everybody = [maya, leo, sam];
  const lines = new Map([
    [maya, 'A cat riding a bicycle'],
    [leo, 'A dragon at the dentist'],
    [sam, 'A snowman at the beach'],
  ]);

  // Step 1: everybody writes a line; the step ends when all are done.
  for (const page of everybody) {
    await expect(turn(page).getByText('Write the first line')).toBeVisible();
  }
  await write(maya, 'Your first line', lines.get(maya)!);
  await expect(maya.getByText('Done. Waiting for Leo and Sam.')).toBeVisible();
  await write(leo, 'Your first line', lines.get(leo)!);
  await write(sam, 'Your first line', lines.get(sam)!);

  // Step 2: each draws the line of the player before them in the order.
  for (const [page, from] of [
    [maya, sam],
    [leo, maya],
    [sam, leo],
  ] as const) {
    await expect(turn(page).getByText('Draw this')).toBeVisible();
    await expect(turn(page).getByText(lines.get(from)!)).toBeVisible();
    await scribble(page);
    await page.getByRole('button', { name: 'Done' }).click();
  }

  // Step 3: each says what the drawing they were given shows.
  for (const page of everybody) {
    await expect(
      turn(page).getByText('What does this drawing show?'),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'The drawing you were given' }),
    ).toBeVisible();
    await write(page, 'Your description', 'A cat, I think');
  }

  // The reveal: Maya shows the chains an entry at a time.
  await expect(turn(leo).getByText('Reveal · chain 1 of 3')).toBeVisible();
  await expect(turn(leo).getByText('Maya’s chain')).toBeVisible();
  await expect(leo.getByText('Maya is showing the chains.')).toBeVisible();
  await expect(leo.getByRole('button', { name: 'Next' })).toHaveCount(0);
  const next = maya.getByRole('button', {
    name: /^(Next|Next chain|See the album)$/,
  });
  await next.click();
  await expect(turn(leo).getByText('2 of 3 shown')).toBeVisible();
  await expect(leo.getByRole('img', { name: 'Leo’s drawing' })).toBeVisible();
  // Sam hearts Maya's first line; Maya sees the count on her own entry.
  await sam
    .getByRole('button', { name: 'Give a heart, 0 hearts so far' })
    .first()
    .click();
  await expect(maya.getByRole('img', { name: '1 heart' })).toBeVisible();

  // Each Next waits for the one before: Next names the entry it shows, so a
  // press the page has not caught up with shows nothing.
  for (let total = 3; total <= 9; total++) {
    await next.click();
    const chain = Math.floor((total - 1) / 3) + 1;
    await expect(
      turn(maya).getByText(`Reveal · chain ${chain} of 3`),
    ).toBeVisible();
    await expect(
      turn(maya).getByText(`${((total - 1) % 3) + 1} of 3 shown`),
    ).toBeVisible();
  }
  await expect(next).toHaveText('See the album');
  await next.click();
  for (const page of everybody) {
    await expect(
      page.getByRole('heading', { name: 'That’s every chain.' }),
    ).toBeVisible();
  }
  await expect(
    leo.getByText(
      '3 chains, 9 entries. Maya’s first line is the crowd favourite, with 1 heart.',
    ),
  ).toBeVisible();
  await leo.getByRole('button', { name: 'Sam’s chain' }).click();
  await expect(leo.getByText(lines.get(sam)!)).toBeVisible();
  await expect(maya.getByRole('button', { name: 'Play again' })).toBeVisible();
});

test('a player who drops mid-drawing gets their drawing back', async ({
  player,
}) => {
  const { maya, leo, sam } = await threePlayers(player);
  for (const page of [maya, leo, sam]) {
    await write(page, 'Your first line', 'A ghost doing laundry');
  }
  await expect(turn(sam).getByText('Draw this')).toBeVisible();
  await scribble(sam);

  const restore = await dropConnection(sam);
  await expect(
    maya.getByRole('region', { name: 'Players' }).getByText('Away'),
  ).toBeVisible();
  // Nobody waits for Sam: the step still ends on the clock or when all are done.
  restore();
  await expect(sam.getByRole('button', { name: 'Leave room' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(turn(sam).getByText('Draw this')).toBeVisible();
  await expect.poll(() => painted(sam)).toBe(true);
  await sam.getByRole('button', { name: 'Done' }).click();
  await expect(sam.getByText('Done. Waiting for Maya and Leo.')).toBeVisible();
});
