import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Result } from '../../../shared/wire-types';
import { FakeSocket } from '../tests/fake-socket';
import { minesweeperState } from '../tests/fixtures';
import { onPhone } from '../tests/phone';
import { renderApp } from '../tests/render-app';

const ROOM = '/games/minesweeper/rooms/r1';
const ok: Result = { ok: true };
const refused = (
  type:
    | 'notRoomMember'
    | 'incorrectPassword'
    | 'roomNotExist'
    | 'roomNotOpen'
    | 'invalidRequest',
): Result => ({
  ok: false,
  error: { type, message: type },
});

/** A server where this player holds no seat until `room:join` succeeds. */
function server({ password = '' } = {}) {
  const fake = new FakeSocket();
  let seated = false;
  fake.answer('room:sync', () => (seated ? ok : refused('notRoomMember')));
  fake.answer('room:join', (_roomId, _name, given) => {
    if (given !== password) return refused('incorrectPassword');
    seated = true;
    return ok;
  });
  return fake;
}

describe('a room page', () => {
  it('renders tied results and the viewer’s place in Chinese', async () => {
    const fake = server();
    await renderApp(ROOM, { fake, locale: 'zh' });
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({
          lastGame: {
            endedEarly: false,
            difficulty: 'Small',
            rounds: 6,
            standings: [
              { playerId: 'p2', username: 'Maya', points: 120 },
              { playerId: 'p3', username: 'Sam', points: 120 },
              { playerId: 'p1', username: 'Ryan', points: 90 },
            ],
          },
        }),
      ),
    );
    expect(
      screen.getByRole('heading', { name: 'Maya 和 Sam 以 120 分并列获胜。' }),
    ).toBeInTheDocument();
    const standings = screen.getByRole('list', { name: '排名' });
    expect(within(standings).getByText('第 3 名')).toBeInTheDocument();
    expect(within(standings).getAllByText('获胜者')).toHaveLength(2);
    expect(screen.getByText(/你获得了第 3 名。/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '再玩一局' }),
    ).toBeInTheDocument();
  });

  it('explains an unavailable room in Chinese and links to its rooms', async () => {
    const fake = new FakeSocket();
    fake.answer('room:sync', () => refused('roomNotExist'));
    await renderApp(ROOM, { fake, locale: 'zh' });
    expect(
      screen.getByRole('heading', { name: '这个房间已关闭。' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('房间已不存在。找另一个房间，或自己创建一个。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回房间列表' })).toHaveAttribute(
      'href',
      '/games/minesweeper',
    );
  });

  it('asks for and rejects a room password in Chinese', async () => {
    const user = userEvent.setup();
    const fake = server({ password: 'turtle' });
    await renderApp(ROOM, { fake, locale: 'zh' });
    expect(
      screen.getByRole('heading', { name: '这个房间需要密码。' }),
    ).toBeInTheDocument();
    const field = screen.getByLabelText('房间密码');
    await user.type(field, 'wrong');
    await user.click(screen.getByRole('button', { name: '加入房间' }));
    expect(await screen.findByText('密码不对，再试一次。')).toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it('takes a seat when opened from a link', async () => {
    const fake = server();
    await renderApp(ROOM, { fake });

    expect(fake.requests.map((r) => r.event)).toContain('room:join');
    expect(fake.requests.find((r) => r.event === 'room:join')!.args).toEqual([
      'r1',
      'Ryan',
      '',
      null,
    ]);
    act(() => fake.serverEmits('room:state', minesweeperState()));

    const bar = screen.getByRole('banner');
    expect(
      within(bar).getByRole('heading', { name: 'Minesweeper' }),
    ).toBeInTheDocument();
    expect(within(bar).getByText('Friday table')).toBeInTheDocument();
    expect(within(bar).getByText('Waiting room')).toBeInTheDocument();
    // A room has no links out but the wordmark, which asks first.
    expect(within(bar).queryByRole('link', { name: 'Games' })).toBeNull();
  });

  it('lists who is here before a first game, with no scores or Waiting yet', async () => {
    const fake = server();
    await renderApp(ROOM, { fake });
    const players = () =>
      within(screen.getByRole('region', { name: /^Players/ }));
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({
          playerList: {
            p1: { username: 'Ryan', points: 0, isConnected: true },
            p2: { username: 'Maya', points: 0, isConnected: false },
          },
        }),
      ),
    );
    expect(players().getByText('Ryan')).toBeInTheDocument();
    expect(players().queryByText('Waiting')).toBeNull();
    expect(players().queryByText('0')).toBeNull();
    // Away still says so: it is the one thing a lobby row has to tell.
    expect(players().getByText('Away')).toBeInTheDocument();

    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({
          playerList: {
            p1: { username: 'Ryan', points: 90, isConnected: true },
            p2: { username: 'Maya', points: 120, isConnected: true },
          },
          lastGame: {
            endedEarly: false,
            difficulty: 'Small',
            rounds: 6,
            standings: [
              { playerId: 'p2', username: 'Maya', points: 120 },
              { playerId: 'p1', username: 'Ryan', points: 90 },
            ],
          },
        }),
      ),
    );
    expect(players().getByText('90')).toBeInTheDocument();
  });

  it('asks for the password of a private room', async () => {
    const user = userEvent.setup();
    const fake = server({ password: 'turtle' });
    await renderApp(ROOM, { fake });

    expect(screen.getByText('This room has a secret.')).toBeInTheDocument();
    expect(
      screen.queryByText('That password didn’t work. Try again.'),
    ).toBeNull();

    await user.type(screen.getByLabelText('Room password'), 'tortoise');
    await user.click(screen.getByRole('button', { name: 'Join room' }));
    expect(
      await screen.findByText('That password didn’t work. Try again.'),
    ).toBeInTheDocument();
    // Back in the field with the wrong guess selected, ready to retype.
    const field = screen.getByLabelText<HTMLInputElement>('Room password');
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe('tortoise'.length);

    await user.keyboard('turtle');
    await user.click(screen.getByRole('button', { name: 'Join room' }));
    act(() => fake.serverEmits('room:state', minesweeperState()));
    expect(
      screen.getByRole('heading', { name: 'Minesweeper' }),
    ).toBeInTheDocument();
  });

  it('asks for a password straight on the page on a phone', async () => {
    onPhone();
    await renderApp(ROOM, { fake: server({ password: 'turtle' }) });
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'This room has a secret.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Come on in')).toBeInTheDocument();
    expect(
      screen.getByText('Ask the host for the password.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('form', { name: 'This room has a secret.' }),
    ).toBeInTheDocument();
  });

  it('says so when the room is gone', async () => {
    const fake = new FakeSocket();
    fake.answer('room:sync', () => refused('roomNotExist'));
    await renderApp(ROOM, { fake });
    expect(screen.getByText('This room has packed up.')).toBeInTheDocument();
  });

  it('says the room is gone when the link is mangled', async () => {
    const fake = new FakeSocket();
    fake.answer('room:sync', () => refused('invalidRequest'));
    await renderApp('/games/minesweeper/rooms/not-a-room', { fake });

    expect(
      await screen.findByRole('heading', { name: 'This room has packed up.' }),
    ).toBeInTheDocument();
  });

  it('says so when the room filled up or started', async () => {
    const fake = new FakeSocket();
    fake.answer('room:sync', () => refused('notRoomMember'));
    fake.answer('room:join', () => refused('roomNotOpen'));
    await renderApp(ROOM, { fake });
    expect(screen.getByText('That room moved on.')).toBeInTheDocument();
  });

  it('holds the room through a dropped connection', async () => {
    const fake = server();
    await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    act(() => fake.drop());
    expect(screen.getByText(/kept for 30 seconds/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave room' })).toBeNull();

    await act(async () => fake.open());
    expect(screen.queryByText(/kept for 30 seconds/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Leave room' }),
    ).toBeInTheDocument();
  });

  it('says why a start was refused, and clears it once the game starts', async () => {
    const user = userEvent.setup();
    const fake = server();
    fake.answer('game:start', () => ({
      ok: false,
      error: { type: 'notRoomOwner' as const, message: 'notRoomOwner' },
    }));
    await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only the host can start the game.',
    );

    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({ isGameStarted: true, phase: 'picking' }),
      ),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when a start gets no answer, or the seats are taken', async () => {
    const user = userEvent.setup();
    const fake = server();
    // As the socket's timeout does, when nothing answers in time.
    fake.answer('game:start', () => {
      throw new Error('operation has timed out');
    });
    fake.answer('room:watch', () => ({
      ok: false,
      error: { type: 'roomNotOpen' as const, message: 'roomNotOpen' },
    }));
    await renderApp(ROOM, { fake, locale: 'zh' });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Zumpo 没有回应，请再试一次。',
    );
    // Only a guest may move to watch.
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({ owner: { username: 'Maya', playerId: 'p2' } }),
      ),
    );
    await user.click(screen.getByRole('button', { name: '去观战' }));
    expect(screen.getByRole('alert')).toHaveTextContent('观战席已经满了。');
  });

  it('keeps its seat, listeners and drawing through a rename', async () => {
    const user = userEvent.setup();
    const fake = server();
    await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));
    const requestsBefore = fake.requests.length;
    const listenersBefore = fake.listenerCount('room:state');

    await user.click(screen.getByRole('button', { name: /: your name$/ }));
    const field = screen.getByRole('textbox', { name: 'Your name' });
    await user.clear(field);
    await user.type(field, 'Grace');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The rename goes to the seat as it is; the page asks for nothing again.
    expect(fake.sentArgs('player:rename')).toEqual([
      ['Grace', expect.any(Function)],
    ]);
    expect(fake.requests.slice(requestsBefore)).toEqual([]);
    expect(fake.listenerCount('room:state')).toBe(listenersBefore);
  });

  it('says the seat is gone when it was released while away', async () => {
    const fake = server();
    await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    act(() => fake.drop());
    fake.answer('room:sync', () => refused('notRoomMember'));
    await act(async () => fake.open());

    expect(
      screen.getByText('Let’s find you a fresh start.'),
    ).toBeInTheDocument();
    expect(fake.sentArgs('room:leave')).toEqual([]);
  });

  it('says the room closed when the server shuts down', async () => {
    const fake = server();
    await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    act(() => fake.serverEmits('server:closing'));
    act(() => fake.drop('io server disconnect'));
    expect(screen.getByText('Zumpo just restarted.')).toBeInTheDocument();

    // The server that comes back has never heard of the room, and the page
    // does not ask it.
    const requestsBefore = fake.requests.length;
    await act(async () => fake.open());
    expect(screen.getByText('Zumpo just restarted.')).toBeInTheDocument();
    expect(fake.requests.length).toBe(requestsBefore);
    expect(screen.getByRole('link', { name: 'Back to rooms' })).toHaveAttribute(
      'href',
      '/games/minesweeper',
    );
  });

  it('hands the room to another tab, and takes it back on request', async () => {
    const user = userEvent.setup();
    const fake = server();
    await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    act(() => fake.serverEmits('session:replaced'));
    act(() => fake.drop('io server disconnect'));
    expect(
      screen.getByText('Zumpo is open in another tab.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave room' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Use this tab' }));
    await act(async () => fake.open());
    expect(
      screen.getByRole('button', { name: 'Leave room' }),
    ).toBeInTheDocument();
    expect(fake.sentArgs('room:leave')).toEqual([]);
  });

  it('invites with the whole link, ready to copy', async () => {
    const user = userEvent.setup();
    const fake = server();
    await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    await user.click(
      screen.getAllByRole('button', { name: 'Invite friends' })[0]!,
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Invite friends',
    });

    expect(
      within(dialog).getByRole('textbox', { name: 'Room link' }),
    ).toHaveValue(`${window.location.origin}${ROOM}`);
    await vi.waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Copy' }),
      ).toHaveFocus(),
    );
  });

  it('watches a game under way, with nothing to play and a seat for later', async () => {
    const fake = server();
    await renderApp(ROOM, { fake });
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({
          isGameStarted: true,
          phase: 'picking',
          round: 1,
          playerList: {
            p2: { username: 'Maya', points: 0, isConnected: true },
            p3: { username: 'Sam', points: 0, isConnected: true },
          },
          spectators: { p1: { username: 'Ryan', isConnected: true } },
        }),
      ),
    );

    expect(
      screen.getByText(
        'You’re watching this game. You can take a seat once it ends.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Everyone is picking')).toBeInTheDocument();
    // The board takes no picks from a spectator.
    expect(
      screen.queryAllByRole('button', { name: /hidden|cell/i }),
    ).toHaveLength(0);
    const watching = screen.getByRole('region', { name: 'Watching' });
    expect(within(watching).getByText('1 / 5')).toBeInTheDocument();
    expect(within(watching).getByText(/Ryan/)).toBeInTheDocument();
  });

  it('offers a spectator a free seat between games', async () => {
    const user = userEvent.setup();
    const fake = server();
    fake.answer('room:sit', () => ok);
    await renderApp(ROOM, { fake });
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({
          owner: { username: 'Maya', playerId: 'p2' },
          playerList: {
            p2: { username: 'Maya', points: 0, isConnected: true },
          },
          spectators: { p1: { username: 'Ryan', isConnected: true } },
        }),
      ),
    );

    expect(
      screen.getByRole('heading', { name: 'You’re watching.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Take a seat' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'room:sit', args: ['r1'] });
  });

  it('lets a guest watch instead between games', async () => {
    const user = userEvent.setup();
    const fake = server();
    fake.answer('room:watch', () => ok);
    await renderApp(ROOM, { fake });
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({ owner: { username: 'Maya', playerId: 'p2' } }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Watch instead' }));
    expect(fake.requests.at(-1)).toEqual({
      event: 'room:watch',
      args: ['r1'],
    });
  });

  it('never offers the host Watch instead, which would give the crown away', async () => {
    const fake = server();
    await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));
    expect(
      screen.getByRole('heading', { name: 'Everyone’s here?' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Watch instead' })).toBeNull();

    // Alone, after the others left, there is nobody to hand it to either.
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({
          playerList: {
            p1: { username: 'Ryan', points: 0, isConnected: true },
          },
        }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'Watch instead' })).toBeNull();
  });

  it('says the crown came to the viewer only when it did', async () => {
    const fake = server();
    await renderApp(ROOM, { fake });
    const alone = { p1: { username: 'Ryan', points: 0, isConnected: true } };
    const cutShort = {
      endedEarly: true,
      difficulty: 'Small' as const,
      rounds: 1,
      standings: [{ playerId: 'p1', username: 'Ryan', points: 0 }],
    };

    // Ryan hosted the game, and Maya left it.
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({ isGameStarted: true, phase: 'picking', round: 1 }),
      ),
    );
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({ playerList: alone, lastGame: cutShort }),
      ),
    );
    expect(
      screen.getByRole('heading', { name: 'Everyone else left.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Minesweeper needs at least 2 players, so the game has ended. Invite friends to start a new one.',
      ),
    ).toBeInTheDocument();

    // Maya hosted the next one, and left it: the crown is Ryan's now.
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({
          owner: { username: 'Maya', playerId: 'p2' },
          isGameStarted: true,
          phase: 'picking',
          round: 1,
        }),
      ),
    );
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({ playerList: alone, lastGame: cutShort }),
      ),
    );
    expect(
      screen.getByText(
        'Minesweeper needs at least 2 players, so the game has ended. You are the host now: invite friends to start a new one.',
      ),
    ).toBeInTheDocument();
  });

  it('lets a spectator leave a game under way at once', async () => {
    const user = userEvent.setup();
    const fake = server();
    const { router } = await renderApp(ROOM, { fake });
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({
          isGameStarted: true,
          phase: 'picking',
          round: 1,
          playerList: {
            p2: { username: 'Maya', points: 0, isConnected: true },
            p3: { username: 'Sam', points: 0, isConnected: true },
          },
          spectators: { p1: { username: 'Ryan', isConnected: true } },
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Leave room' }));

    expect(fake.sentArgs('room:leave')).toEqual([['r1']]);
    expect(router.state.location.pathname).toBe('/games/minesweeper');
  });

  it('leaves at once between games', async () => {
    const user = userEvent.setup();
    const fake = server();
    const { router } = await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    await user.click(screen.getByRole('button', { name: 'Leave room' }));

    expect(fake.sentArgs('room:leave')).toEqual([['r1']]);
    expect(router.state.location.pathname).toBe('/games/minesweeper');
  });

  it('asks before leaving a game in progress', async () => {
    const user = userEvent.setup();
    const fake = server();
    const { router } = await renderApp(ROOM, { fake });
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({ isGameStarted: true, phase: 'picking', round: 1 }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Leave room' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave Friday table?' });

    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe(ROOM);
    expect(fake.sentArgs('room:leave')).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Leave room' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Leave room',
      }),
    );
    expect(fake.sentArgs('room:leave')).toEqual([['r1']]);
    expect(router.state.location.pathname).toBe('/games/minesweeper');
  });

  it('asks before the wordmark takes a player out between games', async () => {
    const user = userEvent.setup();
    const fake = server();
    const { router } = await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    await user.click(screen.getByRole('link', { name: 'Zumpo home' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave Friday table?' });
    expect(
      within(dialog).getByText(
        'Your seat goes with you. You can join again while a seat is open. Maya becomes the host.',
      ),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe(ROOM);
    expect(fake.sentArgs('room:leave')).toEqual([]);

    await user.click(screen.getByRole('link', { name: 'Zumpo home' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Leave room',
      }),
    );
    expect(fake.sentArgs('room:leave')).toEqual([['r1']]);
    expect(router.state.location.pathname).toBe('/');
  });

  it('asks before the wordmark takes a player out of a game', async () => {
    const user = userEvent.setup();
    const fake = server();
    await renderApp(ROOM, { fake });
    act(() =>
      fake.serverEmits(
        'room:state',
        minesweeperState({ isGameStarted: true, phase: 'picking', round: 1 }),
      ),
    );

    await user.click(screen.getByRole('link', { name: 'Zumpo home' }));
    expect(
      within(screen.getByRole('dialog')).getByText(
        'Too few players would be left, so leaving ends the game for everyone. Maya becomes the host.',
      ),
    ).toBeInTheDocument();
  });

  it('shows how to play over the room, which stays', async () => {
    const user = userEvent.setup();
    const fake = server();
    const { router } = await renderApp(ROOM, { fake });
    act(() => fake.serverEmits('room:state', minesweeperState()));

    await user.click(screen.getByRole('button', { name: 'How to play' }));
    const dialog = screen.getByRole('dialog', {
      name: 'How to play Minesweeper',
    });
    expect(within(dialog).getAllByRole('listitem').length).toBeGreaterThan(0);

    await user.click(
      within(dialog).getByRole('button', { name: 'Back to the game' }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe(ROOM);
    expect(fake.sentArgs('room:leave')).toEqual([]);
  });
});
