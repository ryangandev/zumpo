import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { MinesweeperLobbyRoomInfo } from '../../../shared/wire-types';
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
    // The word about it waits for the front door.
    expect(screen.queryByText(/We picked a name/)).toBeNull();
  });

  it('is introduced once on the front door', async () => {
    const user = userEvent.setup();
    const first = await renderApp('/', { firstVisit: true });
    const { name } = JSON.parse(localStorage.getItem('zumpo:name')!) as {
      name: string;
    };
    expect(
      screen.getByRole('dialog', { name: `You’re ${name}.` }),
    ).toHaveTextContent(
      'We picked a name so you can jump right in. Change it here anytime.',
    );

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    first.unmount();

    await renderApp('/', { name, picked: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('can be changed from the introduction', async () => {
    const user = userEvent.setup();
    await renderApp('/', { firstVisit: true });
    await user.click(screen.getByRole('button', { name: 'Change name' }));
    expect(screen.getByRole('dialog', { name: 'Your name' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveFocus();
    expect(localStorage.getItem('zumpo:name-hint')).toBe('seen');
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

  it('is shown on a game’s page, and changed from there', async () => {
    const user = userEvent.setup();
    await renderApp('/games/minesweeper');
    await user.click(screen.getByRole('button', { name: 'Playing as Ryan' }));
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
  it('lists every game by kind, then by name', async () => {
    await renderApp('/');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Pick a game' }),
    ).toBeInTheDocument();
    expect(tiles()).toEqual([
      'Doodle Chain',
      'Draw & Guess',
      'Hush',
      'Liar’s Dice',
      'Code Breaker',
      'Daily Word',
      'Make 24',
      'Minesweeper',
      'Pairs',
      'Snap',
      'Trios',
      'Gomoku',
    ]);
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

  it('is where the old games page leads', async () => {
    const { router } = await renderApp('/games');
    expect(router.state.location.pathname).toBe('/');
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

  it('gives the rules in a room and on your own, and links to them all', async () => {
    await renderApp('/games/minesweeper');
    const howToPlay = screen.getByRole('complementary', {
      name: 'How to play',
    });
    expect(
      within(howToPlay).getByRole('region', { name: 'Play together' }),
    ).toHaveTextContent('15s to pick · 4s reveal');
    expect(
      within(howToPlay).getByRole('region', { name: 'On your own' }),
    ).toHaveTextContent('Your first click is always safe');
    expect(
      within(howToPlay).getByRole('link', { name: 'Full rules' }),
    ).toHaveAttribute('href', '/how-to-play#rules-minesweeper');
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
    expect(screen.getByText('1 个房间 · 实时更新')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '你的名字：Ryan' }),
    ).toBeInTheDocument();
  });

  it('lists the rooms live and joins one', async () => {
    const user = userEvent.setup();
    const { fake, router } = await renderApp('/games/minesweeper');
    expect(fake.sentArgs('lobby:subscribe')).toEqual([['minesweeper']]);
    expect(screen.getByText('Finding your people…')).toBeInTheDocument();

    act(() => fake.serverEmits('lobby:rooms', 'minesweeper', [lobbyRoom]));
    const row = screen.getByRole('article', { name: 'Friday table' });
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

  it('ignores another game’s rooms', async () => {
    const { fake } = await renderApp('/games/minesweeper');
    act(() => fake.serverEmits('lobby:rooms', 'draw-and-guess', []));
    expect(screen.getByText('Finding your people…')).toBeInTheDocument();
  });

  it('says so when a game does not exist', async () => {
    await renderApp('/games/chess');
    expect(screen.getByText('A little lost?')).toBeInTheDocument();
  });
});

/** A game's rules on How to play, by its name. */
const rules = (name: string) => within(screen.getByRole('region', { name }));

describe('how to play', () => {
  it('offers each game its ways in beside its rules', async () => {
    await renderApp('/how-to-play');

    expect(
      rules('Draw & Guess').getByRole('link', { name: 'Find a room' }),
    ).toHaveAttribute('href', '/games/draw-and-guess');
    expect(
      rules('Draw & Guess').queryByRole('link', { name: 'Play solo' }),
    ).toBeNull();
    for (const [name, type] of [
      ['Minesweeper', 'minesweeper'],
      ['Make 24', 'make-24'],
      ['Pairs', 'pairs'],
      ['Trios', 'trios'],
      ['Snap', 'snap'],
    ]) {
      expect(
        rules(name!).getByRole('link', { name: 'Play solo' }),
      ).toHaveAttribute('href', `/games/${type}/solo`);
      expect(
        rules(name!).getByRole('link', { name: 'Find a room' }),
      ).toHaveAttribute('href', `/games/${type}`);
    }
  });
});

describe('making a room', () => {
  it('creates a room with Chinese fields, board options and validation', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/minesweeper/new', {
      locale: 'zh',
    });
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

  it('asks for a name before it sends anything', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/minesweeper/new');
    await user.clear(screen.getByLabelText('Room name'));
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    expect(screen.getByText('Give your room a name.')).toBeInTheDocument();
    expect(screen.getByLabelText('Room name')).toHaveFocus();
    expect(fake.requests).not.toContainEqual(
      expect.objectContaining({ event: 'room:create' }),
    );
  });

  it('makes a Pairs room on the board picked, with up to six seats', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/pairs/new');
    expect(screen.getByText('Choose 2–6 seats.')).toBeInTheDocument();
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
    expect(screen.getByText('Choose 2–8 seats.')).toBeInTheDocument();
    expect(screen.getByText('10 or 20 trios a game.')).toBeInTheDocument();

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
    expect(screen.getByLabelText('Room name')).toHaveValue('Ryan’s room');
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [expect.objectContaining({ roomName: '' })],
      }),
    );
  });

  it('makes a Snap room with nothing to choose but up to six seats', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/snap/new');
    expect(screen.getByText('Choose 2–6 seats.')).toBeInTheDocument();
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
  it('asks only for seats, and says what they mean for the game', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/hush/new');
    expect(
      screen.getByText('Choose 2–4 seats. 2 players play 7 levels, 4 play 5.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Board' })).toBeNull();

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

  it('offers only rooms, beside its rules', async () => {
    await renderApp('/how-to-play');
    expect(
      rules('Hush').getByRole('link', { name: 'Find a room' }),
    ).toHaveAttribute('href', '/games/hush');
    expect(rules('Hush').queryByRole('link', { name: 'Play solo' })).toBeNull();
  });
});

describe('making a Doodle Chain room', () => {
  it('asks for three seats or more, and the drawing time', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/doodle-chain/new');
    expect(screen.getByText('Choose 3–8 seats.')).toBeInTheDocument();
    expect(
      screen.getByText(
        '45, 60 or 90 seconds a drawing. Writing and describing take 30s.',
      ),
    ).toBeInTheDocument();

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

  it('offers only rooms, beside its rules', async () => {
    await renderApp('/how-to-play');
    expect(
      rules('Doodle Chain').getByRole('link', { name: 'Find a room' }),
    ).toHaveAttribute('href', '/games/doodle-chain');
    expect(
      rules('Doodle Chain').queryByRole('link', { name: 'Play solo' }),
    ).toBeNull();
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
      screen.getByRole('heading', { level: 1, name: 'A little room for you.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Make a room')).toBeInTheDocument();
    expect(screen.getByText('Minesweeper · room settings')).toBeInTheDocument();
    expect(
      screen.getByRole('form', { name: 'A little room for you.' }),
    ).toBeInTheDocument();
  });
});
