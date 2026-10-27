import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  HushGameSummary,
  HushRoomState,
  HushSeat,
} from '../../../shared/wire-types';
import { createReplayGuard, SoundProvider } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { hushState, ME } from '../tests/fixtures';
import {
  deriveHushSounds,
  HUSH_SOUNDS,
  isNewHushGame,
  LANDS_AFTER_MS,
  LIFE_BACK_AFTER_MS,
  useCountdownSounds,
} from './sounds';

const MAYA = 'p2';
const LEO = 'p3';
const WATCHER = 'p9';

const seat = (username: string, points = 0) => ({
  username,
  points,
  isConnected: true,
});

const people = {
  playerList: { [ME]: seat('Ryan'), [MAYA]: seat('Maya'), [LEO]: seat('Leo') },
  spectators: { [WATCHER]: seat('Sam') },
};

const hands = (
  ready: readonly string[] = [],
  held = 2,
): Record<string, HushSeat> =>
  Object.fromEntries(
    [ME, MAYA, LEO].map((id) => [id, { held, ready: ready.includes(id) }]),
  );

/** Level `level` of a game of 6, being played unless said otherwise. */
const levelOf = (level: number, overrides: Partial<HushRoomState> = {}) =>
  hushState({
    ...people,
    isGameStarted: true,
    phase: 'playing',
    level,
    levels: 6,
    table: hands([ME, MAYA, LEO]),
    ...overrides,
  });

const laid = (...plays: [string, number][]) =>
  plays.map(([playerId, card]) => ({ playerId, card }));

const mistakeOn = (card: number, by = MAYA) => ({
  playerId: by,
  card,
  discarded: [],
});

const clearedLevel = (level: number, lifeBack = false) => ({
  level,
  livesLost: lifeBack ? 0 : 1,
  lifeBack,
  cleared: true,
});

const heard = (prev: HushRoomState, next: HushRoomState, viewer = ME) =>
  deriveHushSounds(viewer)(prev, next);

const sounds = (prev: HushRoomState, next: HushRoomState, viewer = ME) =>
  heard(prev, next, viewer).map((e) => e.sound);

const viewOf = (state: HushRoomState, connection = 1): RoomSoundView => ({
  state,
  turn: null,
  connection,
  readied: 0,
});

const guard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, HUSH_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: HushRoomState, connection = 1, resync = false) =>
    inner.observe(viewOf(state, connection), resync).map((e) => e.sound);
};

describe('a Hush room, heard', () => {
  it('stamps your own Ready and pips everybody else’s, one level at a time', () => {
    const waiting = levelOf(2, { phase: 'ready', table: hands([MAYA]) });
    expect(
      heard(waiting, levelOf(2, { phase: 'ready', table: hands([MAYA, ME]) })),
    ).toEqual([{ sound: 'room-stamp', key: `ready:2:${ME}` }]);
    expect(
      heard(waiting, levelOf(2, { phase: 'ready', table: hands([MAYA, LEO]) })),
    ).toEqual([{ sound: 'room-pip', key: `ready:2:${LEO}`, other: true }]);
    // The Ready that completes the table and the countdown it starts arrive
    // in two snapshots back to back, and neither is heard over the 3.
    const complete = levelOf(2, {
      phase: 'ready',
      table: hands([ME, MAYA, LEO]),
    });
    expect(
      sounds(
        levelOf(2, { phase: 'ready', table: hands([MAYA, LEO]) }),
        complete,
      ),
    ).toEqual([]);
    expect(sounds(complete, levelOf(2, { phase: 'countdown' }))).toEqual([]);
    // With a player away the level waits instead, and that Ready is heard.
    expect(
      sounds(
        levelOf(2, { phase: 'ready', table: hands([ME, MAYA]) }),
        levelOf(2, {
          phase: 'ready',
          table: hands([ME, MAYA, LEO]),
          playerList: {
            ...people.playerList,
            [LEO]: { ...seat('Leo'), isConnected: false },
          },
        }),
      ),
    ).toEqual(['room-pip']);
    // A level opening with nobody ready adds nothing, nor does a spectator
    // hear a Ready of their own.
    expect(
      sounds(
        levelOf(1, { phase: 'cleared', lastLevel: clearedLevel(1) }),
        levelOf(2, { phase: 'ready', table: hands() }),
      ),
    ).toEqual([]);
    expect(
      sounds(
        waiting,
        levelOf(2, { phase: 'ready', table: hands([MAYA, LEO]) }),
        WATCHER,
      ),
    ).toEqual(['room-pip']);
  });

  it('lays each card on the pile, yours full and everybody else’s softer', () => {
    const before = levelOf(3, { pile: laid([MAYA, 12]) });
    expect(
      heard(before, levelOf(3, { pile: laid([MAYA, 12], [ME, 20]) })),
    ).toEqual([{ sound: 'hush-card', key: 'card:3:20', other: false }]);
    expect(
      heard(before, levelOf(3, { pile: laid([MAYA, 12], [LEO, 20]) })),
    ).toEqual([{ sound: 'hush-card', key: 'card:3:20', other: true }]);
    expect(
      heard(before, levelOf(3, { pile: laid([MAYA, 12], [LEO, 20]) }), WATCHER),
    ).toEqual([{ sound: 'hush-card', key: 'card:3:20', other: true }]);
    // Nothing new on the pile, nothing heard.
    expect(heard(before, { ...before })).toEqual([]);
  });

  it('thuds a beat after the card that cost a life, once, whoever laid it', () => {
    const before = levelOf(3, { pile: laid([ME, 12]) });
    const after = levelOf(3, {
      phase: 'mistake',
      lives: 2,
      pile: laid([ME, 12], [MAYA, 40]),
      lastMistake: mistakeOn(40),
    });
    expect(heard(before, after)).toEqual([
      { sound: 'hush-card', key: 'card:3:40', other: true },
      { sound: 'hush-mistake', key: 'mistake:3:40', delayMs: LANDS_AFTER_MS },
    ]);
    // The same thud for the player whose card it was, and for a spectator.
    expect(sounds(before, after, MAYA)).toEqual(['hush-card', 'hush-mistake']);
    expect(sounds(before, after, WATCHER)).toEqual([
      'hush-card',
      'hush-mistake',
    ]);
    // The pause and the resume add nothing.
    expect(heard(after, { ...after, phaseEndsInMs: 1000 })).toEqual([]);
    expect(
      heard(after, { ...after, phase: 'playing', lastMistake: null }),
    ).toEqual([]);
  });

  it('rings a cleared level a beat after its last card, and a clean one’s life back after that', () => {
    const before = levelOf(2, { pile: laid([ME, 30]) });
    const lastCard = laid([ME, 30], [MAYA, 41]);
    expect(
      heard(
        before,
        levelOf(2, {
          phase: 'cleared',
          pile: lastCard,
          lastLevel: clearedLevel(2, true),
        }),
      ),
    ).toEqual([
      { sound: 'hush-card', key: 'card:2:41', other: true },
      {
        sound: 'hush-level-cleared',
        key: 'cleared:2',
        delayMs: LANDS_AFTER_MS,
      },
      {
        sound: 'hush-life-back',
        key: 'life:2',
        delayMs: LANDS_AFTER_MS + LIFE_BACK_AFTER_MS,
      },
    ]);
    // A level a mistake discarded the last cards of has no card with it.
    const aMistake = levelOf(2, {
      phase: 'mistake',
      pile: lastCard,
      lastMistake: mistakeOn(41),
    });
    expect(
      heard(
        aMistake,
        levelOf(2, {
          phase: 'cleared',
          pile: lastCard,
          lastLevel: clearedLevel(2),
        }),
      ),
    ).toEqual([{ sound: 'hush-level-cleared', key: 'cleared:2' }]);
  });

  it('hears nothing of a pause, a drop, or the next level opening', () => {
    const playing = levelOf(2, { pile: laid([ME, 5]) });
    expect(
      heard(playing, { ...playing, phase: 'paused', phaseEndsInMs: 30_000 }),
    ).toEqual([]);
    expect(
      heard(
        { ...playing, phase: 'paused' },
        { ...playing, phase: 'countdown', phaseEndsInMs: 3000 },
      ),
    ).toEqual([]);
    // Cards thrown away with a seat that went are not played.
    expect(
      heard(playing, {
        ...playing,
        discards: [{ card: 9, playerId: LEO, reason: 'left' }],
      }),
    ).toEqual([]);
  });

  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard();
    const before = levelOf(3, { pile: laid([MAYA, 12]) });
    const after = levelOf(3, { pile: laid([MAYA, 12], [ME, 20]) });
    expect(room(before)).toEqual([]);
    expect(room(after)).toEqual(['hush-card']);
    expect(room({ ...after })).toEqual([]);
    expect(room(before)).toEqual([]);
    expect(room(after)).toEqual([]);
  });

  it('takes a reconnection as a baseline, and the next game’s first card as new', () => {
    const room = guard();
    room(levelOf(2, { pile: laid([MAYA, 8]) }));
    room(levelOf(2, { pile: laid([MAYA, 8], [ME, 15]) }));
    expect(
      room(levelOf(2, { pile: laid([MAYA, 8], [ME, 15], [LEO, 22]) }), 2, true),
    ).toEqual([]);
    // Back in the next game, in its level 2, a card in, unseen.
    expect(room(levelOf(2, { pile: laid([LEO, 3]) }), 3, true)).toEqual([]);
    expect(room(levelOf(2, { pile: laid([LEO, 3], [ME, 15]) }), 3)).toEqual([
      'hush-card',
    ]);
  });

  it('tells another game by its levels, or a pile that is not the one before', () => {
    const late = levelOf(3, { pile: laid([MAYA, 12], [ME, 20]) });
    expect(isNewHushGame(late, levelOf(1))).toBe(true);
    expect(isNewHushGame(late, levelOf(3, { levels: 5 }))).toBe(true);
    expect(isNewHushGame(late, levelOf(3, { pile: laid([LEO, 4]) }))).toBe(
      true,
    );
    expect(isNewHushGame(late, levelOf(3))).toBe(true);
    expect(
      isNewHushGame(
        late,
        levelOf(3, { pile: laid([MAYA, 12], [ME, 20], [LEO, 31]) }),
      ),
    ).toBe(false);
    expect(isNewHushGame(late, levelOf(4, { phase: 'ready' }))).toBe(false);
  });

  it('ends a game as the room does, with no card or thud over it', () => {
    const room = guard();
    const playing = levelOf(4, { lives: 1, pile: laid([ME, 12]) });
    room(playing);
    const summary = (won: boolean): HushGameSummary => ({
      endedEarly: false,
      standings: [ME, MAYA, LEO].map((playerId) => ({
        playerId,
        username: playerId,
        points: 3,
      })),
      levels: 6,
      levelsCleared: 3,
      won,
      lives: 0,
      history: [],
      held: [],
    });
    // The last life lost: the table's end, a kind cadence, alone.
    expect(
      room(
        hushState({
          ...people,
          isGameStarted: false,
          phase: 'waiting',
          pile: laid([ME, 12], [MAYA, 40]),
          lastMistake: null,
          lastGame: summary(false),
        }),
      ),
    ).toEqual(['stinger-nice-game']);
  });

  it('gives no turns, and nothing to act in against a clock', () => {
    expect(HUSH_SOUNDS.turnOf).toBeUndefined();
  });
});

interface CountProps {
  endsInMs: number;
  receivedAt: number;
  counting: boolean;
  paused: boolean;
}

function Count(props: CountProps) {
  useCountdownSounds(props);
  return null;
}

/** A countdown page on a fake clock: each snapshot is stamped as it arrives. */
function mount(endsInMs: number, counting: boolean) {
  const engine = new AudioEngine({});
  const play = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const tree = (props: CountProps) => (
    <StrictMode>
      <SoundProvider engine={engine}>
        <Count {...props} />
      </SoundProvider>
    </StrictMode>
  );
  const page = render(
    tree({
      endsInMs,
      receivedAt: performance.now(),
      counting,
      paused: false,
    }),
  );
  return {
    /** A snapshot arrives. */
    snapshot: (ms: number, c = true, paused = false) =>
      page.rerender(
        tree({
          endsInMs: ms,
          receivedAt: performance.now(),
          counting: c,
          paused,
        }),
      ),
    pass: (ms: number) => act(() => void vi.advanceTimersByTime(ms)),
    steps: () =>
      play.mock.calls.map(([spec, options]: [SoundSpec, PlayOptions?]) => {
        expect(spec.id).toBe('hush-count');
        return options?.variant;
      }),
  };
}

describe('useCountdownSounds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts 3, 2, 1 as a countdown opens, whatever the phase before read', () => {
    // A paused level's clock (a seat running out) reads 1 as the countdown
    // that resumes it opens.
    const count = mount(0, false);
    for (const left of [20_000, 5000, 2000, 1000]) {
      count.snapshot(left, false);
      count.pass(1000);
    }
    count.snapshot(1000, false);
    count.snapshot(3000);
    count.pass(3000);
    expect(count.steps()).toEqual([1, 2, 3]);
  });

  it('only sets where it stands on arriving, then counts on', () => {
    const count = mount(3000, true);
    count.pass(1000);
    count.pass(1000);
    expect(count.steps()).toEqual([2, 3]);
    const late = mount(800, true);
    late.pass(1000);
    expect(late.steps()).toEqual([]);
  });

  it('never counts a second twice, though a snapshot puts the clock back', () => {
    const count = mount(0, false);
    count.snapshot(3000);
    count.pass(1000);
    count.snapshot(3000);
    count.pass(2000);
    expect(count.steps()).toEqual([1, 2, 3]);
  });

  it('holds still while paused, and comes back to a baseline', () => {
    const count = mount(0, false);
    count.snapshot(3000);
    count.pass(1000);
    // The connection drops: the clock holds, and nothing counts.
    count.snapshot(3000, true, true);
    count.pass(5000);
    // Back at 2: where the clock stands, then on.
    count.snapshot(2000);
    count.pass(1000);
    expect(count.steps()).toEqual([1, 2, 3]);
  });

  it('counts a countdown after a pause afresh, and stays quiet while a level is played', () => {
    const count = mount(0, false);
    count.snapshot(3000);
    count.pass(3000);
    // Play, then a pause for somebody away, then the countdown that resumes.
    count.snapshot(0, false);
    count.pass(2000);
    count.snapshot(3000);
    count.pass(3000);
    count.snapshot(0, false);
    count.pass(2000);
    expect(count.steps()).toEqual([1, 2, 3, 1, 2, 3]);
  });
});
