import type { Locator } from '@playwright/test';
import { createRoom, expect, joinRoom, test, playSolo } from './fixtures';
import { startServer } from './own-server';
import {
  missWith,
  pickMiss,
  pickPlaces,
  pickTrio,
  readyToFind,
  tableOf,
  turnOf,
} from './play/trios';

test('two players race for trios until the game is over', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const maya = await player('Maya');
  const leo = await player('Leo');
  await joinRoom(leo, await createRoom(maya, 'trios', { seats: 2, trios: 10 }));
  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect(maya.getByText('0 of 10 trios')).toBeVisible();
  await readyToFind(leo);

  // A wrong claim locks Leo out on his own screen, and tells nobody else.
  await pickMiss(leo);
  await expect(turnOf(leo).getByText('Not a trio')).toBeVisible();
  await expect(leo.getByLabel(/, not a trio$/)).toHaveCount(3);
  await expect(
    leo.getByRole('group', { name: 'Table' }).getByRole('button'),
  ).toHaveCount(0);
  await expect(turnOf(maya).getByText('Find a trio')).toBeVisible();
  await expect(maya.getByLabel(/, not a trio$/)).toHaveCount(0);

  // Maya takes the first trio, and Leo sees who took it. The turn bar says so
  // for half a second here, too short to catch under load; the table's last
  // trio and the chat say so for good.
  await pickTrio(maya);
  for (const page of [maya, leo]) {
    await expect(page.getByText('1 of 10 trios')).toBeVisible();
  }
  await expect(leo.getByText('Last trio: Maya')).toBeVisible();
  await expect(leo.getByText('Maya found a trio, +1.')).toBeVisible();

  // Maya takes six in all and Leo four; the lockout is long over by then.
  for (let trio = 2; trio <= 10; trio++) {
    const finder = trio <= 6 ? maya : leo;
    await readyToFind(finder);
    await pickTrio(finder);
    if (trio === 10) break;
    // Both have seen it taken before either looks again.
    for (const page of [maya, leo]) {
      await expect(page.getByText(`${trio} of 10 trios`)).toBeVisible();
    }
  }

  for (const page of [maya, leo]) {
    await expect(
      page.getByRole('banner').getByText('Game over', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Turn' })
        .getByText(
          page === maya ? 'You win with 6 trios.' : 'Maya wins with 6 trios.',
        ),
    ).toBeVisible();
  }
  await expect(
    maya.getByRole('list', { name: 'Standings' }).getByRole('listitem'),
  ).toHaveCount(2);
  // The finished table stays up, the last trio marked with who took it.
  expect(await tableOf(maya)).toHaveLength(12);
  await expect(maya.getByLabel(/, found, by Leo$/)).toHaveCount(3);
});

test('a player with no name finds ten trios on their own', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const sam = await player('Sam', { named: false });
  const sent = await playSolo(sam, 'Trios');

  const turn = turnOf(sam);
  await expect(turn.getByText('Trio 1 of 10')).toBeVisible();
  // A wrong pick costs five seconds, never a trio. What the turn says about
  // a pick lasts 600 ms, too short to catch under load; the run keeps count.
  const thisRun = sam.getByRole('region', { name: 'This run' });
  await pickMiss(sam);
  await expect(thisRun.getByText('1, +0:05')).toBeVisible();

  for (let trio = 1; trio <= 10; trio++) {
    await expect(turn.getByText(`Trio ${trio} of 10`)).toBeVisible();
    await readyToFind(sam);
    await pickTrio(sam);
  }

  await expect(
    sam.getByRole('heading', { name: /^10 trios in \d+:\d\d\.$/ }),
  ).toBeVisible();
  await expect(sam.getByText('Run complete', { exact: true })).toBeVisible();
  await expect(
    sam.getByRole('button', { name: 'Copy challenge link' }),
  ).toHaveCount(1);
  expect(sent()).toEqual([]);
});

test('on a phone, the table stays put through every phase', async ({
  player,
}) => {
  test.setTimeout(120_000);
  // Hints two seconds apart, so a table soon has both and the clock counts up.
  const server = await startServer(0, { TRIOS_HINT_SECONDS: '2' });
  try {
    const own = { server: server.url };
    const maya = await player('Maya', own);
    const leo = await player('Leo', { ...own, phone: true });
    await joinRoom(leo, await createRoom(maya, 'trios', { seats: 2 }));
    await maya.getByRole('button', { name: 'Start game' }).click();
    await readyToFind(leo);

    // The turn bar stacks above the table on a phone; whatever it says, the
    // table must not move, or a tap meant for one card lands on another.
    const table = leo.getByRole('group', { name: 'Table' });
    const top = async () => (await table.boundingBox())!.y;
    const at = await top();
    const turn = turnOf(leo);
    const stays = async (state: Locator) => {
      await expect(state).toBeVisible();
      expect(await top(), (await state.textContent()) ?? undefined).toBe(at);
    };

    await stays(turn.getByText('to a hint'));
    await stays(turn.getByText('One card of a trio is marked'));
    await stays(turn.getByText('Two cards of a trio are marked'));
    await stays(turn.getByText('without a trio'));

    // Two picks, then a third that is not a trio, which says why.
    const miss = missWith(await tableOf(leo), [0, 1]);
    await pickPlaces(leo, miss.slice(0, 2));
    await stays(turn.getByText('Pick a third card'));
    await pickPlaces(leo, miss.slice(2));
    await stays(turn.getByText('locked out'));
    await stays(turn.getByText('Find the third card'));

    // Maya takes a trio: Leo sees it taken, then new cards.
    await readyToFind(maya);
    await pickTrio(maya);
    await stays(turn.getByText('Maya found a trio'));
    await stays(turn.getByText('to a hint'));
  } finally {
    server.process.kill('SIGKILL');
  }
});
