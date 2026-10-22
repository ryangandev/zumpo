import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type {
  LiarsDiceCup,
  LiarsDiceRoomState,
} from '../../../shared/wire-types';
import { liarsDiceState, ME } from '../tests/fixtures';
import { renderSeated } from '../tests/seated';
import { renderApp } from '../tests/render-app';

const players = {
  p1: { username: 'Ryan', points: 2, isConnected: true },
  p2: { username: 'Maya', points: 3, isConnected: true },
  p3: { username: 'Leo', points: 3, isConnected: true },
};

const cup = (
  playerId: string,
  diceLeft: number,
  dice: number[] | null = null,
): LiarsDiceCup => ({ playerId, diceLeft, dice, outInRound: null });

/** Round 3, eight dice on the table: Ryan holds a 5 and a wild 1, facing Leo's five 5s. */
const myTurn = liarsDiceState({
  playerList: players,
  isGameStarted: true,
  phase: 'bidding',
  phaseEndsInMs: 12_000,
  round: 3,
  cups: [cup('p2', 3), cup(ME, 2, [5, 1]), cup('p3', 3)],
  bids: [
    { playerId: 'p2', count: 3, face: 6 },
    { playerId: ME, count: 4, face: 5 },
    { playerId: 'p3', count: 5, face: 5 },
  ],
  turnPlayerId: ME,
  nextPlayerId: 'p3',
});

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const scoreboard = () =>
  within(screen.getByRole('region', { name: /^Players/ }));
const cupOf = (name: string) => within(screen.getByRole('region', { name }));

describe('a Liar’s Dice room', () => {
  it('shows a Chinese bidding turn and sends the same legal raise', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/liars-dice/rooms/r1', {
      locale: 'zh',
    });
    act(() => fake.serverEmits('room:state', myTurn));
    const bar = within(screen.getByRole('region', { name: '当前回合' }));
    expect(screen.getByText('第 3 轮')).toBeInTheDocument();
    expect(bar.getByText('轮到你了')).toBeInTheDocument();
    expect(
      bar.getByText('要大过 5 个 5：多叫几个，或叫更大的点数'),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '你的叫点' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '3 点' }));
    await user.click(screen.getByRole('button', { name: '叫 6 个 3' }));
    expect(fake.sentArgs('ld:bid')).toEqual([['r1', 6, 3]]);
    expect(screen.queryByRole('button', { name: 'Call Liar' })).toBeNull();
  });

  it('lets the host start once two players are in', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(liarsDiceState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(screen.getByText(/2 players, 3 dice each\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('shows your own dice and nobody else’s', async () => {
    await renderSeated(myTurn);

    expect(cupOf('Ryan (you)').getByRole('img', { name: '5' })).toBeVisible();
    expect(
      cupOf('Ryan (you)').getByRole('img', { name: '1, wild' }),
    ).toBeVisible();
    expect(
      cupOf('Maya').getAllByRole('img', { name: 'Hidden die' }),
    ).toHaveLength(3);
    expect(cupOf('Leo').queryByRole('img', { name: '5' })).toBeNull();
  });

  it('opens on your strongest face, and says what beats the bid', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(myTurn);

    expect(screen.getByText('Round 3')).toBeInTheDocument();
    expect(turn().getByText('Your turn')).toBeInTheDocument();
    expect(turn().getByText('Raise, or call Liar')).toBeInTheDocument();
    expect(
      turn().getByText('Beat five 5s: more dice, or a higher face'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fewer' })).toBeDisabled();
    expect(
      // A 5 and a wild 1: two 5s, the most of any face.
      screen.getByRole('button', { name: 'Bid six 5s' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '3s' }));
    expect(
      screen.getByRole('button', { name: 'Bid six 3s' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('button', { name: 'Bid seven 3s' }));
    expect(fake.sentArgs('ld:bid')).toEqual([['r1', 7, 3]]);
  });

  it('calls Liar on the bid in front of you', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(myTurn);
    await user.click(screen.getByRole('button', { name: 'Call Liar' }));
    expect(fake.sentArgs('ld:call')).toEqual([['r1']]);
  });

  it('opens the bidding with nothing to call', async () => {
    await renderSeated({ ...myTurn, bids: [] });
    expect(turn().getByText('Open the bidding')).toBeInTheDocument();
    expect(turn().getByText('8 dice on the table')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Bid one 5' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Call Liar' })).toBeNull();
  });

  it('shows whose turn it is, with nothing to pick', async () => {
    await renderSeated({ ...myTurn, turnPlayerId: 'p2', nextPlayerId: 'p3' });
    expect(turn().getByText('Maya’s turn')).toBeInTheDocument();
    expect(turn().getByText('Maya is deciding')).toBeInTheDocument();
    expect(scoreboard().getByText('Bidding')).toBeInTheDocument();
    expect(scoreboard().getByText('Up next')).toBeInTheDocument();
    expect(scoreboard().getByText('Bid four 5s')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Your bid' })).toBeNull();
  });

  it('lists everybody in turn order from you, at the table and on the Players panel', async () => {
    // The order is Maya, Ryan, Leo: after Ryan comes Leo, then Maya.
    await renderSeated({ ...myTurn, turnPlayerId: 'p3', nextPlayerId: 'p2' });

    const leo = screen.getByRole('region', { name: 'Leo' });
    const maya = screen.getByRole('region', { name: 'Maya' });
    expect(
      leo.compareDocumentPosition(maya) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(leo).getByText('Deciding')).toBeVisible();
    expect(within(maya).getByText('Up next')).toBeVisible();
    const rows = scoreboard()
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(rows.map((row) => row?.match(/Ryan|Leo|Maya/)?.[0])).toEqual([
      'Ryan',
      'Leo',
      'Maya',
    ]);
    expect(scoreboard().getByText('Up next')).toBeInTheDocument();
  });

  it('opens every cup on a call, and counts at a glance', async () => {
    const reveal: LiarsDiceRoomState = {
      ...myTurn,
      playerList: { ...players, p1: { ...players.p1, points: 1 } },
      phase: 'reveal',
      phaseEndsInMs: 4_000,
      cups: [
        cup('p2', 3, [3, 5, 6]),
        cup(ME, 1, [5, 1]),
        cup('p3', 3, [5, 4, 1]),
      ],
      turnPlayerId: null,
      nextPlayerId: null,
      reveal: {
        bid: { playerId: 'p3', count: 5, face: 5 },
        callerId: ME,
        matched: 5,
        wild: 2,
        loserId: ME,
        out: false,
      },
    };
    await renderSeated(reveal);

    expect(turn().getByText('You called Liar')).toBeInTheDocument();
    expect(turn().getByText('Leo’s bid stands')).toBeInTheDocument();
    expect(turn().getByText('You lose a die')).toBeInTheDocument();
    expect(
      screen.getByText('incl. 2 wild ones · bid was five'),
    ).toBeInTheDocument();
    // The count and the verdict are two lines, not one.
    expect(
      screen.getByText('Leo’s bid stands, so you lose a die'),
    ).toBeInTheDocument();
    expect(cupOf('Leo').getByRole('img', { name: '1, wild' })).toBeVisible();
    expect(cupOf('Maya').getByRole('img', { name: '5, counts' })).toBeVisible();
    expect(cupOf('Ryan (you)').getByText('Lost a die')).toBeVisible();
    expect(scoreboard().getByText('Bid stands')).toBeInTheDocument();
  });

  it('keeps a player who is out watching', async () => {
    await renderSeated({
      ...myTurn,
      playerList: { ...players, p1: { ...players.p1, points: 0 } },
      cups: [cup('p2', 3), { ...cup(ME, 0, []), outInRound: 2 }, cup('p3', 3)],
      turnPlayerId: 'p2',
      nextPlayerId: 'p3',
    });
    expect(cupOf('Ryan (you)').getByText('Out in round 2')).toBeVisible();
    expect(
      screen.getByText(/You are out of dice\. Stay to watch who wins/),
    ).toBeInTheDocument();
    expect(scoreboard().getByText('Out')).toBeInTheDocument();
  });

  it('ranks by how long everybody lasted, and keeps the last call up', async () => {
    await renderSeated(
      liarsDiceState({
        playerList: {
          p1: { username: 'Ryan', points: 0, isConnected: true },
          p2: { username: 'Maya', points: 2, isConnected: true },
          p3: { username: 'Leo', points: 0, isConnected: true },
        },
        round: 10,
        cups: [
          { ...cup('p2', 2, [4, 6]) },
          { ...cup(ME, 0, [3]), outInRound: 10 },
          { ...cup('p3', 0, []), outInRound: 8 },
        ],
        reveal: {
          bid: { playerId: ME, count: 2, face: 6 },
          callerId: 'p2',
          matched: 1,
          wild: 0,
          loserId: ME,
          out: true,
        },
        lastGame: {
          endedEarly: false,
          dicePerPlayer: 3,
          rounds: 10,
          standings: [
            { playerId: 'p2', username: 'Maya', points: 2, outInRound: null },
            { playerId: ME, username: 'Ryan', points: 0, outInRound: 10 },
            { playerId: 'p3', username: 'Leo', points: 0, outInRound: 8 },
          ],
        },
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Maya wins with 2 dice.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('10 rounds, 3 dice each. You finished 2nd.'),
    ).toBeInTheDocument();
    const standings = within(screen.getByRole('list', { name: 'Standings' }));
    expect(standings.getByText('Out in round 10')).toBeInTheDocument();
    expect(standings.getByText('Out in round 8')).toBeInTheDocument();
    expect(screen.getByText('The last call')).toBeInTheDocument();
    expect(
      screen.getByText('Your bid was a lie, so you are out'),
    ).toBeInTheDocument();
    // The game is over: the last call scrolls with the page, not in a box
    // of the height a round in play would leave it.
    expect(document.querySelector('[data-play-board]')).toBeNull();
  });
});
