import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PLANE } from '../../../shared/snap';
import { ME, snapState } from '../tests/fixtures';
import { renderSeated } from '../tests/seated';

/**
 * Two cards of the plane as dealt, before any shuffle: they share the note
 * (25); the circle (0) is only on yours, the ring (1) only on the middle.
 */
const MINE = [...PLANE[0]!];
const MIDDLE = [...PLANE[1]!];

const finding = snapState({
  isGameStarted: true,
  phase: 'finding',
  cards: 29,
  taken: 11,
  middle: { number: 11, symbols: MIDDLE },
  myCard: MINE,
  cardMs: 4_000,
  playerList: {
    p1: { username: 'Ryan', points: 4, isConnected: true },
    p2: { username: 'Maya', points: 7, isConnected: true },
  },
});

const card = (name: string) =>
  within(screen.getByRole('group', { name: new RegExp(`^${name}`) }));
const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const scoreboard = () =>
  within(screen.getByRole('region', { name: /^Players/ }));

describe('a Snap room', () => {
  it('lets the host start once two players are in', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(snapState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(
      screen.getByText(/2 players, 29 cards to win\./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('claims the symbol tapped, on either card, for the middle card in play', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(finding);

    expect(screen.getByText('11 of 29 cards')).toBeInTheDocument();
    expect(turn().getByText('Spot the match')).toBeInTheDocument();
    expect(turn().getByRole('timer')).toHaveTextContent(/^00:04on this card$/);
    expect(screen.getByText('18 left')).toBeInTheDocument();
    expect(screen.getByText('4 won')).toBeInTheDocument();

    await user.click(card('Your card').getByRole('button', { name: 'Note' }));
    await user.click(card('Middle card').getByRole('button', { name: 'Ring' }));
    expect(fake.sentArgs('snap:claim')).toEqual([
      ['r1', 11, 25],
      ['r1', 11, 1],
    ]);
  });

  it('marks the card somebody took with who took it and the match', async () => {
    await renderSeated({
      ...finding,
      phase: 'taken',
      phaseEndsInMs: 1_500,
      taken: 12,
      cardMs: 0,
      lastTake: { playerId: 'p2', username: 'Maya', number: 11, symbol: 25 },
    });
    expect(turn().getByText('Maya took it')).toBeInTheDocument();
    expect(turn().getByText('The note was on both cards')).toBeInTheDocument();
    expect(turn().getByText('next card')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Middle card, taken by Maya' }),
    ).toBeInTheDocument();
    expect(
      card('Middle card').getByRole('img', { name: 'Note, on both cards' }),
    ).toBeInTheDocument();
    // Your card stays as it was, and nothing can be tapped.
    expect(card('Your card').getByRole('img', { name: 'Note' })).toBeVisible();
    expect(screen.queryAllByRole('button', { name: 'Note' })).toEqual([]);
    expect(scoreboard().getByText('Took the card')).toBeInTheDocument();
  });

  it('tells the taker the card is theirs, marked on both cards', async () => {
    await renderSeated({
      ...finding,
      phase: 'taken',
      phaseEndsInMs: 1_500,
      taken: 12,
      lastTake: { playerId: ME, username: 'Ryan', number: 11, symbol: 25 },
    });
    expect(turn().getByText('You took it!')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Middle card, taken by You' }),
    ).toBeInTheDocument();
    expect(
      card('Your card').getByRole('img', { name: 'Note, on both cards' }),
    ).toBeInTheDocument();
  });

  it('locks you out after a symbol on only one card, and says which', async () => {
    await renderSeated({
      ...finding,
      lockedOutMs: 2_000,
      myMiss: { symbol: 0, on: 'mine' },
    });
    expect(turn().getByText('Not a match')).toBeInTheDocument();
    expect(
      turn().getByText('The circle is only on your card'),
    ).toBeInTheDocument();
    expect(turn().getByText('locked out')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Your card, locked out' }),
    ).toBeInTheDocument();
    expect(
      card('Your card').getByRole('img', { name: 'Circle, not a match' }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Note' })).toEqual([]);
  });

  it('shows a spectator the middle card alone, with nothing to tap', async () => {
    await renderSeated({
      ...finding,
      myCard: null,
      playerList: {
        p2: { username: 'Maya', points: 7, isConnected: true },
        p3: { username: 'Sam', points: 3, isConnected: true },
      },
      spectators: { [ME]: { username: 'Ryan', isConnected: true } },
    });
    expect(turn().getByText('You’re watching')).toBeInTheDocument();
    expect(turn().getByText('Everyone is looking')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Your card/ })).toBeNull();
    expect(card('Middle card').getAllByRole('img')).toHaveLength(6);
  });

  it('ranks the cards taken, and keeps the last card up with its taker', async () => {
    await renderSeated(
      snapState({
        cards: 29,
        taken: 29,
        middle: { number: 28, symbols: MIDDLE },
        myCard: MINE,
        lastTake: { playerId: 'p2', username: 'Maya', number: 28, symbol: 25 },
        playerList: {
          p1: { username: 'Ryan', points: 12, isConnected: true },
          p2: { username: 'Maya', points: 17, isConnected: true },
        },
        lastGame: {
          endedEarly: false,
          cards: 29,
          taken: 29,
          standings: [
            { playerId: 'p2', username: 'Maya', points: 17 },
            { playerId: ME, username: 'Ryan', points: 12 },
          ],
        },
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Maya wins with 17 cards.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('29 cards. You finished 2nd.')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Last card, taken by Maya' }),
    ).toBeInTheDocument();
    expect(screen.getByText('12 won')).toBeInTheDocument();
  });
});
