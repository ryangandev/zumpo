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
      name: /( wins with | tie with |^Game over\.)/,
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
  await expect(
    sam.getByRole('heading', { name: 'Guesses to crack it' }),
  ).toBeVisible();

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
    sam.getByRole('button', { name: 'Challenge a friend' }).first(),
  ).toBeVisible();
  expect(sent()).toEqual([]);
});
