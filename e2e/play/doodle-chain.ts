import type { Page } from '@playwright/test';

/** Playing Doodle Chain as a player does: a line, a stroke, Done. */

/** Writes `text` in the step's field and presses Done. */
export async function write(page: Page, field: string, text: string) {
  await page.getByRole('textbox', { name: field }).fill(text);
  await page.getByRole('button', { name: 'Done' }).click();
}

/** Draws one stroke across the canvas. */
export async function scribble(page: Page) {
  const canvas = page.getByLabel('Drawing canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, {
    steps: 12,
  });
  await page.mouse.up();
}
