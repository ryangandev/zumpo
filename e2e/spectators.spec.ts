import { createRoom, expect, joinRoom, test } from './fixtures';

test('a spectator watches a game and takes a seat once it ends', async ({
  player,
}) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  const sam = await player('Sam');
  // Unique, because the lobby lists every room on the shared server.
  const name = `Watched ${test.info().repeatEachIndex}-${test.info().workerIndex}`;
  const link = await createRoom(maya, 'minesweeper', { name });
  await joinRoom(leo, link);
  await joinRoom(sam, link);

  // Before the game anybody may give up their seat to watch.
  await sam.getByRole('button', { name: 'Watch instead' }).click();
  await expect(
    sam.getByRole('heading', { name: 'You’re watching.' }),
  ).toBeVisible();
  const watching = maya.getByRole('region', { name: 'Watching' });
  await expect(watching).toContainText('Sam');
  await expect(maya.getByRole('region', { name: 'Players' })).not.toContainText(
    'Sam',
  );

  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect(
    sam.getByText(
      'You’re watching this game. You can take a seat once it ends.',
    ),
  ).toBeVisible();
  await expect(sam.getByText('Everyone is picking')).toBeVisible();
  await expect(
    sam.getByRole('gridcell', { name: /: hidden$/, disabled: false }),
  ).toHaveCount(0);

  // Somebody arriving at the game under way watches it, from the lobby.
  const ana = await player('Ana');
  await ana.goto('/games/minesweeper');
  const row = ana.getByRole('article', { name });
  await expect(row.getByText('Playing')).toBeVisible();
  await row.getByRole('button', { name: 'Watch' }).click();
  await expect(
    ana.getByText(
      'You’re watching this game. You can take a seat once it ends.',
    ),
  ).toBeVisible();
  await expect(watching).toContainText('Ana');

  // A spectator's word reaches the table.
  await sam.getByRole('textbox', { name: 'Message' }).fill('go left');
  await sam.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(
    maya.getByRole('region', { name: 'Chat' }).getByText('go left'),
  ).toBeVisible();

  // Leo leaves, the game ends early, and a spectator takes the free seat.
  await leo.getByRole('button', { name: 'Leave room' }).click();
  await leo
    .getByRole('dialog', { name: `Leave ${name}?` })
    .getByRole('button', { name: 'Leave room' })
    .click();
  await sam.getByRole('button', { name: 'Take a seat' }).click();
  await expect(maya.getByRole('region', { name: 'Players' })).toContainText(
    'Sam',
  );
  await expect(watching).toContainText('Ana');
  await expect(watching).not.toContainText('Sam');
});
