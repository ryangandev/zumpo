import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  Make24HandResult,
  Make24RoomState,
} from '../../../shared/wire-types';
import { createReplayGuard } from '../audio';
import { AudioEngine } from '../audio/engine';
import { stepsToSolve } from '../tests/make-24';
import { renderApp } from '../tests/render-app';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { deriveSoloSounds, endAlone } from '../solo/sounds';
import { make24State, ME } from '../tests/fixtures';
import { newRun, RUN_HANDS, skip, type SoloRun } from './solo/run';
import {
  actingDeadline,
  deriveMake24Solo,
  deriveMake24Sounds,
  isNewMake24Game,
  MAKE_24_SOUNDS,
} from './sounds';

const MAYA = 'p2';
const LEO = 'p3';
const WATCHER = 'p9';

const seat = (username: string, points = 0) => ({
  username,
  points,
  isConnected: true,
});

const table = {
  playerList: { [ME]: seat('Ryan'), [MAYA]: seat('Maya'), [LEO]: seat('Leo') },
  spectators: { [WATCHER]: seat('Sam') },
};

const solve = (playerId: string, points = 120) => ({
  playerId,
  username: playerId,
  points,
  secondsLeft: 42,
});

const result = (playerId: string, solved = true): Make24HandResult => ({
  playerId,
  username: playerId,
  solved,
  expression: solved ? '(8 − 4) × (7 − 1)' : '',
  points: solved ? 120 : 0,
  secondsLeft: solved ? 42 : 0,
});

/** Hand `hand` of a game, open unless said otherwise. */
const handOf = (hand: number, overrides: Partial<Make24RoomState> = {}) =>
  make24State({
    ...table,
    isGameStarted: true,
    phase: 'solving',
    hand,
    deal: [1, 4, 7, 8],
    phaseEndsInMs: 60_000,
    ...overrides,
  });

const reveal = (hand: number, results: Make24HandResult[]) =>
  handOf(hand, { phase: 'reveal', lastHand: results, lastDeal: [1, 4, 7, 8] });

const heard = (prev: Make24RoomState, next: Make24RoomState, viewer = ME) =>
  deriveMake24Sounds(viewer)(prev, next);

const sounds = (prev: Make24RoomState, next: Make24RoomState, viewer = ME) =>
  heard(prev, next, viewer).map((e) => e.sound);

const viewOf = (state: Make24RoomState, connection = 1): RoomSoundView => ({
  state,
  turn: null,
  connection,
  readied: 0,
});

const guard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, MAKE_24_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: Make24RoomState, connection = 1, resync = false) =>
    inner.observe(viewOf(state, connection), resync);
};

describe('a Make 24 room, heard', () => {
  it('rings your own solve, and steps up for everybody else’s', () => {
    const open = handOf(2);
    expect(
      heard(open, handOf(2, { mySolve: result(ME), solved: [solve(ME)] })),
    ).toEqual([{ sound: 'make-24-solved', key: 'solved:2' }]);
    const two = handOf(2, { solved: [solve(MAYA), solve(LEO)] });
    expect(heard(open, two)).toEqual([
      {
        sound: 'room-someone-scored',
        key: `scored:2:${MAYA}`,
        other: true,
        variant: 1,
      },
      {
        sound: 'room-someone-scored',
        key: `scored:2:${LEO}`,
        other: true,
        variant: 2,
      },
    ]);
    expect(heard(two, { ...two })).toEqual([]);
  });

  it('hears the last solve and the hand’s end as one sound', () => {
    const open = handOf(1, { solved: [solve(MAYA)] });
    const ended = reveal(1, [result(MAYA), result(ME)]);
    expect(sounds(open, ended)).toEqual(['make-24-solved']);
    expect(sounds(open, ended, LEO)).toEqual(['room-time-up']);
    expect(sounds(open, ended, WATCHER)).toEqual(['room-reveal']);
    const mine = handOf(1, { mySolve: result(ME), solved: [solve(ME)] });
    expect(sounds(mine, ended)).toEqual(['room-reveal']);
  });

  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard();
    const open = handOf(3);
    const maya = handOf(3, { solved: [solve(MAYA)] });
    const ended = reveal(3, [result(MAYA), result(ME, false)]);
    expect(room(open)).toEqual([]);
    expect(room(maya).map((e) => e.sound)).toEqual(['room-someone-scored']);
    expect(room(ended).map((e) => e.sound)).toEqual(['room-time-up']);
    expect(room(maya)).toEqual([]);
    expect(room(ended)).toEqual([]);
  });

  it('takes a reconnection as a baseline, and the next game anew', () => {
    const room = guard();
    room(handOf(2));
    expect(room(handOf(2, { solved: [solve(MAYA)] })).length).toBe(1);
    expect(room(handOf(2, { solved: [solve(MAYA)] }), 2, true)).toEqual([]);
    // Back in the next game, at hand 2 again, dealt other cards.
    room(handOf(2, { deal: [2, 3, 5, 9] }), 3, true);
    expect(
      room(handOf(2, { deal: [2, 3, 5, 9], solved: [solve(MAYA)] }), 3).map(
        (e) => e.sound,
      ),
    ).toEqual(['room-someone-scored']);
  });

  it('tells another game by its hands, its cards, or points gone down', () => {
    const late = handOf(4);
    expect(isNewMake24Game(late, handOf(1))).toBe(true);
    expect(isNewMake24Game(late, handOf(4, { deal: [3, 3, 8, 8] }))).toBe(true);
    expect(isNewMake24Game(late, handOf(4, { hands: 10 }))).toBe(true);
    const scored = handOf(4, {
      playerList: { ...table.playerList, [MAYA]: seat('Maya', 300) },
    });
    expect(isNewMake24Game(scored, handOf(5))).toBe(true);
    expect(isNewMake24Game(late, scored)).toBe(false);
    // The hand's reveal shows its cards as the last deal.
    expect(isNewMake24Game(late, reveal(4, []))).toBe(false);
  });

  it('ticks only for a seated player still solving', () => {
    expect(actingDeadline(handOf(2), ME)).toBe('2:solving');
    expect(actingDeadline(handOf(2, { mySolve: result(ME) }), ME)).toBeNull();
    expect(actingDeadline(handOf(2), WATCHER)).toBeNull();
    expect(actingDeadline(reveal(2, []), ME)).toBeNull();
  });
});

const solo = () =>
  createReplayGuard(deriveSoloSounds(deriveMake24Solo), {
    isNewGame: () => false,
    select: endAlone,
  });

describe('a Make 24 run, heard', () => {
  it('hears each hand finished once, and the tenth as the run’s end alone', () => {
    let run: SoloRun = newRun('k3f9x2', 0);
    const game = solo();
    game.observe({ game: run, end: null });
    const skipped = skip(run, 1000);
    expect(game.observe({ game: skipped, end: null })).toEqual([
      { sound: 'make-24-skip', key: 'game:hand:0' },
    ]);
    run = skipped;
    for (let hand = 1; hand < RUN_HANDS; hand++) {
      run = skip({ ...run, hand, handStartedAt: 0 }, 1000);
    }
    expect(
      game.observe({ game: run, end: 'complete' }).map((e) => e.sound),
    ).toEqual(['stinger-solo-complete']);
  });
});

const SIGNS = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by' };

/** The cards on the table, in order. */
const cards = () => screen.getAllByRole('button', { name: /^-?\d/ });

describe('a Make 24 run, heard in the app', () => {
  it('plays each pick, a step, an undo and a solved hand, once', async () => {
    const engine = new AudioEngine({});
    const play = vi
      .spyOn(engine, 'play')
      .mockImplementation(() => Promise.resolve(true));
    const played = () => play.mock.calls.map(([spec]) => spec.id);
    const user = userEvent.setup();
    await renderApp('/games/make-24/solo?seed=k3f9x2', { engine });
    expect(played()).toEqual([]);

    const steps = stepsToSolve(newRun('k3f9x2', 0).deals[0]!);
    const take = async (step: (typeof steps)[number]) => {
      const before = cards();
      await user.click(before[step.left]!);
      await user.click(screen.getByRole('button', { name: SIGNS[step.op] }));
      await user.click(before[step.right]!);
    };
    await take(steps[0]!);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(played()).toEqual([
      'make-24-card',
      'make-24-sign',
      'make-24-combine',
      'ui-undo',
    ]);
    play.mockClear();
    for (const step of steps) await take(step);
    await act(async () => {});
    expect(played()).toEqual([
      ...Array.from({ length: steps.length - 1 }, () => [
        'make-24-card',
        'make-24-sign',
        'make-24-combine',
      ]).flat(),
      'make-24-card',
      'make-24-sign',
      'make-24-solved',
    ]);
  });
});
