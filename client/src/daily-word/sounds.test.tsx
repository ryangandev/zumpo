import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DailyWordBoard,
  DailyWordMark,
  DailyWordRoomState,
} from '../../../shared/wire-types';
import {
  ANSWERS,
  dailyAnswer,
  MAX_GUESSES,
  puzzleNumber,
} from '../../../shared/daily-word';
import { createReplayGuard } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { deriveSoloSounds, endAlone } from '../solo/sounds';
import { dailyWordState, ME } from '../tests/fixtures';
import { renderApp } from '../tests/render-app';
import { recordGuesses } from './solo/records';
import { newGame, submit, typeLetter, type SoloGame } from './solo/game';
import {
  actingDeadline,
  DAILY_WORD_SOUNDS,
  deriveDailyWordSolo,
  deriveDailyWordSounds,
  isNewDailyWordGame,
  TILE_GAP_MS,
  tileSounds,
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

const RIGHT: DailyWordMark = 'correct';
const MOVED: DailyWordMark = 'present';
const OUT: DailyWordMark = 'absent';

/** A board with one row per set of marks. */
const board = (
  playerId: string,
  rows: DailyWordMark[][],
  status: DailyWordBoard['status'] = 'guessing',
): DailyWordBoard => ({
  playerId,
  username: playerId,
  rows: rows.map((marks) => ({
    word: playerId === ME ? 'crane' : null,
    marks,
  })),
  status,
  points: status === 'found' ? 500 : 0,
  secondsLeft: 0,
});

const ROW_A = [RIGHT, MOVED, OUT, OUT, OUT];
const ROW_B = [OUT, OUT, OUT, OUT, OUT];
const WON = [RIGHT, RIGHT, RIGHT, RIGHT, RIGHT];

/** Round `round` of a game, open unless said otherwise. */
const roundOf = (
  round: number,
  boards: DailyWordBoard[] = [],
  overrides: Partial<DailyWordRoomState> = {},
) =>
  dailyWordState({
    ...table,
    isGameStarted: true,
    phase: 'guessing',
    round,
    boards,
    phaseEndsInMs: 120_000,
    ...overrides,
  });

const reveal = (round: number, boards: DailyWordBoard[]) =>
  roundOf(round, [], {
    phase: 'reveal',
    lastRound: { word: 'house', boards },
  });

const heard = (
  prev: DailyWordRoomState,
  next: DailyWordRoomState,
  viewer = ME,
) => deriveDailyWordSounds(viewer)(prev, next);

const sounds = (
  prev: DailyWordRoomState,
  next: DailyWordRoomState,
  viewer = ME,
) => heard(prev, next, viewer).map((e) => e.sound);

const viewOf = (state: DailyWordRoomState, connection = 1): RoomSoundView => ({
  state,
  turn: null,
  connection,
  readied: 0,
});

const guard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, DAILY_WORD_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: DailyWordRoomState, connection = 1, resync = false) =>
    inner.observe(viewOf(state, connection), resync).map((e) => e.sound);
};

const TILES_A = [
  'daily-word-tile-right',
  'daily-word-tile-moved',
  'daily-word-tile-not-in',
  'daily-word-tile-not-in',
  'daily-word-tile-not-in',
];

describe('a guess’s tiles', () => {
  it('sound one after another, in the board’s order', () => {
    expect(tileSounds(ROW_A, 'row:3')).toEqual([
      { sound: 'daily-word-tile-right', key: 'row:3:tile:0' },
      {
        sound: 'daily-word-tile-moved',
        key: 'row:3:tile:1',
        delayMs: TILE_GAP_MS,
      },
      {
        sound: 'daily-word-tile-not-in',
        key: 'row:3:tile:2',
        delayMs: 2 * TILE_GAP_MS,
      },
      {
        sound: 'daily-word-tile-not-in',
        key: 'row:3:tile:3',
        delayMs: 3 * TILE_GAP_MS,
      },
      {
        sound: 'daily-word-tile-not-in',
        key: 'row:3:tile:4',
        delayMs: 4 * TILE_GAP_MS,
      },
    ]);
  });
});

describe('a Daily Word room, heard', () => {
  it('turns your own tiles, and keeps everybody else’s silent', () => {
    const open = roundOf(1, [board(ME, []), board(MAYA, [])]);
    expect(
      sounds(open, roundOf(1, [board(ME, [ROW_A]), board(MAYA, [])])),
    ).toEqual(TILES_A);
    expect(
      sounds(open, roundOf(1, [board(ME, []), board(MAYA, [ROW_A])])),
    ).toEqual([]);
  });

  it('steps up for each player who finds the word', () => {
    const open = roundOf(2, [board(ME, []), board(MAYA, []), board(LEO, [])]);
    const both = roundOf(2, [
      board(ME, [WON], 'found'),
      board(MAYA, [WON], 'found'),
      board(LEO, []),
    ]);
    expect(heard(open, both).slice(5)).toEqual([
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

  it('hears the last guess and the round’s end as the guesser’s own tiles', () => {
    const open = roundOf(1, [board(ME, [ROW_B]), board(MAYA, [WON], 'found')]);
    const ended = reveal(1, [
      board(MAYA, [WON], 'found'),
      board(ME, [ROW_B, ROW_A]),
    ]);
    expect(sounds(open, ended)).toEqual(TILES_A);
    expect(sounds(open, ended, MAYA)).toEqual(['room-reveal']);
    expect(sounds(open, ended, WATCHER)).toEqual(['room-reveal']);
    // Time ran out while still guessing.
    const late = reveal(1, [board(ME, [ROW_B]), board(MAYA, [WON], 'found')]);
    expect(sounds(open, late)).toEqual(['room-time-up']);
  });

  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard();
    const open = roundOf(1, [board(ME, [])]);
    const one = roundOf(1, [board(ME, [ROW_A])]);
    expect(room(open)).toEqual([]);
    expect(room(one)).toEqual(TILES_A);
    expect(room({ ...one })).toEqual([]);
    expect(room(open)).toEqual([]);
    expect(room(one)).toEqual([]);
  });

  it('takes a reconnection as a baseline, and a game unseen as new', () => {
    const room = guard();
    room(roundOf(1, [board(ME, [])]));
    room(roundOf(1, [board(ME, [ROW_A])]));
    expect(room(roundOf(1, [board(ME, [ROW_A])]), 2, true)).toEqual([]);
    // Back in the next game's first round, whose first row reads otherwise.
    expect(room(roundOf(1, [board(ME, [ROW_B])]), 3, true)).toEqual([]);
    expect(room(roundOf(1, [board(ME, [ROW_B, ROW_A])]), 3)).toHaveLength(5);
  });

  it('tells another game by its rounds, a board rewritten, or points gone down', () => {
    const late = roundOf(2, [board(MAYA, [ROW_A])]);
    expect(isNewDailyWordGame(late, roundOf(1))).toBe(true);
    expect(isNewDailyWordGame(late, roundOf(2, [], { rounds: 5 }))).toBe(true);
    // Fewer rows than before in the same round, or other marks.
    expect(isNewDailyWordGame(late, roundOf(2, [board(MAYA, [])]))).toBe(true);
    expect(isNewDailyWordGame(late, roundOf(2, [board(MAYA, [ROW_B])]))).toBe(
      true,
    );
    expect(
      isNewDailyWordGame(late, roundOf(2, [board(MAYA, [ROW_A, ROW_B])])),
    ).toBe(false);
    const scored = roundOf(2, [], {
      playerList: { ...table.playerList, [MAYA]: seat('Maya', 300) },
    });
    expect(isNewDailyWordGame(scored, roundOf(3))).toBe(true);
  });

  it('ticks only for a player still at the word', () => {
    expect(actingDeadline(roundOf(2, [board(ME, [])]), ME)).toBe('2:guessing');
    expect(
      actingDeadline(roundOf(2, [board(ME, [WON], 'found')]), ME),
    ).toBeNull();
    expect(actingDeadline(roundOf(2, [board(ME, [])]), WATCHER)).toBeNull();
    expect(actingDeadline(reveal(2, [board(ME, [])]), ME)).toBeNull();
  });
});

const solo = () =>
  createReplayGuard(deriveSoloSounds(deriveDailyWordSolo), {
    isNewGame: () => false,
    select: endAlone,
  });

/** `game` with `word` typed and entered. */
const guess = (game: SoloGame, word: string) =>
  submit([...word].reduce(typeLetter, game));

describe('a Daily Word game, heard', () => {
  it('turns each guess’s tiles once, and the last guess as the end alone', () => {
    const answer = ANSWERS[0]!;
    const [first, second] = ANSWERS.filter((word) => word !== answer);
    const game = solo();
    let state = newGame(answer);
    expect(game.observe({ game: state, end: null })).toEqual([]);

    state = guess(state, first!);
    const heardFirst = game.observe({ game: state, end: null });
    expect(heardFirst).toHaveLength(5);
    expect(heardFirst.map((e) => e.key.slice(0, 11))).toEqual(
      Array(5).fill('game:row:1:'),
    );
    // Typing, and a row turned back, are not the game's reply.
    state = typeLetter(state, 'q');
    expect(game.observe({ game: state, end: null })).toEqual([]);
    state = guess(newGame(answer, state.guesses), second!);
    expect(game.observe({ game: state, end: null })).toHaveLength(5);
    state = guess(state, answer);
    expect(
      game.observe({ game: state, end: 'complete' }).map((e) => e.sound),
    ).toEqual(['stinger-solo-complete']);
  });

  it('opens a restored game as a baseline, finished or not', () => {
    const answer = ANSWERS[0]!;
    const others = ANSWERS.filter((word) => word !== answer);
    const missed = newGame(answer, others.slice(0, MAX_GUESSES));
    const restored = solo();
    expect(restored.observe({ game: missed, end: 'loss' })).toEqual([]);
    const half = solo();
    expect(
      half.observe({ game: newGame(answer, others.slice(0, 3)), end: null }),
    ).toEqual([]);
  });
});

// 9:00 on the first day of the calendar: Word #1.
const NOW = new Date(2026, 9, 5, 9, 0, 0);
const PUZZLE = puzzleNumber(NOW);
const TODAY = dailyAnswer(PUZZLE);
const WRONG = ANSWERS.filter((word) => word !== TODAY);

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
  const view = await renderApp('/games/daily-word/solo', { engine });
  await screen.findByRole('region', { name: 'Turn' });
  return { ...view, played, play };
}

describe('Daily Word on your own, heard in the app', () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('types, turns tiles, finds the word once, and plays nothing on a refresh', async () => {
    const first = await openSolo();
    await user.keyboard('ab');
    await user.keyboard('{Backspace}{Enter}');
    expect(first.played()).toEqual([
      'ui-key',
      'ui-key',
      'ui-delete',
      'ui-nope',
    ]);
    first.play.mockClear();

    await user.keyboard('{Backspace}');
    first.play.mockClear();
    await user.keyboard(`${WRONG[0]}{Enter}`);
    await act(() => vi.advanceTimersByTimeAsync(5 * TILE_GAP_MS));
    expect(first.played().filter((id) => id === 'ui-key')).toHaveLength(5);
    expect(
      first.played().filter((id) => id.startsWith('daily-word')),
    ).toHaveLength(5);
    first.play.mockClear();

    // The same word again is turned back; a word that is not one, too.
    await user.keyboard(`${WRONG[0]}{Enter}`);
    expect(first.played().at(-1)).toBe('ui-nope');
    first.play.mockClear();
    await user.keyboard(
      '{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}',
    );
    first.play.mockClear();

    await user.keyboard(`${TODAY}{Enter}`);
    await act(() => vi.advanceTimersByTimeAsync(5 * TILE_GAP_MS));
    expect(first.played()).toEqual([
      ...Array.from({ length: 5 }, () => 'ui-key'),
      'stinger-solo-complete',
    ]);

    // The day's word, finished, comes back on a refresh: silent.
    first.unmount();
    const again = await openSolo();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(again.played()).toEqual([]);
  });

  it('plays nothing for a day’s word restored half played, then only the next guess', async () => {
    recordGuesses(PUZZLE, [WRONG[0]!, WRONG[1]!]);
    const page = await openSolo();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(page.played()).toEqual([]);
    await user.keyboard(`${WRONG[2]}{Enter}`);
    await act(() => vi.advanceTimersByTimeAsync(5 * TILE_GAP_MS));
    expect(
      page.played().filter((id) => id.startsWith('daily-word')),
    ).toHaveLength(5);
    expect(page.played().filter((id) => id.startsWith('stinger'))).toEqual([]);
  });

  it('plays nothing for a day’s word restored missed', async () => {
    recordGuesses(PUZZLE, WRONG.slice(0, MAX_GUESSES));
    const page = await openSolo();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(page.played()).toEqual([]);
  });
});
