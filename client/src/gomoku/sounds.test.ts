import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GomokuColor,
  GomokuMove,
  GomokuRoomState,
} from '../../../shared/wire-types';
import { BESIDE_AFTER_MS, createReplayGuard } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import { roomPath } from '../games/catalog';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { deriveSoloSounds, endAlone } from '../solo/sounds';
import { gomokuState, ME } from '../tests/fixtures';
import { FakeSocket } from '../tests/fake-socket';
import { onTouch } from '../tests/phone';
import { renderApp } from '../tests/render-app';
import { THINKING_MS } from './solo/computer';
import { newGame, play, takeBack, type SoloGame } from './solo/game';
import {
  actingDeadline,
  deriveGomokuSolo,
  deriveGomokuSounds,
  GOMOKU_SOUNDS,
  isNewGomokuGame,
  turnOf,
} from './sounds';

// The computer's best move every time, worked out here rather than in a worker.
vi.mock('./solo/think', async () => {
  const { chooseMove } = await import('./solo/computer');
  return {
    think: (...args: Parameters<typeof chooseMove>) =>
      Promise.resolve(chooseMove(args[0], args[1], args[2], () => 0)),
  };
});

const MAYA = 'p2';
const LEO = 'p3';
const WATCHER = 'p9';

const seat = (username: string, points = 0) => ({
  username,
  points,
  isConnected: true,
});

const sides = {
  playerList: { [ME]: seat('Ryan'), [MAYA]: seat('Maya') },
  spectators: { [WATCHER]: seat('Sam') },
};

const pair = (black: string, white: string) => ({
  black: { playerId: black, username: black },
  white: { playerId: white, username: white },
});

/** Stones of alternating colours, Black first, on points 0, 1, 2, ... */
const stones = (count: number): GomokuMove[] =>
  Array.from({ length: count }, (_, index) => ({
    color: index % 2 === 0 ? ('black' as const) : ('white' as const),
    point: index,
  }));

/** Ryan (Black) and Maya (White), game `gameNumber`, `moves` in. */
const game = (
  gameNumber: number,
  moves: GomokuMove[] | number,
  overrides: Partial<GomokuRoomState> = {},
) => {
  const list = typeof moves === 'number' ? stones(moves) : moves;
  return gomokuState({
    ...sides,
    isGameStarted: true,
    phase: 'playing',
    gameNumber,
    colors: pair(ME, MAYA),
    moves: list,
    turnPlayerId: list.length % 2 === 0 ? ME : MAYA,
    missedTurns: {},
    phaseEndsInMs: 30_000,
    ...overrides,
  });
};

/** A turn lost to the clock, by `color`. */
const lost = (color: GomokuColor): GomokuMove => ({ color, point: null });

const heard = (prev: GomokuRoomState, next: GomokuRoomState, viewer = ME) =>
  deriveGomokuSounds(viewer)(prev, next);

const viewOf = (
  state: GomokuRoomState,
  viewer: string,
  connection: number,
): RoomSoundView => ({
  state,
  // The viewer's go while it is theirs, as the room names it.
  turn:
    state.isGameStarted && state.turnPlayerId === viewer ? turnOf(state) : null,
  connection,
  readied: 0,
});

/** The events of each snapshot the room hears, with their delays. */
const timedGuard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, GOMOKU_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: GomokuRoomState, connection = 1, resync = false) =>
    inner.observe(viewOf(state, viewer, connection), resync);
};

const guard = (viewer = ME) => {
  const timed = timedGuard(viewer);
  return (state: GomokuRoomState, connection = 1, resync = false) =>
    timed(state, connection, resync).map((e) => e.sound);
};

describe('a Gomoku room’s goes and games', () => {
  it('names each go by the turns taken, a turn lost to the clock included', () => {
    expect(turnOf(game(1, 0))).toBe('0');
    expect(turnOf(game(1, 7))).toBe('7');
    expect(turnOf(game(1, [...stones(7), lost('white')]))).toBe('8');
  });

  it('tells another game by its number or its pair', () => {
    expect(isNewGomokuGame(game(1, 12), game(2, 3))).toBe(true);
    // A new pair counts from 1 again.
    expect(
      isNewGomokuGame(game(1, 12), game(1, 3, { colors: pair(LEO, MAYA) })),
    ).toBe(true);
    expect(
      isNewGomokuGame(game(1, 12), game(1, 3, { colors: pair(MAYA, ME) })),
    ).toBe(true);
    expect(isNewGomokuGame(game(2, 3), game(2, 9))).toBe(false);
  });

  it('ticks only for the player whose move it is', () => {
    expect(actingDeadline(game(1, 4), ME)).toBe('4:playing');
    expect(actingDeadline(game(1, 4), MAYA)).toBeNull();
    expect(actingDeadline(game(1, 5), MAYA)).toBe('5:playing');
    expect(actingDeadline(game(1, 4), WATCHER)).toBeNull();
    expect(actingDeadline(gomokuState(sides), ME)).toBeNull();
  });
});

describe('a Gomoku room, heard', () => {
  it('places each stone once: yours at full level, your opponent’s and a spectator’s softer', () => {
    const next = game(1, 3);
    expect(heard(game(1, 2), next)).toEqual([
      { sound: 'gomoku-stone', key: 'stone:2', other: false },
    ]);
    // Black's stone hands Maya the go, so hers plays beside her "your turn".
    expect(heard(game(1, 2), next, MAYA)).toEqual([
      { sound: 'gomoku-stone', key: 'stone:2', other: true, beside: true },
    ]);
    expect(heard(game(1, 2), next, WATCHER)[0]?.other).toBe(true);
    // Nothing new: the same stones again.
    expect(heard(next, { ...next })).toEqual([]);
  });

  it('hears several stones that arrive together as one sound, yours if any is', () => {
    const guarded = guard(ME);
    guarded(game(1, 0));
    expect(guarded(game(1, 2, { turnPlayerId: MAYA }))).toEqual([
      'gomoku-stone',
    ]);
  });

  it('warns a player whose first turn was lost, and nobody else', () => {
    const before = game(1, 4);
    const missed = game(1, [...stones(4), lost('black')], {
      missedTurns: { [ME]: 1 },
    });
    expect(heard(before, missed)).toEqual([
      { sound: 'gomoku-warning', key: 'warning:4' },
    ]);
    // Maya, whose go it now is, hears it is her go; Sam hears nothing.
    expect(heard(before, missed, MAYA)).toEqual([]);
    expect(heard(before, missed, WATCHER)).toEqual([]);
    const mine = guard(MAYA);
    mine(before);
    expect(mine(missed)).toEqual(['room-your-turn']);
  });

  it('is silent between games, which the room’s start and end cover', () => {
    expect(heard(game(1, 3), gomokuState(sides))).toEqual([]);
    expect(heard(gomokuState(sides), game(1, 0))).toEqual([]);
  });

  it('hears the stone that makes five as the game’s end, for both players', () => {
    const win = guard(ME);
    const last = game(1, 8);
    win(last);
    const five = gomokuState({
      ...sides,
      gameNumber: 1,
      colors: pair(ME, MAYA),
      moves: stones(9),
      winLines: [[0, 2, 4, 6, 8]],
      lastGame: {
        endedEarly: false,
        standings: [],
        ending: 'five',
        winner: 'black',
        stones: 9,
      },
      samePair: true,
    });
    expect(win(five)).toEqual(['gomoku-five', 'stinger-win']);
    const lose = guard(MAYA);
    lose(last);
    expect(lose(five)).toEqual(['gomoku-five', 'stinger-nice-game']);
    const watch = guard(WATCHER);
    watch(last);
    expect(watch(five)).toEqual(['gomoku-five', 'stinger-nice-game']);
    // The five lights first and the end follows it.
    const timed = timedGuard(ME);
    timed(last);
    expect(timed(five).map((e) => [e.sound, e.delayMs ?? 0])).toEqual([
      ['gomoku-five', 0],
      ['stinger-win', BESIDE_AFTER_MS.stinger],
    ]);
  });

  it('hears a game lost to the clock as its end, and a leaving player’s as none', () => {
    const second = game(1, [...stones(6), lost('white'), ...stones(0)], {
      missedTurns: { [MAYA]: 1 },
    });
    const room = guard(MAYA);
    room(second);
    const timeout = gomokuState({
      ...sides,
      gameNumber: 1,
      colors: pair(ME, MAYA),
      moves: [...second.moves, ...stones(1), lost('white')],
      missedTurns: { [MAYA]: 2 },
      lastGame: {
        endedEarly: false,
        standings: [],
        ending: 'timeout',
        winner: 'black',
        stones: 7,
      },
    });
    expect(room(timeout)).toEqual(['stinger-nice-game']);

    const left = guard(ME);
    left(second);
    expect(
      left({
        ...timeout,
        lastGame: { ...timeout.lastGame!, endedEarly: true, ending: 'left' },
      }),
    ).toEqual([]);
  });
});

describe('a Gomoku room through the replay guard', () => {
  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard(ME);
    expect(room(game(1, 2))).toEqual([]);
    expect(room(game(1, 3))).toEqual(['gomoku-stone']);
    expect(room(game(1, 4))).toEqual(['gomoku-stone', 'room-your-turn']);
    expect(room({ ...game(1, 4) })).toEqual([]);
    // Older snapshots, then the newer ones again.
    expect(room(game(1, 3))).toEqual([]);
    expect(room(game(1, 2))).toEqual([]);
    expect(room(game(1, 4))).toEqual([]);
    expect(room(game(1, 5))).toEqual(['gomoku-stone']);
  });

  it('hears an opponent’s stone that hands you the go, and your go after it', () => {
    const room = timedGuard(ME);
    room(game(1, 1));
    expect(room(game(1, 2)).map((e) => [e.sound, e.other, e.delayMs])).toEqual([
      ['gomoku-stone', true, undefined],
      ['room-your-turn', undefined, BESIDE_AFTER_MS.turn],
    ]);
    // Your own stone, then theirs.
    expect(room(game(1, 3)).map((e) => e.sound)).toEqual(['gomoku-stone']);
    expect(room(game(1, 4)).map((e) => e.sound)).toEqual([
      'gomoku-stone',
      'room-your-turn',
    ]);
  });

  it('plays only the go, at once, in a hidden tab', () => {
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    try {
      const room = timedGuard(ME);
      room(game(1, 1));
      expect(room(game(1, 2))).toEqual([
        { sound: 'room-your-turn', key: 'turn:2' },
      ]);
    } finally {
      visibility.mockRestore();
    }
  });

  it('lights no five for a game that ended otherwise', () => {
    const room = guard(ME);
    room(game(1, 8));
    const resigned = gomokuState({
      ...sides,
      gameNumber: 1,
      colors: pair(ME, MAYA),
      moves: stones(8),
      lastGame: {
        endedEarly: false,
        standings: [],
        ending: 'resigned',
        winner: 'white',
        stones: 8,
      },
    });
    expect(room(resigned)).toEqual(['stinger-nice-game']);
  });

  it('hears an opponent’s stone that does not hand you the go as itself alone', () => {
    // A spectator has no go, and a lost turn hands it on without a stone.
    const room = guard(WATCHER);
    room(game(1, 1));
    expect(room(game(1, 2))).toEqual(['gomoku-stone']);
  });

  it('takes a reconnection as a baseline, and your go on arrival as heard', () => {
    const room = guard(ME);
    room(game(1, 1));
    // Back after a drop, two stones on and the go yours.
    expect(room(game(1, 4), 2, true)).toEqual([]);
    expect(room(game(1, 4), 2)).toEqual([]);
    expect(room(game(1, 5), 2)).toEqual(['gomoku-stone']);
  });

  it('plays the next game anew, across a reconnection too', () => {
    const room = guard(MAYA);
    room(game(1, 5));
    // Away for a whole game: back in game 2, a stone in.
    expect(room(game(2, 1, { colors: pair(MAYA, ME) }), 2, true)).toEqual([]);
    expect(room(game(2, 3, { colors: pair(MAYA, ME) }), 2)).toEqual([
      'room-your-turn',
    ]);
  });
});

/** The app in a Gomoku room, with every sound it plays recorded. */
async function playRoom() {
  const engine = new AudioEngine({});
  const spy = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const fake = new FakeSocket();
  fake.answer('room:sync', () => ({ ok: true as const }));
  const view = await renderApp(roomPath('gomoku', 'r1'), { fake, engine });
  const played = () =>
    spy.mock.calls.map(([spec, options]: [SoundSpec, PlayOptions?]) =>
      [
        spec.id,
        options?.other ? 'other' : '',
        options?.variant ? `step ${options.variant}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  const send = (state: GomokuRoomState) =>
    act(() => fake.serverEmits('room:state', state));
  return { ...view, fake, played, send };
}

describe('a Gomoku room, heard in the app', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays a game for a player at the right moments, once', async () => {
    const { played, send } = await playRoom();
    send(gomokuState(sides));
    expect(played()).toEqual([]);

    // Ryan (Black) opens: his go, in place of the start. His stone, then
    // Maya's, which hands him the go again.
    send(game(1, 0));
    send(game(1, 1));
    send(game(1, 2));
    // His clock runs down: the last five seconds tick.
    for (let second = 0; second < 29; second++) {
      await act(() => vi.advanceTimersByTimeAsync(1000));
    }
    // His turn is lost to the clock: the warning, and Maya's stone after.
    send(game(1, [...stones(2), lost('black')], { missedTurns: { [ME]: 1 } }));
    send(game(1, [...stones(2), lost('black'), { color: 'white', point: 9 }]));
    await act(() => vi.advanceTimersByTimeAsync(BESIDE_AFTER_MS.turn));
    expect(played()).toEqual([
      'room-your-turn',
      'gomoku-stone',
      'gomoku-stone other',
      'room-your-turn',
      'room-tick step 1',
      'room-tick step 2',
      'room-tick step 3',
      'room-tick step 4',
      'room-tick step 5',
      'gomoku-warning',
      'gomoku-stone other',
      'room-your-turn',
    ]);
  });

  it('plays nothing it played before when the page comes back', async () => {
    const first = await playRoom();
    first.send(game(1, 2));
    first.send(game(1, 3));
    expect(first.played()).toEqual(['gomoku-stone']);
    first.unmount();

    // A refresh mid-game, on Maya's go: its first state, and the next stones.
    const again = await playRoom();
    again.send(game(1, 3));
    again.send({ ...game(1, 3) });
    expect(again.played()).toEqual([]);
    again.send(game(1, 4));
    await act(() => vi.advanceTimersByTimeAsync(BESIDE_AFTER_MS.turn));
    expect(again.played()).toEqual(['gomoku-stone other', 'room-your-turn']);
  });
});

const picks = { level: 'medium', color: 'black' } as const;

/** Black's first stones on the centre, and each answer by White. */
const fresh = (): SoloGame => newGame(picks);

describe('Gomoku on your own, heard', () => {
  it('hears your stone at full level and the computer’s softer, each once', () => {
    const start = fresh();
    const yours = play(start, 112);
    expect(deriveGomokuSolo(start, yours)).toEqual([
      { sound: 'gomoku-stone', key: 'stone:1', other: false },
    ]);
    const theirs = play(yours, 113);
    expect(deriveGomokuSolo(yours, theirs)).toEqual([
      { sound: 'gomoku-stone', key: 'stone:2', other: true },
    ]);
    expect(deriveGomokuSolo(theirs, theirs)).toEqual([]);
  });

  it('names a stone put down again after a take-back anew, and hears the take-back as nothing', () => {
    const played = play(play(fresh(), 112), 113);
    const back = takeBack(played);
    expect(deriveGomokuSolo(played, back)).toEqual([]);
    // The same point again, in the same place in the game: not the same stone.
    const again = play(back, 112);
    expect(deriveGomokuSolo(back, again)).toEqual([
      { sound: 'gomoku-stone', key: 'stone:3', other: false },
    ]);
    const run = createReplayGuard(deriveSoloSounds(deriveGomokuSolo), {
      isNewGame: () => false,
      select: endAlone,
    });
    const at = (state: SoloGame) => run.observe({ game: state, end: null });
    at(fresh());
    expect(at(play(fresh(), 112))).toHaveLength(1);
    const two = play(play(fresh(), 112), 113);
    expect(at(two)).toHaveLength(1);
    expect(at(takeBack(two))).toHaveLength(0);
    expect(at(play(takeBack(two), 112))).toHaveLength(1);
  });

  it('hears the stone that makes five as the five, then the end, and a refresh on it not at all', () => {
    // Black has four in a row on the centre line; White has scattered stones.
    const moves: [number, number][] = [
      [112, 0],
      [0, 0],
      [113, 0],
      [2, 0],
      [114, 0],
      [4, 0],
      [115, 0],
      [6, 0],
    ];
    let state = fresh();
    for (const [point] of moves) state = play(state, point);
    const won = play(state, 116);
    expect(won.over).toBe(true);
    const run = createReplayGuard(deriveSoloSounds(deriveGomokuSolo), {
      isNewGame: () => false,
      select: endAlone,
    });
    expect(run.observe({ game: state, end: null })).toEqual([]);
    // The five lights, and the end follows it.
    expect(
      run
        .observe({ game: won, end: 'win' })
        .map((e) => [e.sound, e.delayMs ?? 0]),
    ).toEqual([
      ['gomoku-five', 0],
      ['stinger-win', BESIDE_AFTER_MS.stinger],
    ]);
    const refreshed = createReplayGuard(deriveSoloSounds(deriveGomokuSolo), {
      isNewGame: () => false,
      select: endAlone,
    });
    expect(refreshed.observe({ game: won, end: 'win' })).toEqual([]);
  });
});

/** Points far from each other on the edges, which never make five. */
const SCATTERED = [
  'A1',
  'C1',
  'E1',
  'G1',
  'I1',
  'K1',
  'M1',
  'O1',
  'A3',
  'O3',
  'A5',
  'O5',
  'A15',
  'C15',
  'E15',
];

const point = (name: string) =>
  within(screen.getByRole('grid', { name: 'Gomoku board' })).getByRole(
    'gridcell',
    { name: new RegExp(`^${name},`) },
  );

async function openSolo() {
  const engine = new AudioEngine({});
  const spy = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const played = () =>
    spy.mock.calls.map(([spec, options]: [SoundSpec, PlayOptions?]) =>
      options?.other ? `${spec.id} other` : spec.id,
    );
  const view = await renderApp('/games/gomoku/solo', { engine });
  return { ...view, played, spy };
}

describe('Gomoku on your own, heard in the app', () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('places your stone, the computer’s softer, a take-back, and the end once', async () => {
    const page = await openSolo();
    expect(page.played()).toEqual([]);
    await user.click(point('H8'));
    await act(() => vi.advanceTimersByTimeAsync(THINKING_MS));
    expect(page.played()).toEqual(['gomoku-stone', 'gomoku-stone other']);
    await user.click(point('A1'));
    await act(() => vi.advanceTimersByTimeAsync(THINKING_MS));
    page.spy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Take back' }));
    expect(page.played()).toEqual(['ui-undo']);
    // The same point in the same place again is a new stone.
    page.spy.mockClear();
    await user.click(point('A1'));
    expect(page.played()).toEqual(['gomoku-stone']);
    await act(() => vi.advanceTimersByTimeAsync(THINKING_MS));
    page.spy.mockClear();

    for (const name of SCATTERED.slice(1)) {
      if (screen.queryByText('Computer won')) break;
      await user.click(point(name));
      await act(() => vi.advanceTimersByTimeAsync(THINKING_MS));
    }
    expect(screen.getByText('Computer won')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(BESIDE_AFTER_MS.stinger));
    const after = page.played();
    expect(after.filter((id) => id.startsWith('stinger-'))).toEqual([
      'stinger-solo-loss',
    ]);
    expect(after.slice(-2)).toEqual(['gomoku-five', 'stinger-solo-loss']);

    // Play again is a new game; a refresh on it is silent.
    page.unmount();
    const again = await openSolo();
    await act(() => vi.advanceTimersByTimeAsync(THINKING_MS));
    expect(again.played()).toEqual([]);
  });

  it('puts a faint stone down on a first tap on a touch screen, then places it', async () => {
    onTouch();
    const page = await openSolo();
    await user.pointer({ keys: '[TouchA]', target: point('H8') });
    expect(page.played()).toEqual(['gomoku-faint']);
    await user.pointer({ keys: '[TouchA]', target: point('J9') });
    expect(page.played()).toEqual(['gomoku-faint', 'gomoku-faint']);
    await user.click(screen.getByRole('button', { name: 'Place stone' }));
    expect(page.played().at(-1)).toBe('gomoku-stone');
  });
});
