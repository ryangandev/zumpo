import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kindOf } from '../../../shared/doodle-chain';
import type {
  DoodleChainEntry,
  DoodleChainPhase,
  DoodleChainReveal,
  DoodleChainRoomState,
  DoodleChainStepEnd,
} from '../../../shared/wire-types';
import { createReplayGuard } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import { roomPath } from '../games/catalog';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { doodleChainState, ME } from '../tests/fixtures';
import { FakeSocket } from '../tests/fake-socket';
import { renderApp } from '../tests/render-app';
import {
  actingDeadline,
  calledToStep,
  deriveDoodleChainSounds,
  DOODLE_CHAIN_SOUNDS,
  isNewDoodleChainGame,
  TIME_UP_AFTER_MS,
  turnOf,
} from './sounds';

const RYAN = { playerId: ME, username: 'Ryan' };
const MAYA = { playerId: 'p2', username: 'Maya' };
const LEO = { playerId: 'p3', username: 'Leo' };
const WATCHER = 'p9';

const spectators = {
  [WATCHER]: { username: 'Sam', points: 0, isConnected: true },
};

const open = { done: false, sitsOut: false };
const done = { done: true, sitsOut: false };

/** Step `step` of 3, in `phase`, as a seated player sees it. */
const stepOf = (
  step: number,
  phase: DoodleChainPhase = 'draw',
  overrides: Partial<DoodleChainRoomState> = {},
) =>
  doodleChainState({
    isGameStarted: true,
    phase,
    step,
    phaseEndsInMs: 60_000,
    spectators,
    table: { p1: open, p2: open, p3: open },
    task: { kind: kindOf(step), chain: 0, sitsOut: false },
    ...overrides,
  });

/** The step ended, and the books pass on for 3 seconds. */
const passing = (
  step: number,
  why: DoodleChainStepEnd = 'time',
  overrides: Partial<DoodleChainRoomState> = {},
) =>
  stepOf(step, 'passing', {
    phaseEndsInMs: 3_000,
    stepEnd: why,
    table: { p1: open, p2: open, p3: open },
    ...overrides,
  });

const heard = (
  prev: DoodleChainRoomState,
  next: DoodleChainRoomState,
  viewer = ME,
) => deriveDoodleChainSounds(viewer)(prev, next);

const sounds = (
  prev: DoodleChainRoomState,
  next: DoodleChainRoomState,
  viewer = ME,
) => heard(prev, next, viewer).map((e) => e.sound);

const entry = (
  chain: number,
  step: number,
  hearts = 0,
  // Ryan's own lines are the odd steps, Maya's drawings the even.
  author = step % 2 === 1 ? RYAN : MAYA,
): DoodleChainEntry => ({
  chain,
  step,
  kind: kindOf(step),
  author,
  content: { type: 'text', text: `${chain}.${step}` },
  hearts,
});

/** The reveal at `total` entries shown, chain 0 first, with their hearts. */
const reveal = (
  total: number,
  hearts: number[] = [],
  own: Record<number, number> = {},
): DoodleChainReveal => ({
  chain: 0,
  shown: total,
  total,
  chains: [
    { owner: RYAN, length: 3 },
    { owner: MAYA, length: 3 },
    { owner: LEO, length: 3 },
  ],
  entries: [
    Array.from({ length: total }, (_, index) =>
      entry(0, index + 1, hearts[index] ?? 0),
    ),
  ],
  hearts: own,
});

const revealing = (
  total: number,
  hearts: number[] = [],
  own: Record<number, number> = {},
  overrides: Partial<DoodleChainRoomState> = {},
) =>
  doodleChainState({
    isGameStarted: true,
    phase: 'reveal',
    step: 3,
    table: {},
    spectators,
    reveal: reveal(total, hearts, own),
    ...overrides,
  });

/** The room before the game, with everybody already in it. */
const lobby = () =>
  stepOf(1, 'write', { isGameStarted: false, phase: 'waiting', step: 0 });

const album = (endedEarly = false) =>
  doodleChainState({
    isGameStarted: false,
    phase: 'waiting',
    step: 0,
    spectators,
    lastGame: {
      endedEarly,
      standings: [{ playerId: ME, username: 'Ryan', points: 2 }],
      chains: [],
      favourites: [],
    },
  });

const viewOf = (
  state: DoodleChainRoomState,
  viewer: string,
  connection: number,
): RoomSoundView => ({
  state,
  // The viewer's go while they are called to the step.
  turn: viewer !== WATCHER && calledToStep(state) ? turnOf(state) : null,
  connection,
  readied: 0,
});

const guard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, DOODLE_CHAIN_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: DoodleChainRoomState, connection = 1, resync = false) =>
    inner
      .observe(viewOf(state, viewer, connection), resync)
      .map((e) => e.sound);
};

describe('a Doodle Chain room’s steps', () => {
  it('calls a player to each step after the first they have a task in', () => {
    expect(calledToStep(stepOf(1, 'write'))).toBe(false);
    expect(calledToStep(stepOf(2, 'draw'))).toBe(true);
    expect(calledToStep(stepOf(3, 'describe'))).toBe(true);
    // Not to sit one out, to the books passing on, to the reveal, or with no task.
    expect(
      calledToStep(
        stepOf(2, 'draw', {
          task: { kind: 'drawing', chain: 0, sitsOut: true },
        }),
      ),
    ).toBe(false);
    expect(calledToStep(passing(2))).toBe(false);
    expect(calledToStep(revealing(1))).toBe(false);
    expect(calledToStep(stepOf(2, 'draw', { task: undefined }))).toBe(false);
    expect(calledToStep(album())).toBe(false);
  });

  it('names a step the same whether or not the player is Done, and never twice', () => {
    expect(turnOf(stepOf(2))).toBe('2');
    expect(
      turnOf(stepOf(2, 'draw', { table: { p1: done, p2: open, p3: open } })),
    ).toBe('2');
    expect(turnOf(stepOf(3, 'describe'))).not.toBe(turnOf(stepOf(2)));
  });

  it('ticks only for a player with a task in the step who is not Done', () => {
    expect(actingDeadline(stepOf(2), ME)).toBe('2:draw');
    expect(actingDeadline(stepOf(1, 'write'), ME)).toBe('1:write');
    expect(
      actingDeadline(
        stepOf(2, 'draw', { table: { p1: done, p2: open, p3: open } }),
        ME,
      ),
    ).toBeNull();
    expect(
      actingDeadline(
        stepOf(2, 'draw', {
          task: { kind: 'drawing', chain: 0, sitsOut: true },
        }),
        ME,
      ),
    ).toBeNull();
    // A spectator has no task, and the books passing on and the reveal no clock to act in.
    expect(
      actingDeadline(stepOf(2, 'draw', { task: undefined }), WATCHER),
    ).toBeNull();
    expect(actingDeadline(passing(2), ME)).toBeNull();
    expect(actingDeadline(revealing(2), ME)).toBeNull();
    expect(actingDeadline(album(), ME)).toBeNull();
  });
});

describe('a Doodle Chain room, heard', () => {
  it('passes the books on for everybody when a step ends, and says time is up to a player still working', () => {
    const running = stepOf(2);
    expect(heard(running, passing(2))).toEqual([
      { sound: 'doodle-chain-pass', key: 'pass:2' },
      {
        sound: 'room-time-up',
        key: 'time-up:2',
        delayMs: TIME_UP_AFTER_MS,
      },
    ]);
    // A player already Done, a spectator, and a step ended by everybody's Done.
    const finished = stepOf(2, 'draw', {
      table: { p1: done, p2: open, p3: open },
    });
    expect(sounds(finished, passing(2))).toEqual(['doodle-chain-pass']);
    const watched = stepOf(2, 'draw', { task: undefined });
    expect(sounds(watched, passing(2), WATCHER)).toEqual(['doodle-chain-pass']);
    expect(sounds(running, passing(2, 'done'))).toEqual(['doodle-chain-pass']);
    expect(sounds(running, passing(2, 'left'))).toEqual(['doodle-chain-pass']);
    // Sitting the step out: nothing to run out of time on.
    const sitting = stepOf(2, 'draw', {
      task: { kind: 'drawing', chain: 0, sitsOut: true },
    });
    expect(sounds(sitting, passing(2))).toEqual(['doodle-chain-pass']);
    // Passing again, or the pause's next snapshot, adds nothing.
    expect(heard(passing(2), { ...passing(2) })).toEqual([]);
  });

  it('passes the books on after a step nobody could play, too', () => {
    expect(sounds(stepOf(3, 'describe'), passing(3, 'skipped'))).toEqual([
      'doodle-chain-pass',
    ]);
  });

  it('pips somebody else’s Done once, softly, and the viewer’s own is the stamp where it is pressed', () => {
    const maya = stepOf(2, 'draw', { table: { p1: open, p2: done, p3: open } });
    expect(heard(stepOf(2), maya)).toEqual([
      { sound: 'room-pip', key: 'done:2:p2', other: true },
    ]);
    // Ryan's own Done is not heard from the snapshot.
    expect(
      heard(
        stepOf(2),
        stepOf(2, 'draw', { table: { p1: done, p2: open, p3: open } }),
      ),
    ).toEqual([]);
    // Maya sits out, and a repeat adds nothing.
    expect(
      heard(
        stepOf(2),
        stepOf(2, 'draw', {
          table: { p1: open, p2: { done: true, sitsOut: true }, p3: open },
        }),
      ),
    ).toEqual([]);
    expect(heard(maya, { ...maya })).toEqual([]);
    expect(sounds(stepOf(2), maya, WATCHER)).toEqual(['room-pip']);
  });

  it('hears a Done taken back and given again once', () => {
    const room = guard(ME);
    room(stepOf(2));
    const maya = stepOf(2, 'draw', { table: { p1: open, p2: done, p3: open } });
    expect(room(maya)).toEqual(['room-pip']);
    expect(room(stepOf(2))).toEqual([]);
    expect(room(maya)).toEqual([]);
  });

  it('turns a page for each entry the host shows, and for the first as the reveal begins', () => {
    expect(heard(passing(3), revealing(1))).toEqual([
      { sound: 'doodle-chain-page', key: 'page:1' },
    ]);
    expect(heard(revealing(1), revealing(2))).toEqual([
      { sound: 'doodle-chain-page', key: 'page:2' },
    ]);
    // Everybody hears it alike, a spectator too; a repeat adds nothing.
    expect(sounds(revealing(1), revealing(2), WATCHER)).toEqual([
      'doodle-chain-page',
    ]);
    expect(heard(revealing(2), { ...revealing(2) })).toEqual([]);
  });

  it('pops a heart somebody else gave, and never the viewer’s own', () => {
    const before = revealing(2, [0, 1]);
    expect(heard(before, revealing(2, [0, 2]))).toEqual([
      { sound: 'doodle-chain-heart', key: 'heart:0.2:2', other: true },
    ]);
    // Ryan's own heart on that entry: the count moves, and it is not heard.
    expect(heard(before, revealing(2, [0, 2], { 0: 2 }))).toEqual([]);
    // Moving it to another entry of the chain: one count down, one up.
    const own = revealing(2, [1, 1], { 0: 2 });
    expect(heard(own, revealing(2, [2, 0], { 0: 1 }))).toEqual([]);
    // Hearts taken back are silent, and so is a count that stays.
    expect(heard(before, revealing(2, [0, 0]))).toEqual([]);
    expect(heard(before, revealing(2, [0, 1]))).toEqual([]);
    // Somebody else's heart together with the viewer's own: only theirs.
    expect(
      heard(before, revealing(2, [1, 3], { 0: 2 })).map((e) => e.key),
    ).toEqual(['heart:0.1:1', 'heart:0.2:2']);
  });

  it('leaves the hearts of an entry only just shown to the page turning', () => {
    expect(sounds(revealing(1), revealing(2, [0, 3]))).toEqual([
      'doodle-chain-page',
    ]);
  });

  it('merges a burst of hearts into one pop', () => {
    const room = guard(ME);
    room(revealing(2));
    expect(room(revealing(2, [1, 1]))).toEqual(['doodle-chain-heart']);
  });

  it('closes the album as the reveal ends, with the room’s end stinger left out', () => {
    expect(heard(revealing(3), album())).toEqual([
      { sound: 'doodle-chain-album', key: 'album' },
    ]);
    const room = guard(ME);
    room(revealing(3));
    expect(room(album())).toEqual(['doodle-chain-album']);
    const early = guard(MAYA.playerId);
    early(revealing(3));
    expect(early(album(true))).toEqual(['doodle-chain-album']);
  });

  it('is silent between games: the room layer has the start', () => {
    expect(heard(doodleChainState(), stepOf(1, 'write'))).toEqual([]);
    expect(heard(album(), stepOf(1, 'write'))).toEqual([]);
    expect(heard(passing(3), album())).toEqual([]);
  });
});

describe('a Doodle Chain room through the replay guard', () => {
  it('plays a game once: the start, each step’s go, the books passing, the reveal, the album', () => {
    const room = guard(ME);
    expect(room(lobby())).toEqual([]);
    // Every player starts on the first step: the start, not a go each.
    expect(room(stepOf(1, 'write'))).toEqual(['stinger-game-start']);
    expect(room(passing(1, 'done'))).toEqual(['doodle-chain-pass']);
    expect(room(stepOf(2))).toEqual(['room-your-turn']);
    expect(room(passing(2, 'time'))).toEqual([
      'doodle-chain-pass',
      'room-time-up',
    ]);
    expect(room(stepOf(3, 'describe'))).toEqual(['room-your-turn']);
    expect(room(passing(3, 'done'))).toEqual(['doodle-chain-pass']);
    expect(room(revealing(1))).toEqual(['doodle-chain-page']);
    expect(room(revealing(2, [0, 0]))).toEqual(['doodle-chain-page']);
    expect(room(revealing(2, [0, 2]))).toEqual(['doodle-chain-heart']);
    expect(room(album())).toEqual(['doodle-chain-album']);
  });

  it('does not call a player who sits the step out, a spectator, or a player on the first step', () => {
    const sitting = stepOf(2, 'draw', {
      task: { kind: 'drawing', chain: 0, sitsOut: true },
    });
    const room = guard(ME);
    room(passing(1, 'done'));
    expect(room(sitting)).toEqual([]);
    const watcher = guard(WATCHER);
    watcher(passing(1, 'done'));
    expect(watcher(stepOf(2, 'draw', { task: undefined }))).toEqual([]);
  });

  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard(ME);
    expect(room(stepOf(2))).toEqual([]);
    const maya = stepOf(2, 'draw', { table: { p1: open, p2: done, p3: open } });
    expect(room(maya)).toEqual(['room-pip']);
    expect(room({ ...maya })).toEqual([]);
    expect(room(passing(2))).toEqual(['doodle-chain-pass', 'room-time-up']);
    // Older snapshots, then the newer ones again.
    expect(room(maya)).toEqual([]);
    expect(room(stepOf(2))).toEqual([]);
    expect(room(passing(2))).toEqual([]);
    expect(room(stepOf(3, 'describe'))).toEqual(['room-your-turn']);
    expect(room(stepOf(1, 'write'))).toEqual([]);
    expect(room(stepOf(3, 'describe'))).toEqual([]);
  });

  it('takes a reconnection as a baseline, with a go that comes back not news', () => {
    const room = guard(ME);
    room(passing(1, 'done'));
    expect(room(stepOf(2))).toEqual(['room-your-turn']);
    // Dropped and back mid-step: a baseline, then the same step again.
    expect(room(stepOf(2), 2, true)).toEqual([]);
    expect(room(stepOf(2), 2)).toEqual([]);
    // Back after a step went by unseen: the baseline is the new step.
    expect(room(stepOf(3, 'describe'), 3, true)).toEqual([]);
    expect(room(passing(3, 'done'), 3)).toEqual(['doodle-chain-pass']);
  });

  it('hears a game afresh across a reconnection that spans a whole game', () => {
    const room = guard(ME);
    room(passing(2, 'done'));
    room(stepOf(3, 'describe'));
    // Away for the rest of this game and the next: back in step 2 of another.
    expect(
      room(stepOf(2, 'draw', { order: [MAYA, RYAN, LEO] }), 2, true),
    ).toEqual([]);
    expect(room(passing(2, 'done', { order: [MAYA, RYAN, LEO] }), 2)).toEqual([
      'doodle-chain-pass',
    ]);
  });
});

describe('telling one Doodle Chain game from another', () => {
  it('knows by the steps, the players, what the reveal shows, or what the viewer was given', () => {
    const late = stepOf(3, 'describe');
    expect(isNewDoodleChainGame(late, stepOf(2))).toBe(true);
    expect(isNewDoodleChainGame(late, { ...late, steps: 4 })).toBe(true);
    expect(
      isNewDoodleChainGame(late, { ...late, order: [MAYA, RYAN, LEO] }),
    ).toBe(true);
    expect(isNewDoodleChainGame(stepOf(2), stepOf(3, 'describe'))).toBe(false);

    // The reveal only grows, and its first entry stays.
    expect(isNewDoodleChainGame(revealing(3), revealing(1))).toBe(true);
    expect(isNewDoodleChainGame(revealing(2), revealing(3))).toBe(false);
    const other = revealing(2);
    other.reveal!.entries[0]![0]!.content = {
      type: 'text',
      text: 'something else',
    };
    expect(isNewDoodleChainGame(revealing(2), other)).toBe(true);

    // The same step handed other words.
    const given = (text: string) =>
      stepOf(2, 'draw', {
        task: {
          kind: 'drawing',
          chain: 2,
          sitsOut: false,
          given: {
            ...entry(2, 1, 0, LEO),
            content: { type: 'text', text },
          },
        },
      });
    expect(isNewDoodleChainGame(given('a cat'), given('a dog'))).toBe(true);
    expect(isNewDoodleChainGame(given('a cat'), given('a cat'))).toBe(false);
  });
});

/** The app in a Doodle Chain room, with every sound it plays recorded. */
async function playRoom() {
  const engine = new AudioEngine({});
  const spy = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const fake = new FakeSocket();
  fake.answer('room:sync', () => ({ ok: true as const }));
  const view = await renderApp(roomPath('doodle-chain', 'r1'), {
    fake,
    engine,
  });
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
  const send = (state: DoodleChainRoomState) =>
    act(() => fake.serverEmits('room:state', state));
  return { ...view, fake, spy, played, send };
}

/** One stroke, as a drawing so far. */
const stroke = {
  color: '#000',
  size: 10,
  points: [
    { x: 10, y: 10 },
    { x: 50, y: 40 },
  ],
};

describe('a Doodle Chain room, heard in the app', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays what the player does with their hands, and what the room does around it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { fake, played, send, spy } = await playRoom();
    send(lobby());
    expect(played()).toEqual([]);

    // Step 1: the start, then a suggestion, Done and Keep editing.
    send(stepOf(1, 'write', { phaseEndsInMs: 30_000 }));
    expect(played()).toEqual(['stinger-game-start']);
    spy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Suggest' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    send(
      stepOf(1, 'write', {
        phaseEndsInMs: 30_000,
        table: { p1: done, p2: done, p3: open },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    send(
      stepOf(1, 'write', {
        phaseEndsInMs: 30_000,
        table: { p1: open, p2: done, p3: open },
      }),
    );
    expect(played()).toEqual([
      'ui-tap',
      'room-stamp',
      'room-pip other',
      'ui-undo',
    ]);
    spy.mockClear();

    // The books pass on with time up for Ryan, who was still working, then
    // step 2 is his go, and the drawing step's tools.
    send(passing(1, 'time'));
    await act(() => vi.advanceTimersByTimeAsync(TIME_UP_AFTER_MS));
    send(stepOf(2, 'draw'));
    act(() => fake.serverEmits('dc:canvas:sync', 'r1', [stroke]));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    act(() => fake.serverEmits('dc:canvas:sync', 'r1', [stroke]));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(played()).toEqual([
      'doodle-chain-pass',
      'room-time-up',
      'room-your-turn',
      'ui-undo',
      'draw-and-guess-clear',
      'room-stamp',
    ]);
  });

  it('ticks the last seconds of a step until the player is Done', async () => {
    const { played, send } = await playRoom();
    send(stepOf(2, 'draw', { phaseEndsInMs: 60_000 }));
    for (let second = 0; second < 55; second++) {
      await act(() => vi.advanceTimersByTimeAsync(1000));
    }
    expect(played().filter((id) => id.startsWith('room-tick'))).toEqual([
      'room-tick step 1',
    ]);
  });

  it('turns the reveal’s pages, hears hearts, and closes the album, but not twice on a refresh', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const first = await playRoom();
    first.send(revealing(2, [0, 1]));
    expect(first.played()).toEqual([]);
    first.send(revealing(3, [0, 1]));
    first.send(revealing(3, [0, 1, 1]));
    await user.click(
      screen.getAllByRole('button', { name: /^Give a heart/ })[0]!,
    );
    first.send(album());
    expect(first.played()).toEqual([
      'doodle-chain-page',
      'doodle-chain-heart other',
      'doodle-chain-heart',
      'doodle-chain-album',
    ]);
    first.unmount();

    // A refresh into the reveal: the entries already shown are only a baseline.
    const again = await playRoom();
    again.send(revealing(3, [0, 1, 1]));
    again.send({ ...revealing(3, [0, 1, 1]) });
    expect(again.played()).toEqual([]);
    again.send(revealing(4, [0, 1, 1]));
    expect(again.played()).toEqual(['doodle-chain-page']);
  });
});
