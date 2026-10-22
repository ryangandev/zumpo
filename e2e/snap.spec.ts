import { createRoom, expect, joinRoom, test, playSolo } from './fixtures';
import { startServer } from './own-server';
import {
  cardOf,
  readyToTap,
  symbolsOf,
  tapMatch,
  tapMiss,
  turnOf,
} from './play/snap';

test('two players race for the middle card while a third watches', async ({
  player,
}) => {
  test.setTimeout(150_000);
  const maya = await player('Maya');
  const leo = await player('Leo');
  const link = await createRoom(maya, 'snap', { seats: 3 });
  await joinRoom(leo, link);
  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect(maya.getByText('0 of 29 cards')).toBeVisible();
  await expect(leo.getByText('29 left')).toBeVisible();
  await readyToTap(leo);

  // Somebody who comes in after the start watches: the middle card and the
  // scores, never a card of their own.
  const jo = await player('Jo');
  await joinRoom(jo, link);
  await expect(turnOf(jo).getByText('You’re watching')).toBeVisible();
  await expect(cardOf(jo, 'Middle card').getByRole('img')).toHaveCount(6);
  await expect(cardOf(jo, 'Your card')).toHaveCount(0);
  expect(await symbolsOf(jo, 'Middle card')).toEqual(
    await symbolsOf(maya, 'Middle card'),
  );

  // A symbol on only his card locks Leo out on his own screen, and tells
  // nobody else.
  const miss = await tapMiss(leo);
  await expect(turnOf(leo).getByText('Not a match')).toBeVisible();
  await expect(
    cardOf(leo, 'Your card').getByRole('button', {
      name: `${miss}, not a match`,
    }),
  ).toBeDisabled();
  await expect(
    cardOf(leo, 'Middle card').getByRole('button', { disabled: false }),
  ).toHaveCount(0);
  await expect(turnOf(maya).getByText('Spot the match')).toBeVisible();
  await expect(maya.getByLabel(/, not a match$/)).toHaveCount(0);

  // Maya takes the first card, and everybody sees who took it. The taken
  // moment lasts half a second here, too short to catch under load; the
  // count says so for good, and the chat is left to the talk.
  await tapMatch(maya);
  for (const page of [maya, leo, jo]) {
    await expect(page.getByText('1 of 29 cards')).toBeVisible();
  }
  await expect(leo.getByText(/took a card/)).toHaveCount(0);
  await expect(maya.getByText('1 won')).toBeVisible();

  // Maya takes fifteen in all and Leo fourteen; his lockout is long over.
  for (let card = 2; card <= 29; card++) {
    const taker = card <= 15 ? maya : leo;
    await readyToTap(taker);
    await tapMatch(taker);
    if (card === 29) break;
    // Everybody has seen it taken before anybody looks again.
    for (const page of [maya, leo, jo]) {
      await expect(page.getByText(`${card} of 29 cards`)).toBeVisible();
    }
  }

  for (const page of [maya, leo, jo]) {
    await expect(
      page.getByRole('banner').getByText('Game over', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Turn' })
        .getByText(
          page === maya ? 'You win with 15 cards.' : 'Maya wins with 15 cards.',
        ),
    ).toBeVisible();
  }
  // The last card stays up, with who took it.
  await expect(
    maya.getByRole('group', { name: 'Last card, taken by Leo' }),
  ).toBeVisible();
  // Not your own card again: the standings count everybody's cards.
  await expect(maya.getByText('15 won')).toBeHidden();
});

test('a player with no name races through thirty cards on their own', async ({
  player,
}) => {
  test.setTimeout(120_000);
  const sam = await player('Sam', { named: false });
  const sent = await playSolo(sam, 'Snap');

  const turn = turnOf(sam);
  await expect(turn.getByText('Card 1 of 30')).toBeVisible();
  // A wrong tap costs three seconds, never a card. What the turn says about
  // it lasts 600 ms, too short to catch under load; the run keeps count.
  const thisRun = sam.getByRole('region', { name: 'This run' });
  await tapMiss(sam);
  await expect(thisRun.getByText('1, +0:03')).toBeVisible();

  for (let card = 1; card <= 30; card++) {
    await expect(turn.getByText(`Card ${card} of 30`)).toBeVisible();
    await readyToTap(sam);
    await tapMatch(sam);
  }

  await expect(
    sam.getByRole('heading', { name: /^30 cards in \d+:\d\d\.$/ }),
  ).toBeVisible();
  await expect(sam.getByText('Run complete', { exact: true })).toBeVisible();
  await expect(
    sam.getByRole('button', { name: 'Copy challenge link' }),
  ).toHaveCount(1);
  expect(sent()).toEqual([]);
});

test('the cards stay put through every phase, on a phone and beside the side column', async ({
  player,
}) => {
  test.setTimeout(120_000);
  // A taken card stays two seconds, long enough to look at.
  const server = await startServer(0, { SNAP_TAKEN_SECONDS: '2' });
  try {
    const own = { server: server.url };
    // As long as a name can be: "… took it" takes two lines on a phone.
    const maya = await player('Bartholomew Wilder', own);
    const leo = await player('Leo', { ...own, phone: true });
    await joinRoom(leo, await createRoom(maya, 'snap', { seats: 2 }));
    await maya.getByRole('button', { name: 'Start game' }).click();
    await readyToTap(leo);

    // The turn bar stacks above the cards on a phone; whatever it says, the
    // cards must not move, or a tap meant for one symbol lands on another.
    const middle = cardOf(leo, 'Middle card');
    // On the page, not in the window: a tap scrolls a card below into view.
    const top = () =>
      middle.evaluate((card) => card.getBoundingClientRect().top + scrollY);
    const at = await top();
    const turn = turnOf(leo);

    await expect(turn.getByText('on this card')).toBeVisible();
    await tapMiss(leo);
    await expect(turn.getByText('locked out', { exact: true })).toBeVisible();
    expect(await top()).toBe(at);

    await readyToTap(maya);
    await tapMatch(maya);
    await expect(turn.getByText('Bartholomew Wilder took it')).toBeVisible();
    expect(await top()).toBe(at);
    await expect(turn.getByText('on this card')).toBeVisible();
    await expect(leo.getByText('1 of 29 cards')).toBeVisible();
    expect(await top()).toBe(at);

    // Beside the side column at this width, "Spot the match" and its meta
    // fit one line and the meta goes under a long name.
    await leo.setViewportSize({ width: 1240, height: 900 });
    await readyToTap(leo);
    await expect(leo.getByRole('region', { name: /^Players/ })).toBeVisible();
    const wide = await top();
    await readyToTap(maya);
    await tapMatch(maya);
    await expect(turn.getByText('Bartholomew Wilder took it')).toBeVisible();
    expect(await top()).toBe(wide);
    await expect(leo.getByText('2 of 29 cards')).toBeVisible();
    await expect(turn.getByText('on this card')).toBeVisible();
    expect(await top()).toBe(wide);
  } finally {
    server.process.kill('SIGKILL');
  }
});
