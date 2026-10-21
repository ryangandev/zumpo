import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test, playSolo } from './fixtures';
import { isFound, solve, typeGuess } from './play/daily-word';

/** The word is open, with nothing guessed yet. */
const ready = (page: Page) =>
  expect(page.getByText('Find the word', { exact: true })).toBeVisible();

test('two players race to the same three words', async ({ player }) => {
  test.setTimeout(180_000);
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'daily-word', { seats: 2 }));
  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect(maya.getByText('Word 1 of 3').first()).toBeVisible();

  // A word that is not in the lists is turned away, and costs no guess.
  await ready(maya);
  await typeGuess(maya, 'xxxxx');
  await expect(maya.getByText('Not in the word list')).toBeVisible();
  await maya.keyboard.press('Backspace');
  await expect(maya.getByText('Not in the word list')).toBeHidden();
  for (let i = 0; i < 4; i++) await maya.keyboard.press('Backspace');

  for (let word = 1; word <= 3; word++) {
    await ready(maya);
    const mine = await solve(maya);

    // Leo sees how Maya did, but only her marks: never a letter.
    const hers = leo.getByRole('group', { name: 'Maya’s board' });
    await expect(hers.getByRole('img')).toHaveCount(5 * mine.length);
    await expect(hers.getByRole('img', { name: /^[A-Z], / })).toHaveCount(0);
    if (isFound(mine)) {
      await expect(
        leo
          .getByRole('region', { name: 'The others' })
          .getByText(/^Found · \+\d+$/),
      ).toBeVisible();
      await expect(
        maya
          .getByRole('region', { name: 'Turn' })
          .getByText(`Got it in ${mine.length}! +`, { exact: false }),
      ).toBeVisible();
      // A finder could give the word away, so their chat waits.
      const message = maya.getByRole('textbox', { name: 'Message' });
      await expect(message).toBeDisabled();
      await expect(message).toHaveAttribute(
        'placeholder',
        'You got it. Chat opens after the reveal.',
      );
    }

    await ready(leo);
    await solve(leo);

    // Both done: the word ends at once. Its reveal lasts a second here, too
    // short to catch under load, so the next word opening is the sign.
    if (word < 3) {
      await expect(
        maya.getByText(`Word ${word + 1} of 3`).first(),
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
  await expect(standings.getByText(/\d words? found/).first()).toBeVisible();
  // The last word's boards stay up under the scores, everybody's letters
  // showing.
  const last = maya.getByRole('region', { name: 'Word 3 results' });
  await expect(last.getByText(/^The word was [A-Z]{5}\.$/)).toBeVisible();
  await expect(
    last.getByRole('group', { name: 'Leo’s board' }).getByRole('img', {
      name: /^[A-Z], /,
    }),
  ).not.toHaveCount(0);
  await expect(maya.getByRole('button', { name: 'Play again' })).toBeVisible();
});

test('a player with no name plays today’s word, then a practice word', async ({
  player,
}) => {
  const sam = await player('Sam', { named: false });
  const sent = await playSolo(sam, 'Daily Word');

  const today = await solve(sam);
  await expect(
    sam.getByRole('heading', {
      name: isFound(today) ? `Found in ${today.length}.` : 'Not this time.',
    }),
  ).toBeVisible();
  await expect(sam.getByText('Next word in')).toBeVisible();
  await expect(sam.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(
    sam.getByRole('heading', { name: 'On this device' }),
  ).toBeVisible();

  // Today's word stays played after a reload.
  await sam.reload();
  await expect(sam.getByText('Next word in')).toBeVisible();

  await sam.getByRole('button', { name: 'Practice word' }).click();
  const practice = await solve(sam);
  await expect(
    sam.getByRole('heading', {
      name: isFound(practice)
        ? `Found in ${practice.length}.`
        : 'Not this time.',
    }),
  ).toBeVisible();
  await expect(
    sam.getByRole('button', { name: 'Copy challenge link' }),
  ).toHaveCount(1);
  expect(sent()).toEqual([]);
});
