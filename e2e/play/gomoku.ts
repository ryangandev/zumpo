import type { Page } from '@playwright/test';
import { expect } from '../fixtures';

/** Playing Gomoku as a player does: by the points' names, such as H8. */

export const boardOf = (page: Page) =>
  page.getByRole('grid', { name: 'Gomoku board' });

/** A point on the board, by its name: "H8". */
export const pointOf = (page: Page, name: string) =>
  boardOf(page).getByRole('gridcell', { name: new RegExp(`^${name},`) });

export const turnOf = (page: Page) =>
  page.getByRole('region', { name: 'Turn' });

/** Whose page says it is their turn to place a black stone. */
export async function blackOf(pages: readonly Page[]): Promise<Page> {
  let black: Page | undefined;
  await expect
    .poll(async () => {
      for (const page of pages) {
        if (await turnOf(page).getByText('Place a black stone').isVisible()) {
          black = page;
        }
      }
      return black !== undefined;
    })
    .toBe(true);
  return black!;
}

/**
 * Places a stone with a click on the player's turn, and waits for the
 * server's answer to show it as the last stone.
 */
export async function place(page: Page, name: string): Promise<void> {
  await expect(turnOf(page).getByText('Your turn')).toBeVisible();
  await pointOf(page, name).click();
  await expect(pointOf(page, name)).toHaveAccessibleName(
    new RegExp(
      `^${name}, (black|white) stone, (last placed|in the winning line)$`,
    ),
  );
}
