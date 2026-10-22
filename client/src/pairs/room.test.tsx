import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PairsCardView } from '../../../shared/wire-types';
import { ME, pairsState } from '../tests/fixtures';
import { onPhone } from '../tests/phone';
import { renderSeated } from '../tests/seated';

/** What the page has said politely about a turn. */
const said = () =>
  screen
    .getAllByRole('status')
    .filter((status) => status.textContent?.includes('your turn'));

const down: PairsCardView = { state: 'down', symbol: null };

/** A Small board, face down but for the cards given. */
const board = (shown: Record<number, PairsCardView> = {}) =>
  Array.from({ length: 16 }, (_, index) => shown[index] ?? down);

const myTurn = pairsState({
  isGameStarted: true,
  phase: 'flipping',
  phaseEndsInMs: 7_000,
  cards: board({
    5: { state: 'matched', symbol: 0 },
    6: { state: 'matched', symbol: 0 },
  }),
  pairsFound: 1,
  turnPlayerId: ME,
  nextPlayerId: 'p2',
});

const theirMiss = pairsState({
  ...myTurn,
  phase: 'showing',
  phaseEndsInMs: 2_000,
  cards: board({
    0: { state: 'up', symbol: 3 },
    1: { state: 'up', symbol: 7 },
    5: { state: 'matched', symbol: 0 },
    6: { state: 'matched', symbol: 0 },
  }),
  turnPlayerId: 'p2',
  nextPlayerId: ME,
  lastMiss: [0, 1],
});

/** What the turn bar says. */
const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const scoreboard = () =>
  within(screen.getByRole('region', { name: /^Players/ }));

describe('a Pairs room', () => {
  it('lets the host start once two players are in', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(pairsState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(screen.getByText(/2 players, Small 4 × 4\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('turns a card over on your turn', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(myTurn);

    expect(screen.getByText('1 of 8 pairs')).toBeInTheDocument();
    expect(turn().getByText('Your turn')).toBeInTheDocument();
    expect(turn().getByText('Flip a card')).toBeInTheDocument();
    expect(
      turn().getByText('Find a pair and you go again'),
    ).toBeInTheDocument();
    expect(scoreboard().getByText('Flipping')).toBeInTheDocument();
    expect(scoreboard().getByText('Up next')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Row 1, column 3: face down' }),
    );
    expect(fake.sentArgs('pairs:flip')).toEqual([['r1', 2]]);
  });

  it('asks for a second card once one is up', async () => {
    await renderSeated({
      ...myTurn,
      cards: board({ 0: { state: 'up', symbol: 3 } }),
    });
    expect(turn().getByText('Flip a second card')).toBeInTheDocument();
  });

  it('shows somebody else’s miss, with nothing to turn over', async () => {
    await renderSeated(theirMiss);

    expect(turn().getByText('Maya’s turn')).toBeInTheDocument();
    expect(turn().getByText('Not a pair')).toBeInTheDocument();
    expect(
      turn().getByText('Both flip back. You’re next.'),
    ).toBeInTheDocument();
    expect(turn().getByText('flip back')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /face down$/ })).toEqual([]);
  });

  it('says who is next while somebody else flips', async () => {
    await renderSeated({
      ...theirMiss,
      phase: 'flipping',
      cards: myTurn.cards,
      lastMiss: [],
    });
    expect(turn().getByText('Watch closely')).toBeInTheDocument();
    expect(turn().getByText('You’re next.')).toBeInTheDocument();
  });

  it('tells everybody whose turn ran out of time', async () => {
    // Maya ran out of time, so the turn came to the viewer.
    const { update } = await renderSeated({ ...myTurn, timedOut: 'p2' });
    expect(turn().getByText('Flip a card')).toBeInTheDocument();
    expect(
      turn().getByText('Maya ran out of time · your turn'),
    ).toBeInTheDocument();

    // The viewer ran out of time, so the turn went to Maya.
    update({
      ...myTurn,
      turnPlayerId: 'p2',
      nextPlayerId: ME,
      timedOut: ME,
    });
    expect(turn().getByText('Time’s up, your turn passed')).toBeInTheDocument();
    expect(turn().getByText('You’re next.')).toBeInTheDocument();
  });

  it('ranks the pairs found, and keeps the finished board up', async () => {
    await renderSeated(
      pairsState({
        cards: board(),
        playerList: {
          p1: { username: 'Ryan', points: 2, isConnected: true },
          p2: { username: 'Maya', points: 6, isConnected: true },
        },
        lastGame: {
          endedEarly: false,
          board: 'Small',
          pairs: 8,
          standings: [
            { playerId: 'p2', username: 'Maya', points: 6 },
            { playerId: ME, username: 'Ryan', points: 2 },
          ],
        },
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Maya wins with 6 pairs.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Small board, 8 pairs. You finished 2nd.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(16);
  });

  it('marks the Game tab when your turn comes while Chat is open', async () => {
    onPhone();
    const user = userEvent.setup();
    const { fake } = await renderSeated(theirMiss);
    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(screen.getByRole('tab', { name: 'Game' })).toBeInTheDocument();

    expect(said()).toHaveLength(0);

    act(() => fake.serverEmits('room:state', myTurn));
    expect(
      screen.getByRole('tab', { name: 'Game, your turn' }),
    ).toBeInTheDocument();
    // Said once, politely, as the mark appears.
    expect(said().map((status) => status.textContent)).toEqual([
      'Game, your turn',
    ]);

    await user.click(screen.getByRole('tab', { name: 'Game, your turn' }));
    expect(screen.getByRole('tab', { name: 'Game' })).toBeInTheDocument();
    expect(said()).toHaveLength(0);
    expect(turn().getByText('Your turn')).toBeInTheDocument();
  });

  it('keeps the turn bar short on a phone', async () => {
    onPhone();
    await renderSeated(myTurn);
    expect(turn().getByText('A pair keeps your turn')).toBeInTheDocument();
  });
});
