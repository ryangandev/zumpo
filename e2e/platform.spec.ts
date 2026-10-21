import type { Page } from '@playwright/test';
import { createRoom, expect, joinRoom, test } from './fixtures';

/** The name a first visit picked, as the avatar says it. */
async function pickedName(page: Page): Promise<string> {
  const label = await page
    .getByRole('button', { name: /: your name$/ })
    .getAttribute('aria-label');
  return label!.replace(/: your name$/, '');
}

test('a first visit starts with a picked name, and nothing in the way', async ({
  player,
}) => {
  const sam = await player('Sam', { named: false });
  await sam.goto('/');
  const name = await pickedName(sam);
  expect(name).toMatch(/^\w+ \w+$/);
  await expect(sam.getByRole('dialog')).toHaveCount(0);
  await sam.reload();
  await expect(
    sam.getByRole('button', { name: `${name}: your name` }),
  ).toBeVisible();

  // Nothing stands between the visitor and a room.
  await sam.getByRole('link', { name: 'Minesweeper', exact: true }).click();
  await expect(sam).toHaveURL(/\/games\/minesweeper$/);
});

test('a player goes home and straight back into another game', async ({
  player,
}) => {
  const sam = await player('Sam');
  await sam.goto('/');
  await sam.getByRole('link', { name: 'Draw & Guess', exact: true }).click();
  await expect(sam).toHaveURL(/\/games\/draw-and-guess$/);

  await sam.getByRole('link', { name: 'Zumpo home' }).click();
  await sam
    .getByRole('group', { name: 'Kind of game' })
    .getByRole('button', { name: 'Puzzles' })
    .click();
  await expect(sam).toHaveURL(/\/\?kind=puzzles$/);
  await expect(
    sam.getByRole('link', { name: 'Draw & Guess', exact: true }),
  ).toHaveCount(0);
  await sam.getByRole('link', { name: 'Make 24', exact: true }).click();
  await sam.getByRole('link', { name: 'Play solo' }).click();
  await expect(sam).toHaveURL(/\/games\/make-24\/solo$/);
});

test('a player changes their name in place, for good', async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/minesweeper');
  await sam.getByRole('button', { name: 'Sam: your name' }).click();

  const name = sam.getByRole('textbox', { name: 'Your name' });
  await expect(name).toHaveValue('Sam');
  await expect(name).toBeFocused();
  await name.fill(' ');
  await sam.getByRole('button', { name: 'Save' }).click();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();

  await sam.getByRole('button', { name: 'Roll a name' }).click();
  await expect(name).toHaveValue(/^\w+ \w+$/);
  await name.fill('Samira');
  await name.press('Enter');
  await expect(sam.getByRole('dialog', { name: 'Your name' })).toBeHidden();
  await expect(sam).toHaveURL(/\/games\/minesweeper$/);
  await expect(
    sam.getByRole('button', { name: 'Samira: your name' }),
  ).toBeVisible();

  await sam.reload();
  await expect(
    sam.getByRole('button', { name: 'Samira: your name' }),
  ).toBeVisible();
});

test('a new name reaches everyone in the room at once', async ({ player }) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  const link = await createRoom(maya, 'draw-and-guess');
  await joinRoom(leo, link);
  const players = maya.getByRole('region', { name: 'Players' });
  await expect(players.getByText('Leo')).toBeVisible();

  await leo.getByRole('button', { name: 'Leo: your name' }).click();
  await leo.getByRole('textbox', { name: 'Your name' }).fill('Leon');
  await leo.getByRole('button', { name: 'Save' }).click();
  await expect(players.getByText('Leon')).toBeVisible();
  await expect(maya.getByText('Leo is now Leon.')).toBeVisible();
  await expect(leo.getByText('Leo is now Leon.')).toBeVisible();

  // Somebody else's name, in any case, gets a number.
  await leo.getByRole('button', { name: 'Leon: your name' }).click();
  await leo.getByRole('textbox', { name: 'Your name' }).fill('maya');
  await leo.getByRole('button', { name: 'Save' }).click();
  await expect(players.getByText('maya 2')).toBeVisible();
  await expect(maya.getByText('Leon is now maya 2.')).toBeVisible();
  // Changing a name is not a way out of the room.
  await expect(leo).toHaveURL(link);
});

test('a friend from an invite link is asked for a name they know', async ({
  player,
}) => {
  const maya = await player('Maya');
  const friend = await player('Friend', { named: false });
  const link = await createRoom(maya, 'draw-and-guess');
  await joinRoom(friend, link);
  const name = await pickedName(friend);

  const nudge = friend.getByText(
    `You’re ${name} for now. Pick a name your friends will know.`,
  );
  await expect(nudge).toBeVisible();
  await friend.getByRole('button', { name: 'Change name' }).click();
  await friend.getByRole('textbox', { name: 'Your name' }).fill('Ava');
  await friend.getByRole('button', { name: 'Save' }).click();
  await expect(nudge).toBeHidden();
  await expect(
    maya.getByRole('region', { name: 'Players' }).getByText('Ava'),
  ).toBeVisible();
  await expect(maya.getByText(`${name} is now Ava.`)).toBeVisible();
});

/** Clicks Invite friends, which copies the link at once on a desktop. */
async function copyInvite(page: Page): Promise<string> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const invite = page.getByRole('button', { name: 'Invite friends' }).first();
  const box = await invite.boundingBox();
  await invite.click();
  const copied = page.getByRole('button', { name: 'Link copied' }).first();
  await expect(copied).toBeVisible();
  // The label changes in place; the button keeps its width.
  expect((await copied.boundingBox())!.width).toBe(box!.width);
  await expect(page.getByRole('dialog')).toBeHidden();
  return page.evaluate(() => navigator.clipboard.readText());
}

test('a friend joins from the invite link', async ({ player }) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  const link = await createRoom(maya, 'draw-and-guess');

  expect(await copyInvite(maya)).toBe(link);

  await joinRoom(leo, link);
  const players = maya.getByRole('region', { name: 'Players' });
  await expect(players.getByText('Leo')).toBeVisible();
  await expect(maya.getByRole('button', { name: 'Start game' })).toBeVisible();
});

test('a friend with the invite link sits straight down in a private room', async ({
  player,
}) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  const link = await createRoom(maya, 'minesweeper', { password: 'otter' });

  const invite = await copyInvite(maya);
  expect(invite).toMatch(new RegExp(`^${link}#key=[\\w-]{16}$`));
  expect(invite).not.toContain('otter');

  await joinRoom(leo, invite);
  await expect(leo.getByLabel('Room password')).toBeHidden();
  // The key leaves the address bar once it has done its work.
  await expect(leo).toHaveURL(link);
  await expect(
    maya.getByRole('region', { name: 'Players' }).getByText('Leo'),
  ).toBeVisible();
});

test('an invite the clipboard refuses shows the link to copy by hand', async ({
  player,
}) => {
  const maya = await player('Maya');
  const link = await createRoom(maya, 'draw-and-guess');
  await maya.evaluate(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });

  await maya.getByRole('button', { name: 'Invite friends' }).first().click();
  const invite = maya.getByRole('dialog', { name: 'Invite friends' });
  await expect(invite.getByRole('textbox', { name: 'Room link' })).toHaveValue(
    link,
  );
  await expect(invite.getByRole('button', { name: 'Copy' })).toBeFocused();
  await invite.getByRole('button', { name: 'Done' }).click();
  await expect(invite).toBeHidden();
});

test('a room keeps a player until they mean to leave', async ({ player }) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  const roomName = `Keep ${test.info().workerIndex}-${Date.now()}`;
  const link = await createRoom(maya, 'draw-and-guess', { name: roomName });
  // In from the lobby, so back is a step inside the app; a back to another
  // page load leaves the app, which no page can stop.
  await leo.goto('/games/draw-and-guess');
  await leo
    .getByRole('article', { name: roomName })
    .getByRole('button', { name: 'Join' })
    .click();
  await expect(leo).toHaveURL(link);

  await leo.getByRole('button', { name: 'How to play' }).click();
  const rules = leo.getByRole('dialog', { name: 'How to play Draw & Guess' });
  await expect(
    rules.getByText('Draw a word for the others to guess, and guess theirs.'),
  ).toBeVisible();
  await rules.getByRole('button', { name: 'Full rules' }).click();
  await expect(rules.getByText(/^Everyone else has 90 seconds/)).toBeVisible();
  await rules.getByRole('button', { name: 'Back to the game' }).click();
  await expect(rules).toBeHidden();
  await expect(leo).toHaveURL(link);

  // Between games, any way out but Leave room asks first.
  await leo.getByRole('link', { name: 'Zumpo home' }).click();
  const leave = leo.getByRole('dialog', { name: /^Leave .*\?$/ });
  await expect(leave.getByText('Your seat goes with you.')).toBeVisible();
  await leave.getByRole('button', { name: 'Stay' }).click();
  await expect(leo).toHaveURL(link);

  await leo.goBack();
  await leave.getByRole('button', { name: 'Leave room' }).click();
  await expect(leo).toHaveURL(/\/games\/draw-and-guess$/);
  await expect(
    maya.getByRole('region', { name: 'Players' }).getByText('Leo'),
  ).toBeHidden();
});

test('a private room asks for its password', async ({ player }) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  const link = await createRoom(maya, 'minesweeper', { password: 'otter' });

  await leo.goto(link);
  const password = leo.getByLabel('Room password');
  await password.fill('seal');
  await leo.getByRole('button', { name: 'Join room' }).click();
  await expect(
    leo.getByText('That password didn’t work. Try again.'),
  ).toBeVisible();
  await expect(password).toBeFocused();

  await password.fill('otter');
  await leo.getByRole('button', { name: 'Join room' }).click();
  await expect(leo.getByRole('button', { name: 'Leave room' })).toBeVisible();
});

test('a lobby shows a new room live, and joins it', async ({ player }) => {
  const sam = await player('Sam');
  const maya = await player('Maya');
  const roomName = `Lobby check ${test.info().workerIndex}-${Date.now()}`;

  await sam.goto('/games/draw-and-guess');
  await expect(sam.getByRole('heading', { level: 1 })).toBeVisible();
  await createRoom(maya, 'draw-and-guess', { name: roomName });

  const row = sam.getByRole('article', { name: roomName });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Join' }).click();
  await expect(sam.getByRole('button', { name: 'Leave room' })).toBeVisible();
});

test('a mangled room link says the room is gone', async ({ player }) => {
  const sam = await player('Sam');
  await sam.goto('/games/draw-and-guess/rooms/not-a-room');
  await expect(
    sam.getByRole('heading', { name: 'This room has packed up.' }),
  ).toBeVisible();
});

test('a latecomer to a game in progress watches it', async ({ player }) => {
  const maya = await player('Maya');
  const leo = await player('Leo');
  const sam = await player('Sam');
  const link = await createRoom(maya, 'minesweeper');
  await joinRoom(leo, link);
  await maya.getByRole('button', { name: 'Start game' }).click();
  await expect(leo.getByText('Pick a cell')).toBeVisible();

  await sam.goto(link);
  await expect(
    sam.getByText(
      'You’re watching this game. You can take a seat once it ends.',
    ),
  ).toBeVisible();
  await expect(
    maya.getByRole('region', { name: 'Watching' }).getByText('Sam'),
  ).toBeVisible();
});
