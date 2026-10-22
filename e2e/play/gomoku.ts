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
 * Places a stone with a click on the player's turn, then Place stone on a
 * phone, whose first tap puts down only a faint stone, and waits for the server's
 * answer to show it as the last stone.
 */
export async function place(page: Page, name: string): Promise<void> {
  await expect(turnOf(page).getByText('Your turn')).toBeVisible();
  await expect(pointOf(page, name)).toBeEnabled();
  const placed = boardOf(page).getByRole('gridcell', {
    name: new RegExp(`^${name}, (black|white) stone`),
  });
  const commit = page.getByRole('button', { name: 'Place stone' });
  if (await commit.isVisible()) {
    // A phone: a tap puts down a faint stone, and Place stone places it.
    await pointOf(page, name).tap();
    await expect(commit).toBeEnabled();
    await commit.click();
  } else {
    await pointOf(page, name).click();
  }
  await expect(placed).toBeVisible();
  await expect(pointOf(page, name)).toHaveAccessibleName(
    new RegExp(
      `^${name}, (black|white) stone, (last placed|in the winning line)$`,
    ),
  );
}

const COLUMNS = 'ABCDEFGHIJKLMNO';
const SIZE = 15;
type Stone = 'black' | 'white';

/** A point's name from its column and row, both from 0: (7, 7) is "H8". */
const nameAt = (column: number, row: number) => `${COLUMNS[column]}${row + 1}`;

/** The stones on the board, read from its points' names: "H8" → black. */
export async function stonesOn(page: Page): Promise<Map<string, Stone>> {
  const labels = await boardOf(page)
    .getByRole('gridcell')
    .evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute('aria-label')),
    );
  const stones = new Map<string, Stone>();
  for (const label of labels) {
    const [name, stone] = (label ?? '').split(', ');
    if (stone === 'black stone') stones.set(name!, 'black');
    if (stone === 'white stone') stones.set(name!, 'white');
  }
  return stones;
}

/**
 * What a `stone` on the point at (column, row) makes, as a rule of thumb: its
 * longest run through the point, worth more with each stone and with each
 * free end, and nothing when both ends are blocked short of five.
 */
function worth(
  stones: Map<string, Stone>,
  column: number,
  row: number,
  stone: Stone,
): number {
  let best = 0;
  for (const [dc, dr] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const) {
    let run = 1;
    let open = 0;
    for (const sign of [1, -1]) {
      let c = column + sign * dc;
      let r = row + sign * dr;
      while (stones.get(nameAt(c, r)) === stone) {
        run += 1;
        c += sign * dc;
        r += sign * dr;
      }
      const inside = c >= 0 && c < SIZE && r >= 0 && r < SIZE;
      if (inside && !stones.has(nameAt(c, r))) open += 1;
    }
    const value = run >= 5 ? 1e6 : open === 0 ? 0 : 10 ** run * open;
    best = Math.max(best, value);
  }
  return best;
}

/**
 * A plain player's move for `stone`: the empty point near the stones that
 * makes the longest open run of its own, or blocks the other's, its own first.
 */
export function plainMove(stones: Map<string, Stone>, stone: Stone): string {
  if (stones.size === 0) return 'H8';
  const other: Stone = stone === 'black' ? 'white' : 'black';
  let best = { name: '', value: -1 };
  for (let column = 0; column < SIZE; column += 1) {
    for (let row = 0; row < SIZE; row += 1) {
      const name = nameAt(column, row);
      if (stones.has(name)) continue;
      let near = false;
      for (let dc = -1; dc <= 1 && !near; dc += 1) {
        for (let dr = -1; dr <= 1 && !near; dr += 1) {
          near = stones.has(nameAt(column + dc, row + dr));
        }
      }
      if (!near) continue;
      const value =
        worth(stones, column, row, stone) +
        0.9 * worth(stones, column, row, other);
      if (value > best.value) best = { name, value };
    }
  }
  return best.name;
}
