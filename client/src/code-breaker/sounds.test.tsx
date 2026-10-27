import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CodeBreakerBoard,
  CodeBreakerRoomState,
} from '../../../shared/wire-types';
import {
  ALL_CODES,
  dailyCode,
  puzzleNumber,
} from '../../../shared/code-breaker';
import { createReplayGuard } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { codeBreakerState, ME } from '../tests/fixtures';
import { renderApp } from '../tests/render-app';
import {
  actingDeadline,
  CODE_BREAKER_SOUNDS,
  deriveCodeBreakerSounds,
  isNewCodeBreakerGame,
  PEG_GAP_MS,
  pegSounds,
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

/** A board with one row per mark, `[right, moved]`. */
const board = (
  playerId: string,
  marks: [number, number][],
  status: CodeBreakerBoard['status'] = 'guessing',
): CodeBreakerBoard => ({
  playerId,
  username: playerId,
  rows: marks.map(([right, moved]) => ({
    guess: playerId === ME ? '0123' : null,
    mark: { right, moved },
  })),
  status,
  points: status === 'cracked' ? 500 : 0,
  secondsLeft: 0,
});

/** Round `round` of a game, open unless said otherwise. */
const roundOf = (
  round: number,
  boards: CodeBreakerBoard[] = [],
  overrides: Partial<CodeBreakerRoomState> = {},
) =>
  codeBreakerState({
    ...table,
    isGameStarted: true,
    phase: 'guessing',
    round,
    boards,
    phaseEndsInMs: 180_000,
    ...overrides,
  });

const reveal = (round: number, boards: CodeBreakerBoard[]) =>
  roundOf(round, [], {
    phase: 'reveal',
    lastRound: { code: '4071', boards },
  });

const heard = (
  prev: CodeBreakerRoomState,
  next: CodeBreakerRoomState,
  viewer = ME,
) => deriveCodeBreakerSounds(viewer)(prev, next);

const sounds = (
  prev: CodeBreakerRoomState,
  next: CodeBreakerRoomState,
  viewer = ME,
) => heard(prev, next, viewer).map((e) => e.sound);

const viewOf = (
  state: CodeBreakerRoomState,
  connection = 1,
): RoomSoundView => ({
  state,
  turn: null,
  connection,
  readied: 0,
});

const guard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, CODE_BREAKER_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: CodeBreakerRoomState, connection = 1, resync = false) =>
    inner.observe(viewOf(state, connection), resync).map((e) => e.sound);
};

const PEGS_2_1 = [
  'code-breaker-peg-right',
  'code-breaker-peg-right',
  'code-breaker-peg-moved',
  'code-breaker-peg-not-in',
];

describe('a guess’s pegs', () => {
  it('drop in one after another, in the board’s order', () => {
    expect(pegSounds({ right: 2, moved: 1 }, 'row:3')).toEqual([
      { sound: 'code-breaker-peg-right', key: 'row:3:peg:0' },
      {
        sound: 'code-breaker-peg-right',
        key: 'row:3:peg:1',
        delayMs: PEG_GAP_MS,
      },
      {
        sound: 'code-breaker-peg-moved',
        key: 'row:3:peg:2',
        delayMs: 2 * PEG_GAP_MS,
      },
      {
        sound: 'code-breaker-peg-not-in',
        key: 'row:3:peg:3',
        delayMs: 3 * PEG_GAP_MS,
      },
    ]);
  });
});

describe('a Code Breaker room, heard', () => {
  it('drops your own pegs in, and keeps everybody else’s silent', () => {
    const open = roundOf(1, [board(ME, []), board(MAYA, [])]);
    expect(
      sounds(open, roundOf(1, [board(ME, [[2, 1]]), board(MAYA, [])])),
    ).toEqual(PEGS_2_1);
    expect(
      sounds(open, roundOf(1, [board(ME, []), board(MAYA, [[1, 1]])])),
    ).toEqual([]);
  });

  it('steps up for each player who cracks it', () => {
    const open = roundOf(2, [board(ME, []), board(MAYA, []), board(LEO, [])]);
    const both = roundOf(2, [
      board(ME, [[4, 0]], 'cracked'),
      board(MAYA, [[4, 0]], 'cracked'),
      board(LEO, []),
    ]);
    expect(heard(open, both).slice(4)).toEqual([
      {
        sound: 'room-someone-scored',
        key: `scored:2:${MAYA}`,
        other: true,
        variant: 2,
      },
    ]);
    expect(heard(open, both, WATCHER)).toEqual([
      {
        sound: 'room-someone-scored',
        key: `scored:2:${ME}`,
        other: true,
        variant: 1,
      },
      {
        sound: 'room-someone-scored',
        key: `scored:2:${MAYA}`,
        other: true,
        variant: 2,
      },
    ]);
  });

  it('hears the last guess and the round’s end as the guesser’s own pegs', () => {
    const open = roundOf(1, [
      board(ME, [[1, 0]]),
      board(MAYA, [[4, 0]], 'cracked'),
    ]);
    const ended = reveal(1, [
      board(MAYA, [[4, 0]], 'cracked'),
      board(ME, [
        [1, 0],
        [2, 1],
      ]),
    ]);
    expect(sounds(open, ended)).toEqual(PEGS_2_1);
    expect(sounds(open, ended, MAYA)).toEqual(['room-reveal']);
    expect(sounds(open, ended, WATCHER)).toEqual(['room-reveal']);
    // Time ran out while still guessing.
    const late = reveal(1, [board(ME, [[1, 0]]), board(MAYA, [[4, 0]])]);
    expect(sounds(open, late)).toEqual(['room-time-up']);
  });

  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard();
    const open = roundOf(1, [board(ME, [])]);
    const one = roundOf(1, [board(ME, [[0, 2]])]);
    expect(room(open)).toEqual([]);
    expect(room(one)).toEqual([
      'code-breaker-peg-moved',
      'code-breaker-peg-moved',
      'code-breaker-peg-not-in',
      'code-breaker-peg-not-in',
    ]);
    expect(room({ ...one })).toEqual([]);
    expect(room(open)).toEqual([]);
    expect(room(one)).toEqual([]);
  });

  it('takes a reconnection as a baseline, and a game unseen as new', () => {
    const room = guard();
    room(roundOf(1, [board(ME, [])]));
    room(roundOf(1, [board(ME, [[1, 0]])]));
    expect(room(roundOf(1, [board(ME, [[1, 0]])]), 2, true)).toEqual([]);
    // Back in the next game's first round, whose first row reads otherwise.
    expect(room(roundOf(1, [board(ME, [[0, 0]])]), 3, true)).toEqual([]);
    expect(
      room(
        roundOf(1, [
          board(ME, [
            [0, 0],
            [1, 0],
          ]),
        ]),
        3,
      ),
    ).toHaveLength(4);
  });

  it('tells another game by its rounds, a board rewritten, or points gone down', () => {
    const late = roundOf(2, [board(MAYA, [[1, 1]])]);
    expect(isNewCodeBreakerGame(late, roundOf(1))).toBe(true);
    // Fewer rows than before in the same round.
    expect(isNewCodeBreakerGame(late, roundOf(2, [board(MAYA, [])]))).toBe(
      true,
    );
    expect(
      isNewCodeBreakerGame(late, roundOf(2, [board(MAYA, [[0, 3]])])),
    ).toBe(true);
    expect(
      isNewCodeBreakerGame(
        late,
        roundOf(2, [
          board(MAYA, [
            [1, 1],
            [2, 0],
          ]),
        ]),
      ),
    ).toBe(false);
    const scored = roundOf(2, [], {
      playerList: { ...table.playerList, [MAYA]: seat('Maya', 300) },
    });
    expect(isNewCodeBreakerGame(scored, roundOf(3))).toBe(true);
  });

  it('ticks only for a player still at the code', () => {
    expect(actingDeadline(roundOf(2, [board(ME, [])]), ME)).toBe('2:guessing');
    expect(
      actingDeadline(roundOf(2, [board(ME, [[4, 0]], 'cracked')]), ME),
    ).toBeNull();
    expect(actingDeadline(roundOf(2, [board(ME, [])]), WATCHER)).toBeNull();
    expect(actingDeadline(reveal(2, [board(ME, [])]), ME)).toBeNull();
  });
});

// 9:00 on the first day of the calendar: Code #1.
const NOW = new Date(2026, 9, 21, 9, 0, 0);
const TODAY = dailyCode(puzzleNumber(NOW));

/** The solo page, with every sound it plays recorded by id. */
async function openSolo() {
  const engine = new AudioEngine({});
  const play = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const played = () =>
    play.mock.calls.map(([spec, options]: [SoundSpec, PlayOptions?]) =>
      options?.other ? `${spec.id} other` : spec.id,
    );
  const view = await renderApp('/games/code-breaker/solo', { engine });
  return { ...view, played, play };
}

describe('Code Breaker on your own, heard in the app', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('types, drops pegs, cracks the code once, and plays nothing on a refresh', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const first = await openSolo();
    const miss = ALL_CODES.find((code) =>
      [...code].every((digit) => !TODAY.includes(digit)),
    )!;
    await user.keyboard(`${miss[0]}${miss[0]}`);
    await user.keyboard('{Backspace}{Enter}');
    expect(first.played()).toEqual([
      'ui-key',
      'ui-nope',
      'ui-delete',
      'ui-nope',
    ]);
    first.play.mockClear();

    await user.keyboard(`${miss}{Enter}`);
    await act(() => vi.advanceTimersByTimeAsync(4 * PEG_GAP_MS));
    expect(first.played()).toEqual([
      ...Array.from({ length: 4 }, () => 'ui-key'),
      ...Array.from({ length: 4 }, () => 'code-breaker-peg-not-in'),
    ]);
    first.play.mockClear();

    await user.keyboard(`${TODAY}{Enter}`);
    await act(() => vi.advanceTimersByTimeAsync(4 * PEG_GAP_MS));
    expect(first.played()).toEqual([
      ...Array.from({ length: 4 }, () => 'ui-key'),
      'stinger-solo-complete',
    ]);

    // The day's code, finished, comes back on a refresh: silent.
    first.unmount();
    const again = await openSolo();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(again.played()).toEqual([]);
  });
});
