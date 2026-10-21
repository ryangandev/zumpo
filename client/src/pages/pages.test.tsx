import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ALL_CODES,
  dailyCode,
  puzzleNumber,
} from '../../../shared/code-breaker';
import {
  dailyAnswer,
  puzzleNumber as wordPuzzle,
} from '../../../shared/daily-word';
import type { MinesweeperLobbyRoomInfo } from '../../../shared/wire-types';
import { recordGuesses } from '../daily-word/solo/records';
import { onPhone } from '../tests/phone';
import { renderApp } from '../tests/render-app';

const lobbyRoom: MinesweeperLobbyRoomInfo = {
  gameType: 'minesweeper',
  roomId: 'r1',
  roomName: 'Friday table',
  owner: { username: 'Maya', playerId: 'p2' },
  status: 'Open',
  currentPlayerCount: 1,
  maxPlayers: 8,
  hasPassword: false,
  spectatorCount: 0,
  difficulty: 'Small',
};

/** The viewer's avatar in the header, which opens the name menu. */
const avatar = () => screen.getByRole('button', { name: /: your name$/ });

describe('a name', () => {
  it('is picked on a first visit, so any page opens at once', async () => {
    const { router } = await renderApp('/games/minesweeper', {
      firstVisit: true,
    });
    expect(router.state.location.pathname).toBe('/games/minesweeper');
    const stored = JSON.parse(localStorage.getItem('zumpo:name')!) as {
      name: string;
      picked: boolean;
    };
    expect(stored.picked).toBe(true);
    expect(avatar()).toHaveAccessibleName(`${stored.name}: your name`);
  });

  it('is not announced on the front door: the room asks when it matters', async () => {
    await renderApp('/', { firstVisit: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('changes in place, from the avatar on any page', async () => {
    const user = userEvent.setup();
    const { fake, router } = await renderApp('/');
    await user.click(avatar());

    const field = screen.getByRole('textbox', { name: 'Your name' });
    expect(field).toHaveValue('Ryan');
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText('Enter a name with at least one visible character.'),
    ).toBeInTheDocument();
    expect(field).toHaveFocus();

    await user.clear(field);
    await user.type(field, ' Grace ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(avatar()).toHaveAccessibleName('Grace: your name');
    expect(router.state.location.pathname).toBe('/');
    expect(JSON.parse(localStorage.getItem('zumpo:name')!)).toEqual({
      name: 'Grace',
      picked: false,
    });
    expect(fake.sentArgs('player:rename')).toEqual([
      ['Grace', expect.any(Function)],
    ]);
  });

  it('makes a picked name theirs when saved unchanged, and tells the seats', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/', {
      name: 'Sleepy Otter',
      picked: true,
    });
    await user.click(avatar());
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(JSON.parse(localStorage.getItem('zumpo:name')!)).toEqual({
      name: 'Sleepy Otter',
      picked: false,
    });
    expect(fake.sentArgs('player:rename')).toEqual([
      ['Sleepy Otter', expect.any(Function)],
    ]);
  });

  it('rolls another random name to save', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(avatar());
    await user.click(screen.getByRole('button', { name: 'Roll a name' }));
    const field = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Your name',
    });
    expect(field.value).toMatch(/^\w+ \w+$/);
    expect(field.value).not.toBe('Ryan');
    expect(field).toHaveFocus();
  });

  it('is not repeated on a game’s page: the avatar changes it there too', async () => {
    const user = userEvent.setup();
    await renderApp('/games/minesweeper');
    expect(screen.queryByRole('button', { name: /^Playing as/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back to games' })).toBeNull();
    await user.click(avatar());
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue(
      'Ryan',
    );
  });
});

/** The games' names on the home page, in the order shown. */
const tiles = () =>
  within(screen.getByRole('region', { name: 'Pick a game' }))
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);

describe('the home page', () => {
  it('lists every game by kind, the kinds you can play alone first, then by name', async () => {
    await renderApp('/');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Pick a game' }),
    ).toBeInTheDocument();
    expect(tiles()).toEqual([
      'Code Breaker',
      'Daily Word',
      'Make 24',
      'Minesweeper',
      'Pairs',
      'Snap',
      'Trios',
      'Gomoku',
      'Doodle Chain',
      'Draw & Guess',
      'Hush',
      'Liar’s Dice',
    ]);
    expect(
      within(screen.getByRole('group', { name: 'Kind of game' }))
        .getAllByRole('button')
        .map((filter) => filter.textContent),
    ).toEqual(['All', 'Puzzles', 'Spot & remember', 'Strategy', 'Party']);
  });

  it('filters to one kind, and keeps the filter in the address', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    const filters = screen.getByRole('group', { name: 'Kind of game' });
    expect(
      within(filters).getByRole('button', { name: 'All' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(filters).getByRole('button', { name: 'Puzzles' }));
    expect(router.state.location.search).toBe('?kind=puzzles');
    expect(tiles()).toEqual([
      'Code Breaker',
      'Daily Word',
      'Make 24',
      'Minesweeper',
    ]);
    expect(
      within(filters).getByRole('button', { name: 'Puzzles' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(filters).getByRole('button', { name: 'Strategy' }));
    expect(router.state.location.search).toBe('?kind=strategy');
    expect(tiles()).toEqual(['Gomoku']);

    await user.click(within(filters).getByRole('button', { name: 'All' }));
    expect(router.state.location.search).toBe('');
    expect(tiles()).toHaveLength(12);
  });

  it('shows every game for a kind it does not know', async () => {
    await renderApp('/?kind=cards');
    expect(tiles()).toHaveLength(12);
  });

  it('opens a game’s page from its card', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    const card = screen.getByRole('link', { name: 'Trios' });
    expect(card).toHaveAccessibleDescription(
      'Spot three that are all the same or all different. Solo 2–8 players',
    );
    expect(
      within(screen.getByRole('region', { name: 'Pick a game' })).queryByRole(
        'link',
        { name: 'Play solo' },
      ),
    ).toBeNull();
    await user.click(card);
    expect(router.state.location.pathname).toBe('/games/trios');
  });

  it('goes straight to a game on your own from its Solo tag', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    const solo = screen.getByRole('link', { name: 'Play Trios solo' });
    expect(solo).toHaveAttribute('href', '/games/trios/solo');
    expect(solo).toHaveAccessibleDescription('');
    await user.click(solo);
    expect(router.state.location.pathname).toBe('/games/trios/solo');
  });

  it('names the Solo tag’s link in Chinese too', async () => {
    await renderApp('/', { locale: 'zh' });
    expect(screen.getByRole('link', { name: '单人玩扫雷' })).toHaveAttribute(
      'href',
      '/games/minesweeper/solo',
    );
  });

  it('gives Draw & Guess one tag for its players, as every game has', async () => {
    await renderApp('/');
    expect(
      screen.getByRole('link', { name: 'Draw & Guess' }),
    ).toHaveAccessibleDescription(
      'One draws. Everyone else tries to get there first. 2–8 players',
    );
  });

  it('shows where today’s daily code stands, on its card and its page', async () => {
    // A day well after the first code, so there is a yesterday.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2027, 2, 14, 12));
    const today = puzzleNumber(new Date());
    const misses = ALL_CODES.filter((code) => code !== dailyCode(today));
    localStorage.setItem(
      'zumpo:solo:code-breaker:puzzles',
      JSON.stringify({ [today]: misses.slice(0, 2) }),
    );
    const { unmount } = await renderApp('/');
    const code = screen.getByRole('link', { name: 'Play Code Breaker solo' });
    expect(code).toHaveAccessibleDescription('Guess 3 of 10');
    expect(code).toHaveAttribute('href', '/games/code-breaker/solo');
    unmount();

    localStorage.setItem(
      'zumpo:solo:code-breaker:puzzles',
      JSON.stringify({
        [today - 1]: [dailyCode(today - 1)],
        [today]: [dailyCode(today)],
      }),
    );
    await renderApp('/games/code-breaker');
    const intro = screen.getByRole('region', { name: 'Code Breaker' });
    expect(
      within(intro).getByText('Done today · 2-day streak'),
    ).toBeInTheDocument();
    expect(
      within(intro).getByRole('link', { name: 'See today’s result' }),
    ).toHaveAttribute('href', '/games/code-breaker/solo');
    localStorage.removeItem('zumpo:solo:code-breaker:puzzles');
    vi.useRealTimers();
  });

  it('shows where today’s daily word stands from the first render', async () => {
    const today = wordPuzzle(new Date());
    recordGuesses(today - 1, [dailyAnswer(today - 1)]);
    recordGuesses(
      today,
      ['hatch', 'match'].filter((w) => w !== dailyAnswer(today)).slice(0, 1),
    );
    const { unmount } = await renderApp('/');
    expect(
      screen.getByRole('link', { name: 'Play Daily Word solo' }),
    ).toHaveAccessibleDescription('Guess 2 of 6');
    unmount();

    recordGuesses(today, [dailyAnswer(today)]);
    await renderApp('/games/daily-word');
    const intro = screen.getByRole('region', { name: 'Daily Word' });
    expect(
      within(intro).getByText('Done today · 2-day streak'),
    ).toBeInTheDocument();
    expect(
      within(intro).getByRole('link', { name: 'See today’s result' }),
    ).toBeInTheDocument();
    localStorage.removeItem('zumpo:solo:daily-word:puzzles');
    localStorage.removeItem('zumpo:solo:daily-word:today');
  });

  it('is where the old games and How to play pages lead', async () => {
    for (const old of ['/games', '/how-to-play']) {
      const { router, unmount } = await renderApp(old);
      expect(router.state.location.pathname).toBe('/');
      unmount();
    }
  });
});

describe('a game’s page', () => {
  it('says what the game is and offers Play solo first, then a room', async () => {
    await renderApp('/games/minesweeper');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Minesweeper' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Puzzles')).toBeInTheDocument();
    const intro = screen.getByRole('region', { name: 'Minesweeper' });
    expect(
      within(intro)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Play solo', '/games/minesweeper/solo'],
      ['Create a room', '/games/minesweeper/new'],
    ]);
  });

  it('offers only a room for a game played together', async () => {
    await renderApp('/games/hush');
    const intro = screen.getByRole('region', { name: 'Hush' });
    expect(within(intro).queryByRole('link', { name: 'Play solo' })).toBeNull();
    expect(
      within(intro).getByRole('link', { name: 'Create a room' }),
    ).toHaveAttribute('href', '/games/hush/new');
  });

  it('gives the rules on your own, then in a room, as the buttons go, and opens them all', async () => {
    const user = userEvent.setup();
    await renderApp('/games/minesweeper');
    const howToPlay = screen.getByRole('complementary', {
      name: 'How to play',
    });
    expect(
      within(howToPlay)
        .getAllByRole('region')
        .map((region) => region.querySelector('h3')?.textContent),
    ).toEqual(['On your own', 'Play together']);
    // Each stands on its own, so a step the two share is said in both.
    const together = within(howToPlay).getByRole('region', {
      name: 'Play together',
    });
    expect(together).toHaveTextContent(
      'Share one board, and pick safe cells in secret.',
    );
    expect(together).toHaveTextContent('A number counts the mines');
    expect(
      within(howToPlay).getByRole('region', { name: 'On your own' }),
    ).toHaveTextContent('your first click is always safe');
    expect(howToPlay).not.toHaveTextContent('15s to pick');

    const full = within(howToPlay).getByRole('button', { name: 'Full rules' });
    expect(full).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(howToPlay).queryByText(
        /^Pick the same safe cell as someone else\?/,
      ),
    ).not.toBeVisible();
    await user.click(full);
    expect(full).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(howToPlay).getByText(/^Pick the same safe cell as someone else\?/),
    ).toBeVisible();
  });

  it('gives a game played together only its rules in a room', async () => {
    await renderApp('/games/draw-and-guess');
    const howToPlay = screen.getByRole('complementary', {
      name: 'How to play',
    });
    expect(
      within(howToPlay).queryByRole('region', { name: 'On your own' }),
    ).toBeNull();
  });

  it('shows the room list and each room’s setting in Chinese', async () => {
    const { fake } = await renderApp('/games/minesweeper', { locale: 'zh' });
    expect(
      screen.getByRole('heading', { name: '扫雷房间' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '创建房间' })).toHaveAttribute(
      'href',
      '/games/minesweeper/new',
    );
    expect(screen.getByText('正在寻找玩伴…')).toBeInTheDocument();
    act(() => fake.serverEmits('lobby:rooms', 'minesweeper', [lobbyRoom]));
    const row = screen.getByRole('article', { name: 'Friday table' });
    expect(within(row).getByText('房主 Maya · 小 9 × 9')).toBeInTheDocument();
    act(() =>
      fake.serverEmits('lobby:rooms', 'minesweeper', [
        { ...lobbyRoom, roomName: '' },
      ]),
    );
    expect(
      within(screen.getByRole('article', { name: 'Maya 的房间' })).getByText(
        '小 9 × 9',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('1 个房间 · 实时更新')).toBeInTheDocument();
  });

  it('lists the rooms live and joins one', async () => {
    const user = userEvent.setup();
    const { fake, router } = await renderApp('/games/minesweeper');
    expect(fake.sentArgs('lobby:subscribe')).toEqual([['minesweeper']]);
    expect(screen.getByText('Finding your people…')).toBeInTheDocument();

    act(() => fake.serverEmits('lobby:rooms', 'minesweeper', [lobbyRoom]));
    const row = screen.getByRole('article', { name: 'Friday table' });
    expect(within(row).getByText('Hosted by Maya · Small 9 × 9')).toBeVisible();
    expect(screen.getByText('1 room · Updates live')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Join' }));
    expect(router.state.location.pathname).toBe('/games/minesweeper/rooms/r1');
    expect(fake.sentArgs('lobby:unsubscribe')).toEqual([['minesweeper']]);
  });

  it('offers to watch a room under way while a spectator seat is free', async () => {
    const user = userEvent.setup();
    const { fake, router } = await renderApp('/games/minesweeper');
    act(() =>
      fake.serverEmits('lobby:rooms', 'minesweeper', [
        { ...lobbyRoom, status: 'In Progress' },
        {
          ...lobbyRoom,
          roomId: 'r2',
          roomName: 'Crowded',
          status: 'In Progress',
          spectatorCount: 5,
        },
      ]),
    );

    const crowded = screen.getByRole('article', { name: 'Crowded' });
    expect(within(crowded).getByText('Playing')).toBeInTheDocument();
    expect(within(crowded).queryByRole('button')).toBeNull();

    const row = screen.getByRole('article', { name: 'Friday table' });
    expect(within(row).getByText('Playing')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Watch' }));
    expect(router.state.location.pathname).toBe('/games/minesweeper/rooms/r1');
  });

  it('names a room after its host, saying the host once', async () => {
    const { fake } = await renderApp('/games/minesweeper');
    act(() =>
      fake.serverEmits('lobby:rooms', 'minesweeper', [
        { ...lobbyRoom, roomName: '' },
        { ...lobbyRoom, roomId: 'r2' },
      ]),
    );
    const named = screen.getByRole('article', { name: 'Maya’s room' });
    expect(within(named).getByText('Small 9 × 9')).toBeInTheDocument();
    const typed = screen.getByRole('article', { name: 'Friday table' });
    expect(
      within(typed).getByText('Hosted by Maya · Small 9 × 9'),
    ).toBeInTheDocument();
  });

  it('leaves Create a room to the intro when no room is open', async () => {
    const { fake } = await renderApp('/games/minesweeper');
    act(() => fake.serverEmits('lobby:rooms', 'minesweeper', []));
    expect(screen.getByText('No rooms yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create a room' })).toHaveLength(
      1,
    );
  });

  it('ignores another game’s rooms', async () => {
    const { fake } = await renderApp('/games/minesweeper');
    act(() => fake.serverEmits('lobby:rooms', 'draw-and-guess', []));
    expect(screen.getByText('Finding your people…')).toBeInTheDocument();
  });

  it('says so when a game does not exist', async () => {
    await renderApp('/games/chess');
    expect(screen.getByText('Lost?')).toBeInTheDocument();
  });
});

describe('making a room', () => {
  it('creates a room with Chinese fields, board options and validation', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/minesweeper/new', {
      locale: 'zh',
    });
    expect(
      screen.getByRole('heading', { level: 1, name: '新建扫雷房间' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '更多选项' }));
    const field = screen.getByLabelText('房间名称');
    expect(field).toHaveValue('Ryan 的房间');
    expect(screen.getByText('9 × 9 · 10 颗雷')).toBeInTheDocument();
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: '创建房间' }));
    expect(screen.getByText('给房间起个名字。')).toBeInTheDocument();
    expect(field).toHaveFocus();
    await user.type(field, '周五游戏');
    await user.click(screen.getByRole('combobox', { name: '棋盘' }));
    await user.click(await screen.findByRole('option', { name: /^中/ }));
    await user.click(screen.getByRole('button', { name: '创建房间' }));
    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [
          expect.objectContaining({
            roomName: '周五游戏',
            settings: { difficulty: 'Medium' },
          }),
        ],
      }),
    );
  });

  it('keeps the game’s own setting in view, and the rest under More options', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/minesweeper/new');
    expect(
      screen.getByRole('heading', { level: 1, name: 'New Minesweeper room' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Minesweeper rooms' }),
    ).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Board' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Room name' })).toBeNull();

    const more = screen.getByRole('button', { name: 'More options' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'Room name' })).toHaveValue(
      'Ryan’s room',
    );
    await user.click(screen.getByRole('combobox', { name: 'Seats' }));
    await user.click(await screen.findByRole('option', { name: '4 players' }));
    await user.type(screen.getByLabelText('Password (optional)'), 'otters');
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [
          expect.objectContaining({
            roomName: '',
            maxPlayers: 4,
            password: 'otters',
          }),
        ],
      }),
    );
  });

  it('asks for a name before it sends anything, opening More options to', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/minesweeper/new');
    const more = screen.getByRole('button', { name: 'More options' });
    await user.click(more);
    await user.clear(screen.getByLabelText('Room name'));
    await user.click(more);
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Give your room a name.')).toBeVisible();
    expect(screen.getByLabelText('Room name')).toHaveFocus();
    expect(fake.requests).not.toContainEqual(
      expect.objectContaining({ event: 'room:create' }),
    );
  });

  it('makes a Pairs room on the board picked, with up to six seats', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/pairs/new');
    expect(screen.getByText('4 × 4 · 8 pairs')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Board' }));
    await user.click(await screen.findByRole('option', { name: /^Large/ }));
    await user.click(screen.getByRole('button', { name: 'Create room' }));

    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [
          expect.objectContaining({
            gameType: 'pairs',
            maxPlayers: 6,
            settings: { board: 'Large' },
          }),
        ],
      }),
    );
  });

  it('makes a Trios room of the length picked, with up to eight seats', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/trios/new');

    await user.click(screen.getByRole('combobox', { name: 'Trios' }));
    await user.click(await screen.findByRole('option', { name: '20 trios' }));
    await user.click(screen.getByRole('button', { name: 'Create room' }));

    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [
          expect.objectContaining({
            gameType: 'trios',
            maxPlayers: 8,
            settings: { trios: 20 },
          }),
        ],
      }),
    );
  });

  it('names a room after its host while the suggested name is kept', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/snap/new');
    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByLabelText('Room name')).toHaveValue('Ryan’s room');
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [expect.objectContaining({ roomName: '' })],
      }),
    );
  });

  it('makes a Snap room in one click, with up to six seats', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/snap/new');
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Create room' }));

    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [
          expect.objectContaining({
            gameType: 'snap',
            maxPlayers: 6,
            settings: {},
          }),
        ],
      }),
    );
  });

  it('says so when the server holds all the rooms it can', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/minesweeper/new');
    fake.answer('room:create', () => ({
      ok: false as const,
      error: { type: 'tooManyRooms' as const, message: 'tooManyRooms' },
    }));
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    expect(
      await screen.findByText(/^Zumpo is full right now\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create room' }),
    ).toBeInTheDocument();
  });
});

describe('making a Hush room', () => {
  it('keeps its seats in view, and says what they mean for the game', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/hush/new');
    expect(screen.getByRole('combobox', { name: 'Seats' })).toBeVisible();
    expect(
      screen.getByText('2 players play 7 levels, 4 play 5.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Board' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getAllByRole('combobox', { name: 'Seats' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Create room' }));
    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [
          expect.objectContaining({
            gameType: 'hush',
            maxPlayers: 4,
            settings: {},
          }),
        ],
      }),
    );
  });
});

describe('making a Doodle Chain room', () => {
  it('asks for the drawing time, and three seats or more', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/doodle-chain/new');
    expect(
      screen.getByText('Writing takes 30s, describing 45s.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('combobox', { name: 'Seats' }));
    expect(
      (await screen.findAllByRole('option')).map(
        (option) => option.textContent,
      ),
    ).toEqual([
      '3 players',
      '4 players',
      '5 players',
      '6 players',
      '7 players',
      '8 players',
    ]);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('combobox', { name: 'Drawing time' }));
    await user.click(await screen.findByRole('option', { name: '90 seconds' }));
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [
          expect.objectContaining({
            gameType: 'doodle-chain',
            maxPlayers: 8,
            settings: { drawingSeconds: 90 },
          }),
        ],
      }),
    );
  });
});

describe('on a phone', () => {
  it('lists the games under a heading per kind', async () => {
    onPhone();
    await renderApp('/');
    expect(screen.getByText('A little play')).toBeInTheDocument();
    expect(
      screen.getByText('Good games for good company.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Let’s play' })).toBeNull();
    const party = screen.getByRole('region', { name: 'Party' });
    expect(
      within(party)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Doodle Chain', 'Draw & Guess', 'Hush', 'Liar’s Dice']);
    expect(
      within(party).getByText('Draw, bluff and read the room.'),
    ).toBeInTheDocument();
  });

  it('filters to one kind', async () => {
    onPhone();
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Spot & remember' }));
    expect(screen.queryByRole('region', { name: 'Party' })).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Spot & remember' }),
    ).toBeInTheDocument();
  });

  it('shows a game’s page whole, its rules included', async () => {
    onPhone();
    const { fake } = await renderApp('/games/minesweeper');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Minesweeper' }),
    ).toBeInTheDocument();
    act(() => fake.serverEmits('lobby:rooms', 'minesweeper', [lobbyRoom]));
    expect(screen.getByText('1 room · Updates live')).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'How to play' }),
    ).toBeInTheDocument();
  });

  it('makes a room straight on the page', async () => {
    onPhone();
    await renderApp('/games/minesweeper/new');
    expect(
      screen.getByRole('heading', { level: 1, name: 'New Minesweeper room' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Pick a board. Small is a quick game; Large takes a while.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('form', { name: 'New Minesweeper room' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'More options' }),
    ).toBeInTheDocument();
  });
});
