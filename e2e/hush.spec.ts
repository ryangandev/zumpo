import { createRoom, dropConnection, expect, joinRoom, test } from './fixtures';
import { deal, play, readyUp } from './play/hush';

test('two players play every card in order, together, without a word', async ({
  player,
}) => {
  test.setTimeout(180_000);
  const maya = await player('Maya');
  const leo = await player('Leo');
  const both = [maya, leo];
  await joinRoom(leo, await createRoom(maya, 'hush', { seats: 2 }));
  await expect(maya.getByText(/^2 players, 7 levels\./)).toBeVisible();
  await maya.getByRole('button', { name: 'Start game' }).click();

  const turn = (page: typeof maya) =>
    page.getByRole('region', { name: 'Turn' });
  const chat = (page: typeof maya) =>
    page.getByRole('textbox', { name: 'Message' });

  // Level 1, played wrong on purpose: the higher card goes first.
  await expect(turn(leo).getByText('Get ready')).toBeVisible();
  await expect(chat(leo)).toBeEnabled();
  await readyUp(both);
  await expect(chat(maya)).toBeDisabled();
  await expect(chat(maya)).toHaveAttribute(
    'placeholder',
    'Hush. Chat opens when the level ends.',
  );
  const [low, high] = await deal(both);
  await play(high!.page, high!.card, [high!.page]);
  // The turn bar says so for a second here, too short to catch under load;
  // the lives, the discard and the chat say so for good.
  await expect(low!.page.getByRole('img', { name: '2 lives' })).toBeVisible();
  await expect(
    low!.page.getByRole('img', { name: `${low!.card}, discarded` }),
  ).toBeVisible();
  const holder = low!.page === maya ? 'Maya' : 'Leo';
  const player1 = high!.page === maya ? 'Maya' : 'Leo';
  await expect(
    maya.getByText(
      `${player1} played ${high!.card}, but ${holder} held ${low!.card}.`,
    ),
  ).toBeVisible();

  // Level 1 is cleared, not cleanly; the chat opens between levels.
  await expect(maya.getByText('Level 1 cleared!')).toBeVisible();
  await expect(chat(maya)).toBeEnabled();

  // Every other level is played clean; the first wins the life back.
  for (let level = 2; level <= 7; level++) {
    await expect(turn(maya).getByText(`Level ${level} of 7`)).toBeVisible();
    await expect(turn(maya).getByText('Get ready')).toBeVisible();
    await readyUp(both);
    for (const { page, card } of await deal(both)) {
      await play(page, card, both);
    }
    if (level === 2) {
      await expect(
        maya.getByText('Level 2 cleared without a slip: a life back!'),
      ).toBeVisible();
      await expect(maya.getByRole('img', { name: '3 lives' })).toBeVisible();
    }
  }

  // The team's result: no ranks, every level, and the last pile.
  for (const page of both) {
    await expect(
      page.getByRole('heading', { name: 'All 7 levels cleared.' }),
    ).toBeVisible();
    await expect(
      page.getByText('Together, with 3 lives to spare.'),
    ).toBeVisible();
  }
  await expect(maya.getByText('Level 1: a life lost')).toBeVisible();
  await expect(maya.getByText('Level 2: clean, a life back')).toBeVisible();
  await expect(maya.getByText('Level 7: clean')).toBeVisible();
  await expect(maya.getByText('Winner')).toHaveCount(0);
  await expect(
    maya.getByRole('region', { name: 'The pile' }).getByRole('img'),
  ).toHaveCount(14);
  await expect(maya.getByRole('button', { name: 'Play again' })).toBeVisible();
  // Leo says he is ready, which tells Maya; starting is still hers.
  await expect(
    leo.getByText('Say you’re ready, and Maya starts the next game.'),
  ).toBeVisible();
  await leo.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(
    leo.getByText('Everyone’s ready. Waiting for Maya to start.'),
  ).toBeVisible();
  await expect(maya.getByText('Everyone’s ready.')).toBeVisible();
  await maya.getByRole('button', { name: 'Play again' }).click();
  for (const page of [maya, leo]) {
    await expect(page.getByRole('button', { name: 'I’m ready' })).toBeVisible();
  }
});

test('a level waits for a player who dropped, and goes on when they are back', async ({
  player,
}) => {
  const maya = await player('Maya');
  const leo = await player('Leo', { droppable: true });
  await joinRoom(leo, await createRoom(maya, 'hush', { seats: 2 }));
  await maya.getByRole('button', { name: 'Start game' }).click();
  await readyUp([maya, leo]);
  const held = await deal([maya, leo]);

  const restore = await dropConnection(leo);
  const turn = maya.getByRole('region', { name: 'Turn' });
  await expect(turn.getByText('Paused')).toBeVisible();
  await expect(
    turn.getByText('Waiting for Leo, who still holds 1 card.'),
  ).toBeVisible();
  await expect(
    maya.getByRole('region', { name: 'Players' }).getByText('Away, 1 card'),
  ).toBeVisible();
  await expect(maya.getByRole('button', { name: /^Play / })).toHaveCount(0);

  restore();
  await expect(leo.getByRole('button', { name: 'Leave room' })).toBeVisible({
    timeout: 20_000,
  });
  for (const { page, card } of held) await play(page, card, [maya, leo]);
  await expect(maya.getByText('Level 1 cleared without a slip!')).toBeVisible();
});
