import type { Page } from '@playwright/test';
import { dailyCode, puzzleNumber } from '../shared/code-breaker.js';
import { createRoom, expect, joinRoom, test, playSolo } from './fixtures';
import { isCracked, solve, typeGuess } from './play/code-breaker';

/** The code is open, with nothing guessed yet. */
const ready = (page: Page) =>
  expect(
    page
      .getByRole('region', { name: 'Turn' })
      .getByText('Crack the code', { exact: true }),
  ).toBeVisible();

/** The row being typed, as it reads: "1 2". */
const typing = (page: Page, digits: string) =>
  expect(
    page
      .getByRole('group', { name: 'Your guesses' })
      .getByRole('img', { name: digits, exact: true }),
  ).toBeVisible();

test('two players race to crack the same three codes', async ({ player }) => {
  test.setTimeout(180_000);
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'code-breaker', { seats: 2 }));
  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect(maya.getByText('Code 1 of 3').first()).toBeVisible();

  // A digit is never typed twice, and a short row is turned back for free.
  await ready(maya);
  await maya.keyboard.type('112');
  await typing(maya, '1 2');
  await maya.keyboard.press('Enter');
  await expect(maya.getByText('Four digits, please')).toBeVisible();
  await maya.keyboard.press('Backspace');
  await expect(maya.getByText('Four digits, please')).toBeHidden();
  await maya.keyboard.press('Backspace');

  for (let code = 1; code <= 3; code++) {
    await ready(maya);
    const mine = await solve(maya);

    // Leo sees how Maya did, but only her pegs: never a digit.
    const hers = leo.getByRole('group', { name: 'Maya’s board' });
    await expect(hers.getByRole('img')).toHaveCount(mine.length);
    await expect(hers.getByRole('img', { name: /^\d \d/ })).toHaveCount(0);
    if (isCracked(mine)) {
      await expect(
        leo
          .getByRole('region', { name: 'The others' })
          .getByText(/^Cracked · \+\d+$/),
      ).toBeVisible();
      await expect(
        maya
          .getByRole('region', { name: 'Turn' })
          .getByText(`Cracked it in ${mine.length}! +`, { exact: false }),
      ).toBeVisible();
      // A cracker could give the code away, so their chat waits.
      const message = maya.getByRole('textbox', { name: 'Message' });
      await expect(message).toBeDisabled();
      await expect(message).toHaveAttribute(
        'placeholder',
        'You cracked it. Chat opens after the reveal.',
      );
    }

    await ready(leo);
    await solve(leo);

    // Both done: the code ends at once. Its reveal lasts a second here, too
    // short to catch under load, so the next code opening is the sign.
    if (code < 3) {
      await expect(
        maya.getByText(`Code ${code + 1} of 3`).first(),
      ).toBeVisible();
    }
  }

  await expect(
    maya.getByRole('heading', {
      name: /( wins with | tie with |^You win with |^You tie with |^Game over\.)/,
    }),
  ).toBeVisible();
  const standings = maya.getByRole('list', { name: 'Standings' });
  await expect(standings.getByRole('listitem')).toHaveCount(2);
  await expect(standings.getByText(/\d codes? cracked/).first()).toBeVisible();
  // The last code's boards stay up under the scores, everybody's digits
  // showing.
  const last = maya.getByRole('region', { name: 'Code 3 results' });
  await expect(last.getByText(/^The code was \d{4}\.$/)).toBeVisible();
  await expect(
    last.getByRole('group', { name: 'Leo’s board' }).getByRole('img', {
      name: /^\d \d \d \d: /,
    }),
  ).not.toHaveCount(0);
  await expect(maya.getByRole('button', { name: 'Play again' })).toBeVisible();
});

/**
 * Pages a code's four results boards are laid out on, by the width beside
 * the scrollbar: a 1440 px window beside a 17 px one, as on Windows, has
 * them in a row, the panel's padding 16 px where 24 leaves too little; a
 * 1366 px window has two rows of two, never three and one. A short window's
 * panel has 16 px of padding already.
 */
const RESULT_PAGES = [
  { width: 1423, height: 900, rows: 1 },
  { width: 1349, height: 900, rows: 2 },
  { width: 1423, height: 720, rows: 1 },
  { width: 1263, height: 720, rows: 2 },
] as const;

test('four players’ results boards stand in one row at 1440 px, and two by two where four do not fit', async ({
  player,
}) => {
  test.setTimeout(180_000);
  const maya = await player('Maya');
  const others = [
    await player('Sam'),
    await player('Ryan'),
    await player('Leo'),
  ];
  const link = await createRoom(maya, 'code-breaker', { codes: 1 });
  for (const page of others) await joinRoom(page, link);
  await maya.getByRole('button', { name: 'Start game' }).click();
  for (const page of [maya, ...others]) {
    await ready(page);
    await solve(page);
  }
  const results = maya.getByRole('region', { name: 'Code 1 results' });
  await expect(results.getByRole('group')).toHaveCount(4);

  /** Each board's card, where it is: the children of the row holding all four. */
  const cards = () =>
    results.evaluate((region) => {
      const groups = [...region.querySelectorAll('[role="group"]')];
      let row = groups[0]!.parentElement!;
      while (!groups.every((group) => row.contains(group))) {
        row = row.parentElement!;
      }
      return [...row.children].map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
        };
      });
    });
  // The width beside the scrollbar's gutter, which the headless browser
  // keeps without reporting it in clientWidth.
  const pageWidth = () =>
    maya.evaluate(() =>
      Math.round(document.body.getBoundingClientRect().width),
    );
  const gutter =
    (await maya.evaluate(() => window.innerWidth)) - (await pageWidth());

  for (const size of RESULT_PAGES) {
    await maya.setViewportSize({
      width: size.width + gutter,
      height: size.height,
    });
    await expect.poll(pageWidth).toBe(size.width);
    const [a, b, c, d] = await cards();
    const at = `a ${size.width} × ${size.height} page`;
    // 8 px apart across.
    expect(b!.left - a!.right, at).toBe(8);
    if (size.rows === 1) {
      expect([b!.top, c!.top, d!.top], at).toEqual([a!.top, a!.top, a!.top]);
      expect(d!.left - c!.right, at).toBe(8);
    } else {
      // Two by two, the rows 16 px apart under the taller of the two.
      expect([b!.top, c!.left, d!.left], at).toEqual([
        a!.top,
        a!.left,
        b!.left,
      ]);
      expect(c!.top - Math.max(a!.bottom, b!.bottom), at).toBe(16);
      expect(d!.top, at).toBe(c!.top);
    }
  }
});

test('a player with no name plays today’s code, with notes, then a practice code', async ({
  player,
}) => {
  const sam = await player('Sam', { named: false });
  const sent = await playSolo(sam, 'Code Breaker');

  // Notes mark a digit instead of typing it, and stay after a reload.
  await sam.getByRole('button', { name: 'Notes' }).click();
  await sam.keyboard.press('9');
  await expect(
    sam.getByRole('button', { name: '9, noted out of the code' }),
  ).toBeVisible();
  await sam.getByRole('button', { name: 'Notes' }).click();
  await sam.reload();
  await expect(
    sam.getByRole('button', { name: '9, noted out of the code' }),
  ).toBeVisible();

  // An earlier guess again is turned back, and costs nothing.
  const miss = dailyCode(puzzleNumber(new Date())) === '0123' ? '4567' : '0123';
  await typeGuess(sam, miss);
  const row = `${[...miss].join(' ')}: `;
  await expect(sam.getByRole('img', { name: row, exact: false })).toBeVisible();
  await typeGuess(sam, miss);
  await expect(sam.getByText('Already guessed')).toBeVisible();
  for (let i = 0; i < 4; i++) await sam.keyboard.press('Backspace');

  const today = await solve(sam);
  await expect(
    sam.getByRole('heading', {
      name: isCracked(today) ? `Cracked in ${today.length}.` : 'Not this time.',
    }),
  ).toBeVisible();
  await expect(sam.getByText('Next code in')).toBeVisible();
  await expect(sam.getByRole('button', { name: 'Share' })).toBeVisible();
  // The only code cracked so far is the longest bar, so it fills its column.
  const guesses = sam.getByRole('region', { name: 'Guesses to crack it' });
  const list = await guesses.getByRole('list').boundingBox();
  const longest = await guesses.getByLabel(/^1 cracked in/).boundingBox();
  const card = await guesses.boundingBox();
  expect(list!.width).toBeGreaterThan(card!.width / 2);
  expect(longest!.x + longest!.width).toBeCloseTo(list!.x + list!.width, 0);

  // Today's code stays played after a reload.
  await sam.reload();
  await expect(sam.getByText('Next code in')).toBeVisible();

  await sam.getByRole('button', { name: 'Practice code' }).click();
  const practice = await solve(sam);
  await expect(
    sam.getByRole('heading', {
      name: isCracked(practice)
        ? `Cracked in ${practice.length}.`
        : 'Not this time.',
    }),
  ).toBeVisible();
  await expect(
    sam.getByRole('button', { name: 'Copy challenge link' }),
  ).toHaveCount(1);
  expect(sent()).toEqual([]);
});
