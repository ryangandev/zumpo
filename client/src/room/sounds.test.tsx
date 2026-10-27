import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AnyRoomState,
  DrawAndGuessGameSummary,
  DrawAndGuessRoomState,
} from '../../../shared/wire-types';
import { createReplayGuard, SoundProvider } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import type { RoomStage } from '../net/use-room';
import {
  drawAndGuessState,
  gomokuState,
  hushState,
  doodleChainState,
  liarsDiceState,
  ME,
} from '../tests/fixtures';
import {
  deriveRoomSounds,
  gameSounds,
  LOST_AFTER_MS,
  newGameBegan,
  NO_GAME_SOUNDS,
  roomSoundRules,
  useConnectionLostSound,
  useDeadlineTicks,
  winnersOf,
  type GameSounds,
  type RoomSoundView,
} from './sounds';

const MAYA = 'p2';
const LEO = 'p3';

const seat = (username: string, points = 0, isConnected = true) => ({
  username,
  points,
  isConnected,
});

const lobby = drawAndGuessState();

const view = (
  state: AnyRoomState,
  { turn = null, connection = 1, readied = 0 }: Partial<RoomSoundView> = {},
): RoomSoundView => ({ state, turn, connection, readied });

/** What one change from `prev` to `next` plays for `viewer`, guard aside. */
const heard = (prev: RoomSoundView, next: RoomSoundView, viewer = ME) =>
  deriveRoomSounds(viewer)(prev, next);

/** The one guard over a room and its game, as `RoomLayout` keeps it. */
const guard = (viewer = ME, game: GameSounds = NO_GAME_SOUNDS) => {
  const rules = roomSoundRules(viewer, game);
  return createReplayGuard(rules.derive, rules);
};

const summary = (
  points: Record<string, number>,
  endedEarly = false,
): DrawAndGuessGameSummary => ({
  endedEarly,
  standings: Object.entries(points)
    .map(([playerId, p]) => ({ playerId, username: playerId, points: p }))
    .toSorted((a, b) => b.points - a.points),
  wordCategory: 'Animals',
  rounds: 1,
  turns: 2,
});

const playing = drawAndGuessState({
  isGameStarted: true,
  phase: 'reveal',
  currentRound: 1,
  turn: 2,
  wordCategory: 'Animals',
});

describe('the room sounds', () => {
  it('hears somebody else arrive and go, softly, at the table or watching', () => {
    const joined = drawAndGuessState({
      playerList: { ...lobby.playerList, [LEO]: seat('Leo') },
    });
    expect(heard(view(lobby), view(joined))).toEqual([
      { sound: 'room-join', key: `join:${LEO}`, other: true },
    ]);
    const watching = drawAndGuessState({
      spectators: { [LEO]: seat('Leo') },
    });
    expect(heard(view(lobby), view(watching))).toEqual([
      { sound: 'room-join', key: `join:${LEO}`, other: true },
    ]);
    expect(heard(view(joined), view(lobby))).toEqual([
      { sound: 'room-leave', key: `leave:${LEO}`, other: true },
    ]);
  });

  it('is silent for a dropped connection, a move to watch, and the viewer', () => {
    const away = drawAndGuessState({
      playerList: { ...lobby.playerList, [MAYA]: seat('Maya', 0, false) },
    });
    expect(heard(view(lobby), view(away))).toEqual([]);
    const moved = drawAndGuessState({
      playerList: { [ME]: lobby.playerList[ME]! },
      spectators: { [MAYA]: seat('Maya') },
    });
    expect(heard(view(lobby), view(moved))).toEqual([]);
    const alone = drawAndGuessState({ playerList: {} });
    expect(heard(view(alone), view(lobby), MAYA).map((e) => e.key)).toEqual([
      `join:${ME}`,
    ]);
  });

  it('stamps the viewer’s own Ready and pips somebody else’s', () => {
    const mine = drawAndGuessState({ ready: [ME] });
    const both = drawAndGuessState({ ready: [ME, MAYA] });
    expect(heard(view(lobby), view(mine, { readied: 1 }))).toEqual([
      { sound: 'room-stamp', key: `ready:${ME}:1` },
    ]);
    expect(heard(view(mine), view(both))).toEqual([
      { sound: 'room-pip', key: `ready:${MAYA}`, other: true },
    ]);
    // Taking it back is silent.
    expect(heard(view(both), view(mine))).toEqual([]);
    // A spectator only hears the others.
    expect(heard(view(lobby), view(both), LEO)).toEqual([
      { sound: 'room-pip', key: `ready:${ME}`, other: true },
      { sound: 'room-pip', key: `ready:${MAYA}`, other: true },
    ]);
  });

  it('starts the game for everybody, and gives the first go its own sound', () => {
    const started = drawAndGuessState({
      isGameStarted: true,
      phase: 'choosing',
      currentRound: 1,
      turn: 1,
      currentDrawer: MAYA,
    });
    expect(heard(view(lobby), view(started))).toEqual([
      { sound: 'stinger-game-start', key: 'start' },
    ]);
    expect(heard(view(lobby), view(started), LEO)).toEqual([
      { sound: 'stinger-game-start', key: 'start' },
    ]);
    // Maya draws first: her go, not the start over it.
    expect(heard(view(lobby), view(started, { turn: '1.1' }), MAYA)).toEqual([
      { sound: 'room-your-turn', key: 'turn:1.1' },
    ]);
  });

  it('plays the viewer’s go once, when it becomes theirs', () => {
    const mine = view(playing, { turn: '1.2' });
    expect(heard(view(playing), mine)).toEqual([
      { sound: 'room-your-turn', key: 'turn:1.2' },
    ]);
    expect(heard(mine, view(playing, { turn: '1.2' }))).toEqual([]);
    expect(heard(mine, view(playing))).toEqual([]);
  });

  it('ends a game with a win for the winners and a kind cadence for the rest', () => {
    const ended = drawAndGuessState({
      lastGame: summary({ [ME]: 120, [MAYA]: 80 }),
    });
    expect(heard(view(playing), view(ended))).toEqual([
      { sound: 'stinger-win', key: `end:full:${ME}=120,${MAYA}=80` },
    ]);
    expect(heard(view(playing), view(ended), MAYA)).toEqual([
      { sound: 'stinger-nice-game', key: `end:full:${ME}=120,${MAYA}=80` },
    ]);
    // A spectator won nothing.
    expect(heard(view(playing), view(ended), LEO).map((e) => e.sound)).toEqual([
      'stinger-nice-game',
    ]);
    // A shared win is a win for both.
    const tied = drawAndGuessState({
      lastGame: summary({ [ME]: 90, [MAYA]: 90 }),
    });
    expect(heard(view(playing), view(tied), MAYA).map((e) => e.sound)).toEqual([
      'stinger-win',
    ]);
  });

  it('gives everybody at the table the win when nobody scored', () => {
    const nil = drawAndGuessState({
      lastGame: summary({ [ME]: 0, [MAYA]: 0 }),
    });
    expect(winnersOf(nil)).toEqual([ME, MAYA]);
    expect(heard(view(playing), view(nil), MAYA).map((e) => e.sound)).toEqual([
      'stinger-win',
    ]);
    // Watching, still nothing won.
    expect(heard(view(playing), view(nil), LEO).map((e) => e.sound)).toEqual([
      'stinger-nice-game',
    ]);
  });

  it('has no result to sound for a game cut short, or found ended', () => {
    const cut = drawAndGuessState({
      lastGame: summary({ [ME]: 40 }, true),
    });
    expect(heard(view(playing), view(cut))).toEqual([]);
    const ended = drawAndGuessState({ lastGame: summary({ [ME]: 40 }) });
    expect(heard(view(ended), view(ended))).toEqual([]);
  });

  it('names who won each game as its results do', () => {
    const hush = (won: boolean) =>
      hushState({
        lastGame: {
          endedEarly: false,
          standings: [
            { playerId: ME, username: 'Ryan', points: 3 },
            { playerId: MAYA, username: 'Maya', points: 3 },
          ],
          levels: 7,
          levelsCleared: won ? 7 : 3,
          won,
          lives: won ? 1 : 0,
          history: [],
          held: [],
        },
      });
    expect(winnersOf(hush(true))).toEqual([ME, MAYA]);
    expect(winnersOf(hush(false))).toEqual([]);

    const colors = {
      black: { playerId: ME, username: 'Ryan' },
      white: { playerId: MAYA, username: 'Maya' },
    };
    const gomoku = (winner: 'black' | 'white' | null) =>
      gomokuState({
        colors,
        lastGame: {
          endedEarly: false,
          // Points are games won here, which do not say who won this one.
          standings: [
            { playerId: ME, username: 'Ryan', points: 2 },
            { playerId: MAYA, username: 'Maya', points: 1 },
          ],
          ending: 'five',
          winner,
          stones: 30,
        },
      });
    expect(winnersOf(gomoku('white'))).toEqual([MAYA]);
    expect(winnersOf(gomoku(null))).toEqual([]);

    const dice = liarsDiceState({
      lastGame: {
        endedEarly: false,
        dicePerPlayer: 5,
        rounds: 8,
        standings: [
          { playerId: MAYA, username: 'Maya', points: 2, out: null },
          { playerId: ME, username: 'Ryan', points: 0, out: 8 },
        ],
      } as never,
    });
    expect(winnersOf(dice)).toEqual([MAYA]);
  });

  it('leaves the end of a Doodle Chain game to its album', () => {
    const chain = doodleChainState({ isGameStarted: true });
    const album = doodleChainState({
      lastGame: {
        endedEarly: false,
        standings: [{ playerId: ME, username: 'Ryan', points: 2 }],
        chains: [],
        favourites: [],
      },
    });
    expect(heard(view(chain), view(album))).toEqual([]);
  });
});

describe('the room sounds through the replay guard', () => {
  const joined = drawAndGuessState({
    playerList: { ...lobby.playerList, [LEO]: seat('Leo') },
  });

  it('plays nothing on arrival, for a repeated snapshot, or a reconnection', () => {
    const sounds = guard();
    expect(sounds.observe(view(joined))).toEqual([]);
    expect(sounds.observe(view({ ...joined }))).toEqual([]);
    // Back on a new connection: Leo left and somebody else is ready, while
    // the page was away; that is only the new baseline.
    const away = drawAndGuessState({ ready: [MAYA] });
    expect(sounds.observe(view(away, { connection: 2 }), true)).toEqual([]);
  });

  it('never plays a go twice, though the turn drops while reconnecting', () => {
    const sounds = guard();
    sounds.observe(view(playing));
    expect(sounds.observe(view(playing, { turn: '1.2' }))).toHaveLength(1);
    // A game that names the go only while connected drops it, and names it
    // again before the next snapshot.
    expect(sounds.observe(view(playing, { turn: null }))).toEqual([]);
    expect(sounds.observe(view(playing, { turn: '1.2' }))).toEqual([]);
  });

  it('has heard the go a page arrives on, or comes back to', () => {
    const sounds = guard();
    sounds.observe(view(playing, { turn: '1.2' }));
    expect(sounds.observe(view(playing, { turn: null }))).toEqual([]);
    expect(sounds.observe(view(playing, { turn: '1.2' }))).toEqual([]);
    sounds.observe(view(playing, { turn: '1.3', connection: 2 }), true);
    expect(sounds.observe(view(playing, { turn: null }))).toEqual([]);
    expect(sounds.observe(view(playing, { turn: '1.3' }))).toEqual([]);
  });

  it('hears who comes and goes between games afresh after each game', () => {
    const sounds = guard();
    const withLeo = { ...lobby.playerList, [LEO]: seat('Leo') };
    const started = drawAndGuessState({ ...playing, playerList: withLeo });
    sounds.observe(view(started));
    // Leo leaves during the game, which ends; he comes back to the lobby
    // and leaves again before the next one.
    sounds.observe(view(playing));
    const over = drawAndGuessState({ lastGame: summary({ [ME]: 10 }) });
    sounds.observe(view(over));
    const back = drawAndGuessState({ ...over, playerList: withLeo });
    expect(sounds.observe(view(back)).map((e) => e.sound)).toEqual([
      'room-join',
    ]);
    expect(sounds.observe(view(over)).map((e) => e.sound)).toEqual([
      'room-leave',
    ]);
  });

  it('stamps each Ready of the viewer’s, and pips each other player once a game', () => {
    const sounds = guard();
    const mine = drawAndGuessState({ ready: [ME] });
    const hers = drawAndGuessState({ ready: [MAYA] });
    sounds.observe(view(lobby));
    expect(sounds.observe(view(lobby, { readied: 1 }))).toEqual([]);
    expect(sounds.observe(view(mine, { readied: 1 }))).toHaveLength(1);
    // Taken back, and said again: a second press, heard again.
    expect(sounds.observe(view(lobby, { readied: 1 }))).toEqual([]);
    expect(sounds.observe(view(lobby, { readied: 2 }))).toEqual([]);
    expect(sounds.observe(view(mine, { readied: 2 }))).toEqual([
      { sound: 'room-stamp', key: `ready:${ME}:2` },
    ]);
    // Maya's, taken back and said again, is heard the first time only.
    expect(sounds.observe(view(hers, { readied: 2 }))).toHaveLength(1);
    sounds.observe(view(lobby, { readied: 2 }));
    expect(sounds.observe(view(hers, { readied: 2 }))).toEqual([]);
  });

  it('forgets its keys when a new game starts', () => {
    const started = drawAndGuessState({
      ...playing,
      phase: 'choosing',
      turn: 1,
    });
    const sounds = guard();
    sounds.observe(view(lobby));
    expect(sounds.observe(view(started))).toHaveLength(1);
    sounds.observe(
      view(drawAndGuessState({ lastGame: summary({ [ME]: 10, [MAYA]: 5 }) })),
    );
    expect(sounds.observe(view(started)).map((e) => e.sound)).toEqual([
      'stinger-game-start',
    ]);
  });

  it('tells a game that passed unseen from what is left behind', () => {
    const first = drawAndGuessState({ lastGame: summary({ [ME]: 10 }) });
    const second = drawAndGuessState({ lastGame: summary({ [ME]: 30 }) });
    expect(newGameBegan(lobby, playing)).toBe(true);
    expect(newGameBegan(playing, first)).toBe(false);
    expect(newGameBegan(first, { ...first })).toBe(false);
    expect(newGameBegan(first, second)).toBe(true);
    expect(newGameBegan(lobby, first)).toBe(true);
  });
});

/**
 * A game of turns for the one guard: each turn somebody else takes is a soft
 * pip of the game's own, and its turns count up through a game.
 */
const turns = gameSounds<DrawAndGuessRoomState>({
  derive: () => (prev, next) =>
    next.isGameStarted && next.turn > prev.turn
      ? [{ sound: 'room-pip', key: `move:${next.turn}`, other: true }]
      : [],
  isNewGame: (prev, next) => next.turn < prev.turn,
  turnOf: (state) => String(state.turn),
});

const atTurn = (turn: number, extra: Partial<DrawAndGuessRoomState> = {}) =>
  drawAndGuessState({ ...playing, phase: 'drawing', turn, ...extra });

describe('one guard for a room and its game', () => {
  it('lets your go stand alone over the game’s sounds on its snapshot', () => {
    const sounds = guard(ME, turns);
    sounds.observe(view(atTurn(1)));
    // Somebody else's turn: the game's pip.
    expect(sounds.observe(view(atTurn(2)))).toEqual([
      { sound: 'room-pip', key: 'game:move:2', other: true },
    ]);
    // Their move hands the go to the viewer, and Leo arrives: the go and
    // the arrival, not the move.
    const withLeo = { ...playing.playerList, [LEO]: seat('Leo') };
    const joined = atTurn(3, { playerList: withLeo });
    expect(sounds.observe(view(joined, { turn: '3' }))).toEqual([
      { sound: 'room-join', key: `join:${LEO}`, other: true },
      { sound: 'room-your-turn', key: 'turn:3' },
    ]);
    // The move dropped was heard all the same: never played later.
    expect(sounds.observe(view(atTurn(2, { playerList: withLeo })))).toEqual(
      [],
    );
    expect(sounds.observe(view(joined, { turn: '3' }))).toEqual([]);
  });

  it('lets the start and the end stand alone too', () => {
    const sounds = guard(ME, turns);
    sounds.observe(view(lobby));
    expect(sounds.observe(view(atTurn(1)))).toEqual([
      { sound: 'stinger-game-start', key: 'start' },
    ]);
    sounds.observe(view(atTurn(4)));
    // A game whose last move ends it in the same snapshot: only the end.
    const ended = drawAndGuessState({
      ...atTurn(5),
      isGameStarted: false,
      lastGame: summary({ [ME]: 30 }),
    });
    expect(sounds.observe(view(ended)).map((e) => e.sound)).toEqual([
      'stinger-win',
    ]);
  });

  it('keeps the game’s keys apart, and its hands off the room’s sounds', () => {
    const greedy = gameSounds<DrawAndGuessRoomState>({
      derive: () => (prev, next) =>
        next.turn > prev.turn
          ? [
              { sound: 'room-reveal', key: 'start' },
              { sound: 'stinger-win', key: `win:${next.turn}` },
            ]
          : [],
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sounds = guard(ME, greedy);
    sounds.observe(view(atTurn(1)));
    // The game's own `start` is not the room's, and its stinger is dropped,
    // with a word for whoever wrote it.
    expect(sounds.observe(view(atTurn(2)))).toEqual([
      { sound: 'room-reveal', key: 'game:start' },
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('stinger-win'));
    warn.mockRestore();
  });

  it('asks the game for a new game only across a reconnection', () => {
    const sounds = guard(ME, turns);
    sounds.observe(view(atTurn(4)));
    sounds.observe(view(atTurn(5)));
    // On one connection a snapshot from earlier in the game is not a new
    // game, and turn 5 is not heard again after it.
    expect(sounds.observe(view(atTurn(3)))).toEqual([]);
    expect(sounds.observe(view(atTurn(5)))).toEqual([]);
    // Back on a new connection in another game, unseen: its turn 5 is news.
    sounds.observe(view(atTurn(2), { connection: 2 }), true);
    sounds.observe(view(atTurn(4), { connection: 2 }));
    expect(sounds.observe(view(atTurn(5), { connection: 2 }))).toHaveLength(1);
  });

  it('keeps the keys across a reconnection into the same game', () => {
    const sounds = guard(ME, turns);
    sounds.observe(view(atTurn(4)));
    sounds.observe(view(atTurn(5)));
    sounds.observe(view(atTurn(5), { connection: 2 }), true);
    expect(sounds.observe(view(atTurn(4), { connection: 2 }))).toEqual([]);
    expect(sounds.observe(view(atTurn(5), { connection: 2 }))).toEqual([]);
  });
});

function Clock({
  seconds,
  deadline,
  paused,
}: {
  seconds: number;
  deadline: string | null;
  paused: boolean;
}) {
  useDeadlineTicks({ seconds, deadline, paused });
  return null;
}

function mount(seconds: number, deadline: string | null) {
  const engine = new AudioEngine({});
  const play = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const tree = (s: number, d: string | null, paused = false) => (
    <StrictMode>
      <SoundProvider engine={engine}>
        <Clock seconds={s} deadline={d} paused={paused} />
      </SoundProvider>
    </StrictMode>
  );
  const page = render(tree(seconds, deadline));
  const steps = () =>
    play.mock.calls.map(([spec, options]: [SoundSpec, PlayOptions?]) => {
      expect(spec.id).toBe('room-tick');
      return options?.variant;
    });
  return {
    to: (s: number, d: string | null = deadline, paused = false) =>
      page.rerender(tree(s, d, paused)),
    steps,
  };
}

describe('useDeadlineTicks', () => {
  it('ticks each of the last five seconds, rising', () => {
    const clock = mount(8, '1.1:drawing');
    for (const s of [7, 6, 5, 4, 3, 2, 1, 0]) clock.to(s);
    expect(clock.steps()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not tick the second it arrives at, nor one already ticked', () => {
    const clock = mount(3, '1.1:drawing');
    clock.to(2);
    // A snapshot puts the clock back a second.
    clock.to(3);
    clock.to(2);
    clock.to(1);
    expect(clock.steps()).toEqual([4, 5]);
  });

  it('stays quiet with no deadline to act in, and starts over for a new one', () => {
    const clock = mount(6, null);
    for (const s of [5, 4]) clock.to(s);
    expect(clock.steps()).toEqual([]);
    // The deadline becomes this player's at 4 seconds left: a baseline.
    clock.to(4, '1.2:choosing');
    clock.to(3, '1.2:choosing');
    // None to act in for a moment, then back: a baseline again.
    clock.to(3, null);
    clock.to(2, '1.2:choosing');
    clock.to(1, '1.2:choosing');
    expect(clock.steps()).toEqual([3, 5]);
  });

  it('holds still while paused, and comes back to a baseline', () => {
    const clock = mount(6, '1.1:drawing');
    clock.to(5);
    // The connection drops: the clock holds, and nothing ticks.
    clock.to(4, '1.1:drawing', true);
    clock.to(3, '1.1:drawing', true);
    // Back at 3 seconds left: where the clock stands, then on.
    clock.to(3);
    clock.to(2);
    expect(clock.steps()).toEqual([1, 4]);
  });
});

function Page({ stage }: { stage: RoomStage }) {
  useConnectionLostSound(stage);
  return null;
}

const seated = (reconnecting: boolean): RoomStage => ({
  kind: 'seated',
  snapshot: { state: lobby, receivedAt: 0, connection: 1 },
  reconnecting,
});

function mountPage(stage: RoomStage) {
  const engine = new AudioEngine({});
  const play = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const tree = (s: RoomStage) => (
    <StrictMode>
      <SoundProvider engine={engine}>
        <Page stage={s} />
      </SoundProvider>
    </StrictMode>
  );
  const page = render(tree(stage));
  return {
    to: (s: RoomStage) => page.rerender(tree(s)),
    heard: () => play.mock.calls.length,
    unmount: page.unmount,
  };
}

describe('useConnectionLostSound', () => {
  it('hears a drop that lasts, each time, and not one that comes back at once', () => {
    vi.useFakeTimers();
    const page = mountPage(seated(false));
    // A phone back from another app: down for a second, then back.
    page.to(seated(true));
    vi.advanceTimersByTime(LOST_AFTER_MS - 100);
    page.to(seated(false));
    vi.advanceTimersByTime(5_000);
    expect(page.heard()).toBe(0);
    // Two drops that last, the second before any new snapshot.
    page.to(seated(true));
    vi.advanceTimersByTime(LOST_AFTER_MS);
    expect(page.heard()).toBe(1);
    page.to(seated(false));
    page.to(seated(true));
    vi.advanceTimersByTime(LOST_AFTER_MS);
    expect(page.heard()).toBe(2);
    // Gone from the page before it lasts: nothing later.
    page.to(seated(false));
    page.to(seated(true));
    page.unmount();
    vi.advanceTimersByTime(LOST_AFTER_MS);
    expect(page.heard()).toBe(2);
    vi.useRealTimers();
  });

  it('hears the room closing at once, and only once', () => {
    vi.useFakeTimers();
    const page = mountPage({ kind: 'connecting' });
    page.to({ kind: 'closed' });
    expect(page.heard()).toBe(0);
    page.to(seated(false));
    page.to({ kind: 'closed' });
    expect(page.heard()).toBe(1);
    // Closed while a drop was still waiting: heard at once, not twice.
    page.to(seated(false));
    page.to(seated(true));
    page.to({ kind: 'closed' });
    vi.advanceTimersByTime(LOST_AFTER_MS);
    expect(page.heard()).toBe(2);
    // Closed after a drop already heard: not another loss.
    page.to(seated(false));
    page.to(seated(true));
    vi.advanceTimersByTime(LOST_AFTER_MS);
    page.to({ kind: 'closed' });
    expect(page.heard()).toBe(3);
    vi.useRealTimers();
  });
});
