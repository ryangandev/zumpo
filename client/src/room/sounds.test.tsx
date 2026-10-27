import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AnyRoomState,
  DrawAndGuessGameSummary,
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
  isNewRoomGame,
  newGameBegan,
  useDeadlineTicks,
  useRoomClosedSound,
  winnersOf,
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
  { turn = null, lost = false, connection = 1 }: Partial<RoomSoundView> = {},
): RoomSoundView => ({ state, turn, lost, connection });

/** What one change from `prev` to `next` plays for `viewer`, guard aside. */
const heard = (prev: RoomSoundView, next: RoomSoundView, viewer = ME) =>
  deriveRoomSounds(viewer)(prev, next);

/** A guard over the room's sounds, as the page keeps one. */
const guard = (viewer = ME) =>
  createReplayGuard(deriveRoomSounds(viewer), { isNewGame: isNewRoomGame });

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
    expect(heard(view(lobby), view(mine))).toEqual([
      { sound: 'room-stamp', key: `ready:${ME}` },
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

  it('has no result to sound for a game cut short, or found ended', () => {
    const cut = drawAndGuessState({
      lastGame: summary({ [ME]: 40 }, true),
    });
    expect(heard(view(playing), view(cut))).toEqual([]);
    const ended = drawAndGuessState({ lastGame: summary({ [ME]: 40 }) });
    expect(heard(view(ended), view(ended))).toEqual([]);
  });

  it('hears a lost connection once for each connection', () => {
    expect(heard(view(playing), view(playing, { lost: true }))).toEqual([
      { sound: 'ui-connection-lost', key: 'lost:1' },
    ]);
    expect(
      heard(view(playing, { lost: true }), view(playing, { lost: true })),
    ).toEqual([]);
    expect(heard(view(playing, { lost: true }), view(playing))).toEqual([]);
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
    expect(
      sounds.observe(view(playing, { turn: null, lost: true })),
    ).toHaveLength(1); // the lost connection
    expect(sounds.observe(view(playing, { turn: '1.2' }))).toEqual([]);
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

function Clock({
  seconds,
  deadline,
}: {
  seconds: number;
  deadline: string | null;
}) {
  useDeadlineTicks(seconds, deadline);
  return null;
}

function mount(seconds: number, deadline: string | null) {
  const engine = new AudioEngine({});
  const play = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const tree = (s: number, d: string | null) => (
    <StrictMode>
      <SoundProvider engine={engine}>
        <Clock seconds={s} deadline={d} />
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
    to: (s: number, d: string | null = deadline) => page.rerender(tree(s, d)),
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
    // Paused while reconnecting, then back.
    clock.to(3, null);
    clock.to(2, '1.2:choosing');
    clock.to(1, '1.2:choosing');
    expect(clock.steps()).toEqual([3, 5]);
  });
});

function Page({ stage }: { stage: RoomStage['kind'] }) {
  useRoomClosedSound(stage);
  return null;
}

describe('useRoomClosedSound', () => {
  it('hears the room closing under a seated player, and nothing else', () => {
    const engine = new AudioEngine({});
    const play = vi
      .spyOn(engine, 'play')
      .mockImplementation(() => Promise.resolve(true));
    const tree = (stage: RoomStage['kind']) => (
      <SoundProvider engine={engine}>
        <Page stage={stage} />
      </SoundProvider>
    );
    const page = render(tree('connecting'));
    page.rerender(tree('closed'));
    expect(play).not.toHaveBeenCalled();
    page.rerender(tree('seated'));
    page.rerender(tree('closed'));
    expect(play.mock.calls.map(([spec]) => spec.id)).toEqual([
      'ui-connection-lost',
    ]);
  });
});
