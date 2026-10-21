import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Make24HandResult } from '../../../shared/wire-types';
import { make24State, ME } from '../tests/fixtures';
import { onPhone } from '../tests/phone';
import { renderSeated } from '../tests/seated';
import { renderApp } from '../tests/render-app';
import { FakeSocket } from '../tests/fake-socket';
import { roomPath } from '../games/catalog';

const solving = make24State({
  isGameStarted: true,
  phase: 'solving',
  hand: 1,
  deal: [3, 4, 6, 9],
  phaseEndsInMs: 40_000,
});

const mine: Make24HandResult = {
  playerId: ME,
  username: 'Ryan',
  points: 117,
  secondsLeft: 40,
  solved: true,
  expression: '(3 + 9 − 6) × 4',
};

const theirs: Make24HandResult = {
  playerId: 'p2',
  username: 'Maya',
  points: 0,
  secondsLeft: 0,
  solved: false,
  expression: '',
};

const revealed = {
  ...solving,
  phase: 'reveal' as const,
  phaseEndsInMs: 4_000,
  lastHand: [mine, theirs],
  lastDeal: solving.deal,
  lastSolution: '(3 + 9 − 6) × 4',
};

/** What the turn bar says. */
const turn = () => within(screen.getByRole('region', { name: 'Turn' }));

/** Picks a card, a sign and a card. */
async function step(
  user: ReturnType<typeof userEvent.setup>,
  left: string,
  sign: string,
  right: string,
) {
  await user.click(screen.getByRole('button', { name: left }));
  await user.click(screen.getByRole('button', { name: sign }));
  await user.click(screen.getByRole('button', { name: right }));
}

describe('a Make 24 room', () => {
  it('plays with Chinese prompts and accessible operators', async () => {
    const user = userEvent.setup();
    const fake = new FakeSocket();
    fake.answer('room:sync', () => ({ ok: true as const }));
    await renderApp(roomPath('make-24', 'r1'), { locale: 'zh', fake });
    act(() => fake.serverEmits('room:state', solving));
    expect(screen.getAllByText('第 1 手，共 5 手')).toHaveLength(2);
    expect(screen.getByText('每个数字用一次')).toBeInTheDocument();
    await step(user, '3', '加', '9');
    expect(screen.getByText('你的步骤')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '12，来自 3 + 9' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.queryByText('你的步骤')).toBeNull();

    act(() =>
      fake.serverEmits('room:state', {
        ...solving,
        solved: [mine],
        mySolve: mine,
      }),
    );
    expect(screen.getByText('算出来了！+117')).toBeInTheDocument();
    expect(screen.getByText('等待 Maya')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('算出来了！本手结束后才能聊天。'),
    ).toBeDisabled();
  });

  it('lets the host start once two players are in', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(make24State());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(screen.getByText(/2 players, 5 hands\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('sends the steps once they make 24, and only then', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(solving);

    expect(turn().getByText('Make 24')).toBeInTheDocument();
    await step(user, '3', 'plus', '9');
    expect(screen.getByText('3 + 9 = 12')).toBeInTheDocument();
    await step(user, '12, from 3 + 9', 'minus', '6');
    expect(fake.sentArgs('t24:solve')).toEqual([]);
    await step(user, '6, from 12 − 6', 'times', '4');

    expect(fake.sentArgs('t24:solve')).toEqual([
      [
        'r1',
        [
          { left: 0, op: '+', right: 3 },
          { left: 0, op: '-', right: 2 },
          { left: 0, op: '*', right: 1 },
        ],
      ],
    ]);
  });

  it('says what a wrong answer makes, and lets it be undone', async () => {
    const user = userEvent.setup();
    await renderSeated(solving);

    await step(user, '3', 'plus', '4');
    await step(user, '7, from 3 + 4', 'plus', '6');
    await step(user, '13, from 7 + 6', 'plus', '9');
    expect(screen.getByText('That makes 22')).toBeInTheDocument();
    expect(screen.getByText('Not 24')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(turn().getByText('Make 24')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '13, from 7 + 6' }),
    ).toBeInTheDocument();
  });

  it('keeps a player who has solved it waiting, and quiet', async () => {
    await renderSeated({
      ...solving,
      solved: [mine],
      mySolve: mine,
    });

    // A refresh keeps the solve but not the steps.
    expect(screen.getByText('Solved! +117')).toBeInTheDocument();
    expect(screen.getByText('Waiting for Maya')).toBeInTheDocument();
    expect(screen.getByText('(3 + 9 − 6) × 4')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Solved! Chat opens when the hand ends.'),
    ).toBeDisabled();
  });

  it('tells the others who has solved it, never how', async () => {
    await renderSeated({
      ...solving,
      solved: [{ ...mine, playerId: 'p2', username: 'Maya' }],
    });
    expect(screen.getByText('Maya solved it')).toBeInTheDocument();
    expect(screen.getByText('Solved · +117')).toBeInTheDocument();
  });

  it('shows how everybody did, and one way for those out of time', async () => {
    const { unmount } = await renderSeated(revealed);
    expect(turn().getByText('+117 for you')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hand 1 results' }),
    ).toBeInTheDocument();
    expect(screen.getByText('40 s left')).toBeInTheDocument();
    expect(screen.getByText('No answer')).toBeInTheDocument();
    expect(screen.getByText('next hand')).toBeInTheDocument();
    unmount();

    await renderSeated({
      ...revealed,
      hand: 5,
      lastHand: [{ ...mine, ...theirs, playerId: ME, username: 'Ryan' }],
    });
    expect(turn().getByText('Out of time')).toBeInTheDocument();
    expect(screen.getByText('One way: (3 + 9 − 6) × 4')).toBeInTheDocument();
    // The last hand leads to the final scores.
    expect(screen.getByText('final scores')).toBeInTheDocument();
  });

  it('leaves the steps out on a phone', async () => {
    onPhone();
    const user = userEvent.setup();
    await renderSeated(solving);
    await step(user, '3', 'plus', '9');
    expect(screen.queryByText('Your steps')).toBeNull();
  });

  it('keeps the last hand up under the final scores', async () => {
    await renderSeated(
      make24State({
        lastHand: [mine, theirs],
        lastDeal: [3, 4, 6, 9],
        lastGame: {
          endedEarly: false,
          standings: [
            { playerId: ME, username: 'Ryan', points: 420 },
            { playerId: 'p2', username: 'Maya', points: 300 },
          ],
          hands: 5,
        },
      }),
    );
    expect(
      screen.getByRole('heading', { name: 'You win with 420 points.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hand 5 results' }),
    ).toBeInTheDocument();
  });
});
