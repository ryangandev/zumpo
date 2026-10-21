import { createRoom, expect, joinRoom, test, playSolo } from './fixtures';
import {
  boardOf,
  playTurn,
  whoseTurn,
  yourTurn,
  type Memory,
} from './play/pairs';

test('two players take turns until every pair is found', async ({ player }) => {
  test.setTimeout(180_000);
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'pairs', { seats: 2 }));
  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect(maya.getByText('0 of 8 pairs')).toBeVisible();

  const memory: Memory = new Map();
  const over = maya.getByText('Game over', { exact: true });
  while (!(await over.isVisible())) {
    // Whoever is told to flip a card; a miss shows first, then passes on.
    await expect
      .poll(
        async () => (await whoseTurn([maya, leo])) !== null || over.isVisible(),
      )
      .toBe(true);
    const mover = await whoseTurn([maya, leo]);
    if (!mover) break;
    const watcher = mover === maya ? leo : maya;
    await playTurn(mover, memory);
    if (
      await mover
        .getByRole('region', { name: 'Turn' })
        .getByText('Not a pair')
        .isVisible()
    ) {
      // The turn passes to the other player. "You’re next" lasts only the
      // second both cards show, too short to catch under load; the room test
      // checks it.
      await expect(yourTurn(watcher)).toBeVisible();
    }
  }

  await expect(maya.getByRole('heading', { name: / pairs?\.$/ })).toBeVisible();
  await expect(
    maya.getByRole('list', { name: 'Standings' }).getByRole('listitem'),
  ).toHaveCount(2);
  // The finished board stays up, every card matched.
  expect(
    (await boardOf(maya)).every((card) => card.matched && card.symbol),
  ).toBe(true);
  await expect(maya.getByRole('gridcell')).toHaveCount(16);
});

test('a player with no name clears a board on their own', async ({
  player,
}) => {
  const sam = await player('Sam', { named: false });
  const sent = await playSolo(sam, 'Pairs');
  // A first visit plays Small at once.

  const memory: Memory = new Map();
  const cleared = sam.getByRole('heading', {
    name: /^8 pairs in \d+ turns\.$/,
  });
  while (!(await cleared.isVisible())) {
    await playTurn(sam, memory);
    // A miss turns back on its own, or with the next card.
  }
  await expect(sam.getByText('Board cleared', { exact: true })).toBeVisible();
  await expect(
    sam.getByRole('button', { name: 'Copy challenge link' }),
  ).toHaveCount(1);
  expect(sent()).toEqual([]);
});
