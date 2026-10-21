import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test, playSolo } from './fixtures';
import { whoseTurn, yourTurn } from './play/liars-dice';

/** Calls Liar on the bid in front of them, or opens the round when there is none. */
async function callOrOpen(page: Page) {
  const call = page.getByRole('button', { name: 'Call Liar' });
  if (await call.isVisible()) return call.click();
  await page.getByRole('button', { name: /^Bid / }).click();
}

const cup = (page: Page, name: string) => page.getByRole('region', { name });

test('two players bid and call until one of them has dice left', async ({
  player,
}) => {
  test.setTimeout(150_000);
  const maya = await player('Maya');
  const leo = await player('Leo', { phone: true });
  await joinRoom(leo, await createRoom(maya, 'liars-dice', { dice: 3 }));
  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect(maya.getByText('Round 1', { exact: true })).toBeVisible();

  // Each player sees their own dice, and only the backs of the other's.
  for (const [page, other, you] of [
    [maya, 'Leo', 'Maya (you)'],
    [leo, 'Maya', 'Leo (you)'],
  ] as const) {
    await expect(
      cup(page, you).getByRole('img', { name: /^[1-6](, wild)?$/ }),
    ).toHaveCount(3);
    await expect(
      cup(page, other).getByRole('img', { name: 'Hidden die' }),
    ).toHaveCount(3);
  }

  const over = maya.getByText('Game over', { exact: true });
  let calls = 0;
  while (!(await over.isVisible())) {
    await expect
      .poll(
        async () => (await whoseTurn([maya, leo])) !== null || over.isVisible(),
      )
      .toBe(true);
    const mover = await whoseTurn([maya, leo]);
    if (!mover) break;
    const called = await mover
      .getByRole('button', { name: 'Call Liar' })
      .isVisible();
    await callOrOpen(mover);
    if (!called) {
      // The bid is on the table for both, and the turn passes on.
      for (const page of [maya, leo]) {
        await expect(
          page.getByRole('region', { name: 'Bids this round' }),
        ).toBeVisible();
      }
      continue;
    }
    calls += 1;
    // A call's reveal lasts two seconds here, too short to catch on both
    // pages under load; the next round, or the end of the game, stays.
    for (const page of [maya, leo]) {
      await expect(
        page
          .getByText(`Round ${calls + 1}`, { exact: true })
          .or(page.getByText('Game over', { exact: true }))
          .first(),
      ).toBeVisible();
    }
  }

  // Each call costs somebody a die: three to put one of two players out.
  expect(calls).toBeGreaterThanOrEqual(3);
  expect(calls).toBeLessThanOrEqual(5);
  await expect(
    maya.getByRole('heading', {
      name: /^(Maya|Leo) wins with (1 die|2 dice|3 dice)\.$/,
    }),
  ).toBeVisible();
  await expect(
    maya.getByRole('list', { name: 'Standings' }).getByRole('listitem'),
  ).toHaveCount(2);
  // The call that ended the game stays up under the results, every cup open
  // for both players, with the same count; the verdict names the bidder to the
  // others and says "Your bid" to them.
  const counts: (string | null)[] = [];
  for (const page of [maya, leo]) {
    const lastCall = page.getByRole('region', { name: 'The last call' });
    await expect(lastCall).toBeVisible();
    counts.push((await lastCall.textContent())?.split('→')[0] ?? null);
    await expect(page.getByRole('img', { name: 'Hidden die' })).toHaveCount(0);
  }
  expect(counts[0]).toBe(counts[1]);
  await expect(leo.getByText('Game over', { exact: true })).toBeVisible();
});

test('a player with no name plays a table of bots to the end', async ({
  player,
}) => {
  test.setTimeout(150_000);
  const sam = await player('Sam', { named: false });
  const sent = await playSolo(sam, 'Liar’s Dice');
  await expect(sam.getByText('Round 1', { exact: true })).toBeVisible();
  await expect(
    sam.getByRole('region', { name: /^(Pip|Juno|Otto|Remy|Wren)$/ }),
  ).toHaveCount(3);

  const result = sam.getByRole('heading', {
    name: /^(You won in \d+ rounds|You finished \d\w\w of 4)\.$/,
  });
  const nextRound = sam.getByRole('button', { name: 'Next round' });
  while (!(await result.isVisible())) {
    // The bots take a second a turn; act whenever there is something to do.
    await expect
      .poll(
        async () =>
          (await yourTurn(sam).isVisible()) ||
          (await nextRound.isVisible()) ||
          result.isVisible(),
        { timeout: 15_000 },
      )
      .toBe(true);
    if (await nextRound.isVisible()) await nextRound.click();
    else if (await yourTurn(sam).isVisible()) await callOrOpen(sam);
  }
  await expect(sam.getByRole('button', { name: 'Play again' })).toBeVisible();
  await expect(sam.getByText('Games won').first()).toBeVisible();
  expect(sent()).toEqual([]);
});
