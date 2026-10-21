import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { cardName } from '../../../shared/trios';
import { ME, triosState } from '../tests/fixtures';
import { renderSeated } from '../tests/seated';

/**
 * A table with three trios: places 1, 8 and 11; 3, 5 and 8; 3, 7 and 9.
 * Places 2, 4 and 7 are not one: two are circles and one is a triangle.
 */
const TABLE = [16, 63, 1, 57, 37, 34, 42, 55, 2, 62, 8, 46];

const finding = triosState({
  isGameStarted: true,
  phase: 'finding',
  phaseEndsInMs: 18_000,
  found: 4,
  table: TABLE,
  deckLeft: 57,
  playerList: {
    p1: { username: 'Ryan', points: 1, isConnected: true },
    p2: { username: 'Maya', points: 3, isConnected: true },
  },
});

const card = (place: number, rest = '') =>
  screen.getByRole('button', { name: `${cardName(TABLE[place]!)}${rest}` });
const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const scoreboard = () =>
  within(screen.getByRole('region', { name: /^Players/ }));

describe('a Trios room', () => {
  it('lets the host start once two players are in', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(triosState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(screen.getByText(/2 players, 10 trios\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('keeps picks to yourself until the third, which claims them', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(finding);

    expect(screen.getByText('4 of 10 trios')).toBeInTheDocument();
    expect(turn().getByText('Pick three cards')).toBeInTheDocument();
    expect(turn().getByText('to a hint')).toBeInTheDocument();

    await user.click(card(3));
    await user.click(card(5));
    expect(card(3, ', picked')).toHaveAttribute('aria-pressed', 'true');
    expect(turn().getByText('Pick a third card')).toBeInTheDocument();
    // Picking one again puts it back.
    await user.click(card(5, ', picked'));
    expect(turn().getByText('Pick two more')).toBeInTheDocument();
    await user.click(card(5));
    expect(fake.sentArgs('trios:claim')).toEqual([]);

    await user.click(card(8));
    expect(fake.sentArgs('trios:claim')).toEqual([['r1', [57, 34, 2]]]);
    expect(screen.queryAllByRole('button', { pressed: true })).toEqual([]);
  });

  it('marks a trio somebody took with who took it, and keeps your other picks', async () => {
    const user = userEvent.setup();
    const { update } = await renderSeated(finding);
    await user.click(card(3));
    await user.click(card(8));

    update({
      ...finding,
      phase: 'taken',
      phaseEndsInMs: 2_000,
      found: 5,
      lastTrio: {
        playerId: 'p2',
        username: 'Maya',
        cards: [63, 2, 46],
        places: [1, 8, 11],
      },
    });
    expect(turn().getByText('Maya found a trio')).toBeInTheDocument();
    expect(turn().getByText('new cards')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: `${cardName(2)}, found, by Maya` }),
    ).toBeInTheDocument();
    expect(scoreboard().getByText('Found a trio')).toBeInTheDocument();
    expect(screen.getByText('Last trio: Maya')).toBeInTheDocument();
    // Your other pick still shows while the trio is up, though nothing takes a pick.
    expect(
      screen.getByRole('img', { name: `${cardName(TABLE[3]!)}, picked` }),
    ).toBeInTheDocument();

    // New cards: the taken one leaves your picks, the other stays.
    update({
      ...finding,
      found: 5,
      table: TABLE.map((value, place) =>
        [1, 8, 11].includes(place)
          ? [28, 45, 36][[1, 8, 11].indexOf(place)]!
          : value,
      ),
      lastTrio: {
        playerId: 'p2',
        username: 'Maya',
        cards: [63, 2, 46],
        places: [1, 8, 11],
      },
    });
    expect(card(3, ', picked')).toBeInTheDocument();
    expect(turn().getByText('Pick two more')).toBeInTheDocument();
  });

  it('tells the finder the trio is theirs', async () => {
    await renderSeated({
      ...finding,
      phase: 'taken',
      phaseEndsInMs: 2_000,
      found: 5,
      lastTrio: {
        playerId: ME,
        username: 'Ryan',
        cards: [63, 2, 46],
        places: [1, 8, 11],
      },
    });
    expect(turn().getByText('You found a trio!')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: `${cardName(2)}, found, by you` }),
    ).toBeInTheDocument();
  });

  it('locks you out after three that are not a trio, and says why', async () => {
    await renderSeated({
      ...finding,
      lockedOutMs: 3_000,
      myMiss: [1, 37, 55],
    });
    expect(turn().getByText('Not a trio')).toBeInTheDocument();
    expect(
      turn().getByText('Two are circles and one is a triangle.'),
    ).toBeInTheDocument();
    expect(turn().getByText('locked out')).toBeInTheDocument();
    expect(
      screen.queryAllByRole('button', { name: /^(One|Two|Three) / }),
    ).toEqual([]);
    expect(
      screen.getByRole('img', { name: `${cardName(1)}, not a trio` }),
    ).toBeInTheDocument();
  });

  it('shows the hints everybody gets', async () => {
    await renderSeated({ ...finding, hint: [9], phaseEndsInMs: 24_000 });
    expect(turn().getByText('Hint')).toBeInTheDocument();
    expect(
      turn().getByText('One card of a trio is marked'),
    ).toBeInTheDocument();
    expect(
      turn().getByText('Find the two that go with it'),
    ).toBeInTheDocument();
    expect(turn().getByText('to a second hint')).toBeInTheDocument();
    expect(card(9, ', hint')).toBeInTheDocument();
  });

  it('counts the time without a trio once both hints are given', async () => {
    await renderSeated({
      ...finding,
      hint: [9, 3],
      phaseEndsInMs: 0,
      searchingMs: 75_000,
    });
    expect(
      turn().getByText('Two cards of a trio are marked'),
    ).toBeInTheDocument();
    expect(turn().getByText('Find the third card')).toBeInTheDocument();
    // The clock stays, so the turn bar keeps its height over the table.
    const clock = turn().getByRole('timer');
    expect(clock).toHaveTextContent(/^1:15without a trio$/);
  });

  it('ranks the trios found, and keeps the finished table up', async () => {
    await renderSeated(
      triosState({
        table: TABLE,
        lastTrio: {
          playerId: 'p2',
          username: 'Maya',
          cards: [63, 2, 46],
          places: [1, 8, 11],
        },
        playerList: {
          p1: { username: 'Ryan', points: 3, isConnected: true },
          p2: { username: 'Maya', points: 7, isConnected: true },
        },
        lastGame: {
          endedEarly: false,
          trios: 10,
          found: 10,
          standings: [
            { playerId: 'p2', username: 'Maya', points: 7 },
            { playerId: ME, username: 'Ryan', points: 3 },
          ],
        },
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Maya wins with 7 trios.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('10 trios. You finished 2nd.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Table' })).getAllByRole('img'),
    ).toHaveLength(12);
  });
});
