import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { pointAt } from '../../../shared/gomoku';
import type { GomokuMove, GomokuRoomState } from '../../../shared/wire-types';
import { gomokuState, ME } from '../tests/fixtures';
import { onPhone, onTouch } from '../tests/phone';
import { renderSeated } from '../tests/seated';

const E8 = pointAt(4, 8);
const E9 = pointAt(4, 9);
const E10 = pointAt(4, 10);
const F8 = pointAt(5, 8);

const colors = {
  black: { playerId: ME, username: 'Ryan' },
  white: { playerId: 'p2', username: 'Maya' },
};

/** Ryan plays Black in game 2; Maya has just played E8. */
const myTurn = gomokuState({
  isGameStarted: true,
  phase: 'playing',
  phaseEndsInMs: 24_000,
  colors,
  gameNumber: 2,
  moves: [
    { color: 'black', point: E9 },
    { color: 'white', point: E8 },
  ],
  turnPlayerId: ME,
  missedTurns: { [ME]: 0, p2: 0 },
  playerList: {
    p1: { username: 'Ryan', points: 0, isConnected: true },
    p2: { username: 'Maya', points: 1, isConnected: true },
  },
});

const played = (
  state: GomokuRoomState,
  ...moves: GomokuMove[]
): GomokuRoomState => {
  const all = [...state.moves, ...moves];
  return {
    ...state,
    moves: all,
    turnPlayerId: all.length % 2 === 0 ? ME : 'p2',
  };
};

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const placeStone = () => screen.getByRole('button', { name: 'Place stone' });
const board = () => screen.getByRole('grid', { name: 'Gomoku board' });
const point = (name: string) =>
  within(board()).getByRole('gridcell', { name: new RegExp(`^${name},`) });
const scoreboard = () =>
  within(screen.getByRole('region', { name: /^Players/ }));

describe('a Gomoku room', () => {
  it('lets the host start once both seats are taken, with no colours yet', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(gomokuState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(screen.getByText('Waiting room')).toBeInTheDocument();
    expect(
      screen.getByText('Two players, a 15 × 15 board, 30 seconds a move.'),
    ).toBeInTheDocument();
    // The scoreboard says who is here; no seats repeat it before a game.
    expect(scoreboard().getByText('Maya')).toBeInTheDocument();
    expect(scoreboard().queryByText('Waiting')).toBeNull();
    expect(screen.queryByText('Host · here')).toBeNull();
    expect(point('H8')).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('has the host wait alone for a second player', async () => {
    await renderSeated(
      gomokuState({
        playerList: { p1: { username: 'Ryan', points: 0, isConnected: true } },
      }),
    );
    expect(
      screen.getByRole('heading', { name: 'Waiting for a second player.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
  });

  it('says whose turn it is, what was played and the clock', async () => {
    await renderSeated(myTurn);
    expect(screen.getByText('Game 2')).toBeInTheDocument();
    expect(turn().getByText('Your turn')).toBeInTheDocument();
    expect(turn().getByText('Place a black stone')).toBeInTheDocument();
    expect(turn().getByText('Maya played E8')).toBeInTheDocument();
    expect(turn().getByRole('timer')).toHaveTextContent(/^0:24to move$/);
    expect(point('E8')).toHaveAccessibleName('E8, white stone, last placed');
    expect(scoreboard().getByText('Black · your turn')).toBeInTheDocument();
    expect(scoreboard().getByText('White')).toBeInTheDocument();
  });

  it('on a phone, gives each seat one line, its stone showing the colour', async () => {
    onPhone();
    await renderSeated(myTurn);
    // The turn bar's label, and Ryan's seat.
    expect(screen.getAllByText('Your turn')).toHaveLength(2);
    expect(screen.queryByText(/^(Black|White) · /)).toBeNull();
    // The stone is drawn; a screen reader hears the colour.
    expect(screen.getByText('Black')).toBeInTheDocument();
    expect(screen.getByText('White')).toBeInTheDocument();
  });

  it('places a stone with a click, holding it faint until the server answers', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(myTurn);

    await user.click(point('F8'));
    expect(fake.sentArgs('gomoku:place')).toEqual([['r1', F8]]);
    // Sent and not yet answered: the board takes nothing more.
    expect(point('H8')).toHaveAttribute('aria-disabled', 'true');
    await user.click(point('H8'));
    expect(fake.sentArgs('gomoku:place')).toHaveLength(1);

    update(played(myTurn, { color: 'black', point: F8 }));
    expect(point('F8')).toHaveAccessibleName('F8, black stone, last placed');
    expect(turn().getByText('Maya’s turn')).toBeInTheDocument();
    expect(turn().getByText('Maya is thinking')).toBeInTheDocument();
    expect(turn().getByText('You played F8')).toBeInTheDocument();
  });

  it('moves with the arrow keys from the last stone, places with Enter, and keeps the focus', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(myTurn);

    await user.tab();
    while (!board().contains(document.activeElement)) await user.tab();
    expect(point('E8')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(point('F8')).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowDown}');
    expect(point('F8')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(fake.sentArgs('gomoku:place')).toEqual([['r1', F8]]);

    update(played(myTurn, { color: 'black', point: F8 }));
    expect(point('F8')).toHaveFocus();
    update(
      played(
        myTurn,
        { color: 'black', point: F8 },
        { color: 'white', point: pointAt(6, 8) },
      ),
    );
    expect(point('F8')).toHaveFocus();
    await user.keyboard('{ArrowUp}{Enter}');
    expect(fake.sentArgs('gomoku:place')).toEqual([
      ['r1', F8],
      ['r1', pointAt(5, 9)],
    ]);
  });

  it('takes nothing on the other player’s turn', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated({ ...myTurn, turnPlayerId: 'p2' });
    await user.click(point('F8'));
    expect(fake.sentArgs('gomoku:place')).toEqual([]);
  });

  it('takes nothing on a stone', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(myTurn);
    await user.click(point('E8'));
    expect(point('E8')).toHaveAttribute('aria-disabled', 'true');
    expect(fake.sentArgs('gomoku:place')).toEqual([]);
  });

  it('warns after a missed turn', async () => {
    await renderSeated(
      played(
        { ...myTurn, missedTurns: { [ME]: 1, p2: 0 } },
        { color: 'black', point: null },
      ),
    );
    // It leads the bar, with what happens now under it.
    const passed = turn().getByText('Your turn passed');
    expect(passed.className).toMatch(/main/);
    expect(turn().getByText('Maya is thinking')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You ran out of time, so your turn passed. Run out again on your next turn and you lose this game.',
      ),
    ).toBeInTheDocument();
    expect(scoreboard().getByText('Black · missed a turn')).toBeInTheDocument();
  });

  it('asks before resigning, with Keep playing first in focus', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(myTurn);

    await user.click(screen.getByRole('button', { name: 'Resign' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Resign this game?')).toBeInTheDocument();
    expect(
      dialog.getByText(
        'Maya wins game 2 and takes the point. You keep your seat for the next game.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        dialog.getByRole('button', { name: 'Keep playing' }),
      ).toHaveFocus(),
    );
    await user.click(dialog.getByRole('button', { name: 'Keep playing' }));
    expect(fake.sentArgs('gomoku:resign')).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Resign' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Resign',
      }),
    );
    expect(fake.sentArgs('gomoku:resign')).toEqual([['r1']]);
  });

  it('starts the next game clean of a stone sent and a Resign opened in the last', async () => {
    const user = userEvent.setup();
    const { update } = await renderSeated(myTurn);
    await user.click(point('F8'));
    await user.click(screen.getByRole('button', { name: 'Resign' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Maya resigns first, and the next game reaches the same move.
    update({
      ...myTurn,
      isGameStarted: false,
      phase: 'waiting',
      turnPlayerId: null,
      lastGame: {
        endedEarly: true,
        ending: 'resigned',
        winner: 'black',
        stones: 2,
        standings: [
          { playerId: ME, username: 'Ryan', points: 1 },
          { playerId: 'p2', username: 'Maya', points: 1 },
        ],
      },
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    update(myTurn);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(point('F8')).toHaveAccessibleName('F8, empty');
    expect(point('F8')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the result over the finished board, with the next game to start', async () => {
    const line = [0, 1, 2, 3, 4].map((step) => pointAt(2 + step, 11 - step));
    await renderSeated(
      gomokuState({
        colors,
        gameNumber: 2,
        samePair: true,
        moves: Array.from({ length: 21 }, (_, index) => ({
          color: index % 2 === 0 ? ('black' as const) : ('white' as const),
          point: index % 2 === 0 ? (line[index / 2] ?? index) : 200 + index,
        })),
        winLines: [line],
        playerList: {
          p1: { username: 'Ryan', points: 1, isConnected: true },
          p2: { username: 'Maya', points: 1, isConnected: true },
        },
        lastGame: {
          endedEarly: false,
          ending: 'five',
          winner: 'black',
          stones: 21,
          standings: [
            { playerId: ME, username: 'Ryan', points: 1 },
            { playerId: 'p2', username: 'Maya', points: 1 },
          ],
        },
      }),
    );
    expect(screen.getByText('Game over')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'You win with five in a row.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A game of 21 moves. Next game, Maya plays Black.'),
    ).toBeInTheDocument();
    const standings = within(screen.getByRole('list', { name: 'Standings' }));
    expect(standings.getByText('Five in a row, C11 to G7')).toBeInTheDocument();
    expect(standings.getByText('White')).toBeInTheDocument();
    expect(screen.getByText('Black · five in a row')).toBeInTheDocument();
    expect(point('C11')).toHaveAccessibleName(
      'C11, black stone, in the winning line',
    );
    expect(scoreboard().getByText('Won game 2')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play again' }),
    ).toBeInTheDocument();
  });

  it('on a phone, says the next game’s colour and what it waits on in the turn bar, with only buttons under the board', async () => {
    onPhone();
    const results = gomokuState({
      owner: { username: 'Maya', playerId: 'p2' },
      colors,
      gameNumber: 2,
      samePair: true,
      moves: [{ color: 'white', point: E8 }],
      playerList: {
        p1: { username: 'Ryan', points: 1, isConnected: true },
        p2: { username: 'Maya', points: 0, isConnected: true },
      },
      lastGame: {
        endedEarly: false,
        ending: 'resigned',
        winner: 'black',
        stones: 1,
        standings: [
          { playerId: ME, username: 'Ryan', points: 1 },
          { playerId: 'p2', username: 'Maya', points: 0 },
        ],
      },
    });
    const { update } = await renderSeated(results);

    // The same pair swaps colours: Ryan played Black, so White is next.
    expect(turn().getByText('You play White next. Ready?')).toBeInTheDocument();
    expect(screen.queryByText(/^The next game starts once/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Ready' })).toBeInTheDocument();
    // Each seat one line that never wraps: the score alone, as the turn bar
    // and the lime seat say who won.
    expect(screen.getByText('1 win')).toBeInTheDocument();
    expect(screen.getByText('0 wins')).toBeInTheDocument();
    expect(screen.queryByText(/^Won\b/)).toBeNull();

    update({ ...results, ready: [ME] });
    expect(
      turn().getByText('Waiting for Maya · you play White'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^You’re ready\./)).toBeNull();

    // A new pair's colours are drawn when the game starts.
    update({ ...results, samePair: false });
    expect(turn().getByText('Ready for the next game?')).toBeInTheDocument();
  });

  it('frees the seat of a player who left, and counts only the stones placed', async () => {
    await renderSeated(
      gomokuState({
        colors,
        gameNumber: 2,
        moves: [
          { color: 'black', point: E9 },
          { color: 'white', point: null },
          { color: 'black', point: E10 },
          { color: 'white', point: E8 },
        ],
        playerList: { p1: { username: 'Ryan', points: 1, isConnected: true } },
        lastGame: {
          endedEarly: true,
          ending: 'left',
          winner: 'black',
          stones: 3,
          standings: [{ playerId: ME, username: 'Ryan', points: 1 }],
        },
      }),
    );
    expect(
      screen.getByRole('heading', { name: 'You win: Maya left the room.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A game of 3 moves. Maya’s seat is free for anybody to take.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Free seat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Start game/ })).toBeNull();
  });

  it('waits for a new game, not the old result, once a new opponent sits', async () => {
    await renderSeated(
      gomokuState({
        colors,
        gameNumber: 2,
        moves: [
          { color: 'black', point: E9 },
          { color: 'white', point: E8 },
        ],
        playerList: {
          p1: { username: 'Ryan', points: 2, isConnected: true },
          p3: { username: 'Jo', points: 0, isConnected: true },
        },
        lastGame: {
          endedEarly: true,
          ending: 'left',
          winner: 'black',
          stones: 1,
          standings: [{ playerId: ME, username: 'Ryan', points: 2 }],
        },
      }),
    );
    expect(screen.getByText('Waiting room')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^You win/ })).toBeNull();
    expect(scoreboard().queryByText('Won game 2')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Start game' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Black moves first\./)).toBeInTheDocument();
  });

  it('shows a spectator the game with nothing to place and no Resign', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated({
      ...myTurn,
      turnPlayerId: 'p3',
      colors: {
        black: { playerId: 'p3', username: 'Leo' },
        white: { playerId: 'p2', username: 'Maya' },
      },
      playerList: {
        p2: { username: 'Maya', points: 1, isConnected: true },
        p3: { username: 'Leo', points: 0, isConnected: true },
      },
      spectators: { [ME]: { username: 'Ryan', isConnected: true } },
    });
    expect(turn().getByText('Leo’s turn')).toBeInTheDocument();
    expect(scoreboard().getByText('Black · thinking')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resign' })).toBeNull();
    await user.click(point('F8'));
    expect(fake.sentArgs('gomoku:place')).toEqual([]);
  });

  it('on a phone, puts a faint stone down first and places it on a second tap or Place stone', async () => {
    onPhone();
    const user = userEvent.setup();
    const { fake } = await renderSeated(myTurn);

    const tap = (name: string) =>
      user.pointer({ keys: '[TouchA]', target: point(name) });

    // Place stone is always there, live only once a faint stone is down,
    // and the turn bar says the second tap places it.
    expect(placeStone()).toBeDisabled();
    expect(turn().queryByText('Tap again to place')).toBeNull();
    await tap('F8');
    expect(fake.sentArgs('gomoku:place')).toEqual([]);
    expect(placeStone()).toBeEnabled();
    expect(turn().getByText('Tap again to place')).toBeInTheDocument();
    await tap('F8');
    expect(fake.sentArgs('gomoku:place')).toEqual([['r1', F8]]);
  });

  it('on a touch screen wider than a phone, puts a faint stone down first too', async () => {
    onTouch();
    const user = userEvent.setup();
    const { fake } = await renderSeated(myTurn);
    const tap = (name: string) =>
      user.pointer({ keys: '[TouchA]', target: point(name) });

    expect(placeStone()).toBeDisabled();
    await tap('F8');
    expect(fake.sentArgs('gomoku:place')).toEqual([]);
    expect(placeStone()).toBeEnabled();
    await user.click(placeStone());
    expect(fake.sentArgs('gomoku:place')).toEqual([['r1', F8]]);
  });

  it('on a phone, moves the faint stone with another tap, and places it with Place stone', async () => {
    onPhone();
    const user = userEvent.setup();
    const { fake } = await renderSeated(myTurn);
    const tap = (name: string) =>
      user.pointer({ keys: '[TouchA]', target: point(name) });

    await tap('F8');
    await tap('H8');
    expect(fake.sentArgs('gomoku:place')).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Place stone' }));
    expect(fake.sentArgs('gomoku:place')).toEqual([['r1', pointAt(7, 8)]]);
    expect(screen.getByRole('button', { name: 'Place stone' })).toBeDisabled();
  });
});
