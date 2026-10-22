import { createRoom, expect, joinRoom, test, playSolo } from './fixtures';
import { solveHand } from './play/make-24';

test('two players solve every hand of a game', async ({ player }) => {
  test.setTimeout(120_000);
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'make-24'));
  await maya.getByRole('button', { name: 'Start game' }).click();

  for (let hand = 1; hand <= 5; hand++) {
    for (const page of [maya, leo]) {
      const turn = page.getByRole('region', { name: 'Turn' });
      await expect(turn.getByText(`Hand ${hand} of 5`)).toBeVisible();
      await expect(turn.getByText('Make 24')).toBeVisible();
    }
    // Maya first, and she waits for Leo; Leo's solve ends the hand.
    await solveHand(maya);
    await expect(
      maya.getByRole('region', { name: 'Turn' }).getByText('Waiting for Leo'),
    ).toBeVisible();
    await solveHand(leo);
    // Everybody solved it, so the hand ends early, with its results.
    await expect(maya.getByText(`Hand ${hand} results`).first()).toBeVisible();
  }

  await expect(
    maya.getByRole('banner').getByText('Game over', { exact: true }),
  ).toBeVisible();
  await expect(
    maya.getByRole('list', { name: 'Standings' }).getByRole('listitem'),
  ).toHaveCount(2);
});

test('a player with no name plays ten hands on their own', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const sam = await player('Sam', { named: false });
  const sent = await playSolo(sam, 'Make 24');

  const turn = sam.getByRole('region', { name: 'Turn' });
  for (let hand = 1; hand <= 10; hand++) {
    await expect(turn.getByText(`Hand ${hand} of 10`)).toBeVisible();
    await solveHand(sam);
    // The last solve ends the run at once.
    if (hand < 10) await expect(turn.getByText('24! Nice.')).toBeVisible();
  }

  await expect(
    sam.getByRole('heading', { name: /^Solved 10 of 10 in / }),
  ).toBeVisible();
  await expect(
    sam.getByRole('button', { name: 'Copy challenge link' }),
  ).toHaveCount(1);
  expect(sent()).toEqual([]);
});
