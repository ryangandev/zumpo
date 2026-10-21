import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PairsRoomState, Result } from '../../../shared/wire-types';
import { ME, pairsState } from '../tests/fixtures';
import { renderSeated } from '../tests/seated';
import type { FakeSocket } from '../tests/fake-socket';

/** A Pairs game Maya won against Ryan (the viewer) and Leo. */
const finished = (overrides: Partial<PairsRoomState> = {}) =>
  pairsState({
    playerList: {
      p1: { username: 'Ryan', points: 2, isConnected: true },
      p2: { username: 'Maya', points: 4, isConnected: true },
      p3: { username: 'Leo', points: 2, isConnected: true },
    },
    lastGame: {
      endedEarly: false,
      board: 'Small',
      pairs: 8,
      standings: [
        { playerId: 'p2', username: 'Maya', points: 4 },
        { playerId: ME, username: 'Ryan', points: 2 },
        { playerId: 'p3', username: 'Leo', points: 2 },
      ],
    },
    ...overrides,
  });

/** The arguments of each `event` request the app made. */
const asked = (fake: FakeSocket, event: string) =>
  fake.requests.filter((r) => r.event === event).map((r) => r.args);

const asGuest = { owner: { username: 'Maya', playerId: 'p2' } };

describe('what comes after a game', () => {
  it('lets the host choose the next game’s setting, and see who is ready', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(finished());
    fake.answer('room:settings', (): Result => ({ ok: true }));

    await user.click(screen.getByRole('combobox', { name: 'Next game' }));
    await user.click(await screen.findByRole('option', { name: /^Large/ }));
    await waitFor(() =>
      expect(asked(fake, 'room:settings')).toEqual([
        ['r1', { board: 'Large' }],
      ]),
    );

    update(finished({ ready: ['p2', 'p3'] }));
    expect(screen.getByText('Maya and Leo are ready.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play again' }),
    ).toBeInTheDocument();
  });

  it('lets a guest say Ready, and take it back', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(finished(asGuest));
    fake.answer('room:ready', (): Result => ({ ok: true }));

    // A guest reads the next game's setting, and cannot start it.
    expect(screen.getByText(/^Next game: Small/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull();
    expect(
      screen.getByText(
        'The next game starts once everyone is ready, or when Maya starts it.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ready' }));
    expect(asked(fake, 'room:ready')).toEqual([['r1', true]]);

    update(finished({ ...asGuest, ready: [ME] }));
    expect(
      screen.getByText('You’re ready. Waiting for Leo, or for Maya to start.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not ready' }));
    expect(asked(fake, 'room:ready')).toEqual([
      ['r1', true],
      ['r1', false],
    ]);
  });

  it('hands the start to the next player while the host is away', async () => {
    await renderSeated(
      finished({
        ...asGuest,
        // The stand-in said Ready before the host left: that goes unsaid.
        ready: [ME],
        playerList: {
          p2: { username: 'Maya', points: 4, isConnected: false },
          p1: { username: 'Ryan', points: 2, isConnected: true },
          p3: { username: 'Leo', points: 2, isConnected: true },
        },
      }),
    );
    expect(
      screen.getByText(
        'Maya isn’t at the table, so you can start the next game.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is ready/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Play again' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Next game' }),
    ).toBeInTheDocument();
  });
});
