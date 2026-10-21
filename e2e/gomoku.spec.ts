import { createRoom, expect, joinRoom, playSolo, test } from './fixtures';
import { blackOf, boardOf, place, pointOf, turnOf } from './play/gomoku';

test('two players make five in a row while a third watches, then swap colours', async ({
  player,
}) => {
  test.setTimeout(150_000);
  const maya = await player('Maya');
  const leo = await player('Leo');
  // Unique, because the lobby lists every room on the shared server.
  const name = `Board ${test.info().repeatEachIndex}-${test.info().workerIndex}`;
  const link = await createRoom(maya, 'gomoku', { name });
  await joinRoom(leo, link);
  await expect(maya.getByText('Leo', { exact: true }).first()).toBeVisible();
  await maya.getByRole('button', { name: 'Start game' }).click();

  // The colours are drawn: whoever plays Black moves first.
  const black = await blackOf([maya, leo]);
  const white = black === maya ? leo : maya;
  const [blackName, whiteName] =
    black === maya ? ['Maya', 'Leo'] : ['Leo', 'Maya'];
  await expect(black.getByText('Game 1')).toBeVisible();
  await expect(
    turnOf(white).getByText(`${blackName} is thinking`),
  ).toBeVisible();
  await expect(turnOf(white).getByRole('timer')).toContainText('to move');

  // Somebody arriving under way watches, from the lobby.
  const jo = await player('Jo');
  await jo.goto('/games/gomoku');
  const row = jo.getByRole('article', { name });
  await expect(row.getByText('Playing')).toBeVisible();
  await row.getByRole('button', { name: 'Watch' }).click();
  await expect(jo.getByText(`${blackName}’s turn`)).toBeVisible();
  await expect(jo.getByRole('button', { name: 'Resign' })).toHaveCount(0);

  // Black's first stone from the keyboard: the arrows start on the centre,
  // and the focus stays on the point through the move.
  await pointOf(black, 'H8').focus();
  await black.keyboard.press('ArrowLeft');
  await black.keyboard.press('ArrowLeft');
  await black.keyboard.press('ArrowLeft');
  await black.keyboard.press('ArrowLeft');
  await expect(pointOf(black, 'D8')).toBeFocused();
  await black.keyboard.press('Enter');
  await expect(pointOf(black, 'D8')).toHaveAccessibleName(
    'D8, black stone, last placed',
  );
  await expect(pointOf(black, 'D8')).toBeFocused();
  await expect(turnOf(white).getByText(`${blackName} played D8`)).toBeVisible();
  await expect(pointOf(jo, 'D8')).toHaveAccessibleName(
    'D8, black stone, last placed',
  );

  // Out of turn the points are disabled, and a click places nothing.
  await expect(pointOf(black, 'J9')).toBeDisabled();
  await pointOf(black, 'J9').click({ force: true });
  await expect(pointOf(black, 'J9')).toHaveAccessibleName('J9, empty');

  for (const [mine, theirs] of [
    ['A1', 'E8'],
    ['C1', 'F8'],
    ['E1', 'G8'],
    ['G1', 'H8'],
  ] as const) {
    await place(white, mine);
    await place(black, theirs);
  }

  for (const page of [maya, leo, jo]) {
    await expect(page.getByText('Game over', { exact: true })).toBeVisible();
    await expect(
      boardOf(page).getByRole('gridcell', {
        name: /black stone, in the winning line$/,
      }),
    ).toHaveCount(5);
  }
  await expect(
    black.getByRole('heading', { name: 'You win with five in a row.' }),
  ).toBeVisible();
  await expect(
    white.getByRole('heading', {
      name: `${blackName} wins with five in a row.`,
    }),
  ).toBeVisible();
  await expect(
    maya.getByText(`A game of 9 moves. Next game, ${whiteName} plays Black.`),
  ).toBeVisible();
  await expect(black.getByText('Five in a row, D8 to H8')).toBeVisible();
  await expect(leo.getByText(`${blackName} made five in a row.`)).toBeVisible();

  // The colours swap for the same pair, and either may resign.
  await maya.getByRole('button', { name: 'Play again' }).click();
  await expect(turnOf(white).getByText('Place a black stone')).toBeVisible();
  await expect(white.getByText('Game 2')).toBeVisible();
  await expect(
    boardOf(white).getByRole('gridcell', { name: /stone/ }),
  ).toHaveCount(0);
  await white.getByRole('button', { name: 'Resign' }).click();
  const dialog = white.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Keep playing' }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Resign' }).click();
  await expect(
    black.getByRole('heading', { name: `You win: ${whiteName} resigned.` }),
  ).toBeVisible();
  await expect(
    white.getByRole('heading', { name: 'You resigned.' }),
  ).toBeVisible();
  await expect(
    jo.getByRole('heading', {
      name: `${blackName} wins: ${whiteName} resigned.`,
    }),
  ).toBeVisible();
});

test('a phone puts a faint stone down first, and places it on a second tap', async ({
  player,
}) => {
  const maya = await player('Maya', { phone: true });
  const leo = await player('Leo', { phone: true });
  await joinRoom(leo, await createRoom(maya, 'gomoku'));
  await maya.getByRole('button', { name: 'Start game' }).click();
  const black = await blackOf([maya, leo]);

  // Place stone is under the board from the start, and acts once a faint
  // stone is down.
  const placeStone = black.getByRole('button', { name: 'Place stone' });
  await expect(placeStone).toBeDisabled();
  await pointOf(black, 'H8').tap();
  await expect(pointOf(black, 'H8')).toHaveAccessibleName('H8, empty');
  await expect(placeStone).toBeEnabled();
  // Another point moves the faint stone; Place stone places it.
  await pointOf(black, 'J9').tap();
  await placeStone.click();
  await expect(pointOf(black, 'J9')).toHaveAccessibleName(
    'J9, black stone, last placed',
  );
  await expect(placeStone).toBeDisabled();

  // A second tap on the faint stone places it too.
  const white = black === maya ? leo : maya;
  await pointOf(white, 'H8').tap();
  await pointOf(white, 'H8').tap();
  await expect(pointOf(black, 'H8')).toHaveAccessibleName(
    'H8, white stone, last placed',
  );

  // After the game a guest's line about the next one is in the turn bar,
  // and only buttons are under the board, which keeps its size and place.
  const board = leo.getByRole('grid', { name: 'Gomoku board' });
  const during = (await board.boundingBox())!;
  await black.getByRole('button', { name: 'Resign' }).click();
  await black
    .getByRole('dialog')
    .getByRole('button', { name: 'Resign' })
    .click();
  await expect(turnOf(leo).getByText('Ready for the next game?')).toBeVisible();
  await expect(
    leo.getByRole('button', { name: 'Ready', exact: true }),
  ).toBeVisible();
  expect(await board.boundingBox()).toEqual(during);
});

test('a player plays the computer on their own, with nothing sent to the server', async ({
  player,
}) => {
  const sam = await player('Sam');
  const sent = await playSolo(sam, 'Gomoku');
  await expect(sam.getByRole('combobox', { name: 'Level' })).toContainText(
    'Medium',
  );
  await sam.getByRole('button', { name: 'Start' }).click();

  await expect(sam.getByText('Move 1')).toBeVisible();
  await pointOf(sam, 'H8').click();
  await expect(turnOf(sam).getByText('The computer is thinking')).toBeVisible();
  // The computer's stone lands after half a second at least.
  await expect(
    turnOf(sam).getByText(/^The computer played [A-O]\d+$/),
  ).toBeVisible();
  await expect(sam.getByText('Move 3')).toBeVisible();
  await expect(
    boardOf(sam).getByRole('gridcell', { name: /white stone, last placed$/ }),
  ).toHaveCount(1);
  expect(sent()).toEqual([]);
});
