import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ME, minesweeperState } from '../tests/fixtures';
import { onPhone } from '../tests/phone';
import { renderSeated } from '../tests/seated';
import { renderApp } from '../tests/render-app';
import { FakeSocket } from '../tests/fake-socket';
import { roomPath } from '../games/catalog';

const picking = minesweeperState({
  isGameStarted: true,
  phase: 'picking',
  round: 1,
  phaseEndsInMs: 15_000,
});

const pick = {
  playerId: ME,
  username: 'Ryan',
  index: 0,
  risk: 0.23,
  hitMine: false,
  points: 31,
  sharedWith: 1,
  autoPlayed: false,
};

/** The celebration's canvas; the room has no other. */
const confetti = () => document.querySelector('canvas[aria-hidden]');

describe('a Minesweeper room', () => {
  it('explains a shared pick and risk in Chinese', async () => {
    const fake = new FakeSocket();
    fake.answer('room:sync', () => ({ ok: true as const }));
    await renderApp(roomPath('minesweeper', 'r1'), { locale: 'zh', fake });
    act(() =>
      fake.serverEmits('room:state', {
        ...picking,
        phase: 'reveal',
        lastRound: [
          { ...pick, sharedWith: 2 },
          { ...pick, playerId: 'p2', username: 'Maya', sharedWith: 2 },
        ],
      }),
    );
    expect(screen.getByText('安全！+31')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '第 1 轮结果' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('23% 踩雷概率')).toHaveLength(2);
    expect(screen.getAllByText('2 人平分')).toHaveLength(2);
    expect(
      screen.getByText('你 和 Maya 选了同一个格子，平分奖励'),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('说点什么…')).toBeInTheDocument();
  });

  it('lets the host start once two players are in', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(minesweeperState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(screen.getByText('Everyone’s here?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });

    // Start game goes with the waiting card; the board takes the focus.
    update(picking);
    expect(
      screen.getByRole('gridcell', { name: 'Row 1, column 1: hidden' }),
    ).toHaveFocus();
  });

  it('on a phone, says on the waiting card who else is here', async () => {
    onPhone();
    await renderSeated(
      minesweeperState({
        playerList: {
          p1: { username: 'Ryan', points: 0, isConnected: true },
          p2: { username: 'Maya', points: 0, isConnected: true },
          p3: { username: 'Leo', points: 0, isConnected: true },
        },
      }),
    );
    expect(screen.getByText('Maya and Leo are here.')).toBeInTheDocument();
  });

  it('asks a player still on a picked name for one their friends know', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(minesweeperState(), { picked: true });

    expect(
      screen.getByText(
        'You’re Ryan for now. Pick a name your friends will know.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change name' }));
    const field = screen.getByRole('textbox', { name: 'Your name' });
    await user.clear(field);
    await user.type(field, 'Grace{Enter}');
    expect(fake.sentArgs('player:rename')).toEqual([
      ['Grace', expect.any(Function)],
    ]);
    expect(screen.queryByText(/Pick a name your friends will know/)).toBeNull();
  });

  it('says nothing about a name the player chose', async () => {
    await renderSeated(minesweeperState());
    expect(screen.queryByText(/Pick a name your friends will know/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change name' })).toBeNull();
  });

  it('locks in one pick per round', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(picking);

    expect(screen.getByText('Pick a cell')).toBeInTheDocument();
    expect(
      screen.getByText('10 mines · your pick locks when you click'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('gridcell', { name: 'Row 1, column 3: hidden' }),
    );
    expect(fake.sentArgs('ms:pick')).toEqual([['r1', 2]]);

    update({ ...picking, myPick: 2, lockedIn: [ME] });
    expect(
      screen.getByText('Locked in', { selector: '*:not(li *)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Waiting for everyone else')).toBeInTheDocument();
    expect(
      screen.getByRole('gridcell', { name: 'Row 1, column 1: hidden' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps a phone’s turn bar to the round and the mines, cut short nowhere', async () => {
    onPhone();
    const { update } = await renderSeated(picking);
    const turn = screen.getByRole('region', { name: 'Turn' });

    expect(turn).toHaveTextContent(/^Round 1Pick a cell10 mines\d/);
    expect(turn).not.toHaveTextContent('Small');
    update({ ...picking, minesFound: 2 });
    expect(turn).toHaveTextContent('10 mines · 2 hit');
  });

  it('says how many have locked in while the viewer is still picking', async () => {
    const { update } = await renderSeated({ ...picking, lockedIn: ['p2'] });

    expect(screen.getByText('Pick a cell')).toBeInTheDocument();
    expect(screen.getByText('1 player is locked in')).toBeInTheDocument();
    // The scoreboard names them.
    expect(
      within(screen.getByRole('region', { name: 'Players' })).getByText(
        'Locked in',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('10 mines · your pick locks when you click'),
    ).toBeNull();
    update({ ...picking, lockedIn: [] });
    expect(
      screen.getByText('10 mines · your pick locks when you click'),
    ).toBeInTheDocument();
  });

  it('counts more than one player locked in, in English and Chinese', async () => {
    const four = {
      ...picking,
      playerList: {
        ...picking.playerList,
        p3: { username: 'Leo', points: 0, isConnected: true },
        p4: { username: 'Ana', points: 0, isConnected: true },
      },
      lockedIn: ['p2', 'p3'],
    };
    const { unmount } = await renderSeated(four);
    expect(screen.getByText('2 players are locked in')).toBeInTheDocument();
    unmount();

    const fake = new FakeSocket();
    fake.answer('room:sync', () => ({ ok: true as const }));
    await renderApp(roomPath('minesweeper', 'r1'), { locale: 'zh', fake });
    act(() => fake.serverEmits('room:state', four));
    expect(screen.getByText('已有 2 人选好')).toBeInTheDocument();
  });

  it('shows what each pick was worth', async () => {
    await renderSeated({
      ...picking,
      phase: 'reveal',
      phaseEndsInMs: 4_000,
      lockedIn: [ME, 'p2'],
      board: picking.board.map((cell, index) => (index === 0 ? 1 : cell)),
      lastRound: [
        pick,
        {
          ...pick,
          playerId: 'p2',
          username: 'Maya',
          index: 40,
          risk: 0.15,
          hitMine: true,
          points: -105,
        },
      ],
    });

    expect(screen.getByText('Safe! +31')).toBeInTheDocument();
    expect(screen.getByText('Your cell had a 23% risk')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Round 1 results' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hit a mine · −105')).toBeInTheDocument();
  });

  it('counts down to the final scores after the last round', async () => {
    const { update } = await renderSeated({
      ...picking,
      phase: 'reveal',
      lastRound: [pick],
    });
    expect(screen.getByText('next round')).toBeInTheDocument();

    // Nothing left to pick: no round follows.
    update({
      ...picking,
      phase: 'reveal',
      lastRound: [pick],
      board: picking.board.map(() => 1),
    });
    expect(screen.getByText('final scores')).toBeInTheDocument();
  });

  it('says when the clock picked for the player', async () => {
    await renderSeated({
      ...picking,
      phase: 'reveal',
      lastRound: [{ ...pick, risk: 0, points: 0, autoPlayed: true }],
    });
    expect(screen.getByText('Time ran out')).toBeInTheDocument();
    expect(
      screen.getByText('The safest cell was picked for you: 0% risk, so +0'),
    ).toBeInTheDocument();
  });

  it('names who shared a cell', async () => {
    await renderSeated({
      ...picking,
      phase: 'reveal',
      lastRound: [
        { ...pick, sharedWith: 2 },
        { ...pick, playerId: 'p2', username: 'Maya', sharedWith: 2 },
      ],
    });
    expect(
      screen.getByText(
        'You and Maya picked the same cell, so you split its reward',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the last results to the reveal on a phone', async () => {
    onPhone();
    const { update } = await renderSeated({
      ...picking,
      phase: 'reveal',
      lastRound: [pick],
    });
    expect(
      screen.getByRole('heading', { name: 'Round 1 results' }),
    ).toBeInTheDocument();

    update({ ...picking, round: 2, lastRound: [pick] });
    expect(screen.getByText('Pick a cell')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /results/ })).toBeNull();
  });

  it('explains a mine’s cost, except on a phone', async () => {
    const mine = { ...pick, hitMine: true, points: -105, risk: 0.15 };
    const revealed = {
      ...picking,
      phase: 'reveal' as const,
      lastRound: [mine],
    };
    const { unmount } = await renderSeated(revealed);
    expect(
      screen.getByText(
        'Your cell had a 15% risk. A mine costs more the safer it looked.',
      ),
    ).toBeInTheDocument();
    unmount();

    onPhone();
    await renderSeated(revealed);
    expect(screen.getByText('Your cell had a 15% risk')).toBeInTheDocument();
  });

  it('celebrates a game that ends while the room is open', async () => {
    const ended = minesweeperState({
      lastRound: [pick],
      lastGame: {
        endedEarly: false,
        standings: [{ playerId: ME, username: 'Ryan', points: 120 }],
        difficulty: 'Small',
        rounds: 6,
      },
    });
    const { update } = await renderSeated(ended);
    expect(confetti()).toBeNull();

    update(picking);
    update(ended);
    // The result is in the turn bar's place, and what comes next beside the
    // board, so the board keeps its own.
    expect(
      within(screen.getByRole('region', { name: 'Turn' })).getByText(
        'You win with 120 points.',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Next game' })).getByRole(
        'button',
        { name: 'Play again' },
      ),
    ).toBeInTheDocument();
    // The standings count the last round: they take its place.
    expect(
      screen.getByRole('heading', { name: 'Standings' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /^Round \d+ results$/ }),
    ).toBeNull();
    expect(confetti()).not.toBeNull();
    // The result is the stage's heading, and takes the focus, as a new bar
    // already filled is seldom read out.
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'You win with 120 points.',
      }),
    ).toHaveFocus();
  });

  it('leaves the focus with a viewer typing in the chat as the game ends', async () => {
    const user = userEvent.setup();
    const ended = minesweeperState({
      lastRound: [pick],
      lastGame: {
        endedEarly: false,
        standings: [{ playerId: ME, username: 'Ryan', points: 120 }],
        difficulty: 'Small',
        rounds: 6,
      },
    });
    const { update } = await renderSeated(picking);
    const message = screen.getByRole('textbox', { name: 'Message' });
    await user.type(message, 'gg');

    update(ended);
    expect(message).toHaveFocus();
  });
});
