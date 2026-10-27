import { describe, expect, it } from 'vitest';
import type {
  MinesweeperPickResult,
  MinesweeperRoomState,
} from '../../../shared/wire-types';
import { createReplayGuard } from '../audio';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { deriveSoloSounds, endAlone } from '../solo/sounds';
import { minesweeperState, ME } from '../tests/fixtures';
import { newGame, reveal, toggleFlag, type SoloGame } from './solo/game';
import {
  actingDeadline,
  deriveMinesweeperSolo,
  deriveMinesweeperSounds,
  isNewMinesweeperGame,
  MINESWEEPER_SOUNDS,
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

/** Round `round` of a game, open for picks unless said otherwise. */
const roundOf = (
  round: number,
  overrides: Partial<MinesweeperRoomState> = {},
) =>
  minesweeperState({
    ...table,
    isGameStarted: true,
    phase: 'picking',
    round,
    phaseEndsInMs: 15_000,
    ...overrides,
  });

const pick = (
  playerId: string,
  overrides: Partial<MinesweeperPickResult> = {},
): MinesweeperPickResult => ({
  playerId,
  username: playerId,
  index: 0,
  risk: 0.2,
  hitMine: false,
  points: 28,
  sharedWith: 1,
  autoPlayed: false,
  ...overrides,
});

const heard = (
  prev: MinesweeperRoomState,
  next: MinesweeperRoomState,
  viewer = ME,
) => deriveMinesweeperSounds(viewer)(prev, next);

const viewOf = (
  state: MinesweeperRoomState,
  connection = 1,
): RoomSoundView => ({
  state,
  turn: null,
  connection,
  readied: 0,
});

const guard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, MINESWEEPER_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: MinesweeperRoomState, connection = 1, resync = false) =>
    inner.observe(viewOf(state, connection), resync).map((e) => e.sound);
};

describe('a Minesweeper room, heard', () => {
  it('stamps your own pick and pips everybody else’s, once each', () => {
    const open = roundOf(2);
    expect(heard(open, roundOf(2, { myPick: 40, lockedIn: [ME] }))).toEqual([
      { sound: 'room-stamp', key: 'pick:2' },
    ]);
    expect(heard(open, roundOf(2, { lockedIn: [MAYA, LEO] }))).toEqual([
      { sound: 'room-pip', key: `locked:2:${MAYA}`, other: true },
      { sound: 'room-pip', key: `locked:2:${LEO}`, other: true },
    ]);
    // Already locked in: nothing new.
    const maya = roundOf(2, { lockedIn: [MAYA] });
    expect(heard(maya, { ...maya })).toEqual([]);
  });

  it('reveals a round once, with one pop however many hit a mine', () => {
    const open = roundOf(3, { lockedIn: [MAYA] });
    const reveal = roundOf(3, {
      phase: 'reveal',
      lastRound: [
        pick(ME),
        pick(MAYA, { hitMine: true }),
        pick(LEO, { hitMine: true }),
      ],
    });
    expect(heard(open, reveal)).toEqual([
      { sound: 'room-reveal', key: 'reveal:3' },
      { sound: 'minesweeper-mine', key: 'mine:3', other: true },
    ]);
    // Your own mine is yours, at full level.
    expect(heard(open, reveal, MAYA)[1]).toEqual({
      sound: 'minesweeper-mine',
      key: 'mine:3',
      other: false,
    });
    expect(heard(reveal, { ...reveal })).toEqual([]);
  });

  it('says your time is up when the clock picked for you', () => {
    const reveal = roundOf(1, {
      phase: 'reveal',
      lastRound: [pick(ME, { autoPlayed: true }), pick(MAYA)],
    });
    expect(heard(roundOf(1), reveal).map((e) => e.sound)).toEqual([
      'room-time-up',
    ]);
    expect(heard(roundOf(1), reveal, WATCHER).map((e) => e.sound)).toEqual([
      'room-reveal',
    ]);
  });

  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard();
    const open = roundOf(4);
    const locked = roundOf(4, { lockedIn: [MAYA] });
    const reveal = roundOf(4, { phase: 'reveal', lastRound: [pick(MAYA)] });
    expect(room(open)).toEqual([]);
    expect(room(locked)).toEqual(['room-pip']);
    expect(room(reveal)).toEqual(['room-reveal']);
    expect(room(locked)).toEqual([]);
    expect(room(reveal)).toEqual([]);
  });

  it('takes a reconnection as a baseline, and a game unseen as new', () => {
    const room = guard();
    room(roundOf(5));
    expect(room(roundOf(5, { lockedIn: [MAYA] }))).toEqual(['room-pip']);
    // Back after a drop, in the next game, at the same round.
    expect(room(roundOf(5), 2, true)).toEqual([]);
    expect(room(roundOf(5, { lockedIn: [MAYA] }), 2)).toEqual([]);
    const board = Array.from({ length: 81 }, () => -1);
    board[0] = 1;
    const opened = roundOf(5, { board });
    room(opened, 3, true);
    expect(room(roundOf(5, { lockedIn: [MAYA] }), 4, true)).toEqual([]);
    // The board lost a cell open before: another game, whose keys are new.
    expect(room(roundOf(5, { lockedIn: [MAYA, LEO] }), 4)).toEqual([
      'room-pip',
    ]);
  });

  it('tells another game by its rounds, its board, or a cell that closed', () => {
    const board = Array.from({ length: 81 }, () => -1);
    board[10] = 2;
    const late = roundOf(6, { board });
    expect(isNewMinesweeperGame(late, roundOf(2, { board }))).toBe(true);
    expect(isNewMinesweeperGame(late, roundOf(7))).toBe(true);
    expect(
      isNewMinesweeperGame(late, roundOf(7, { difficulty: 'Medium', board })),
    ).toBe(true);
    const more = [...board];
    more[11] = 0;
    expect(isNewMinesweeperGame(late, roundOf(7, { board: more }))).toBe(false);
  });

  it('ticks only for a seated player who has not picked', () => {
    expect(actingDeadline(roundOf(2), ME)).toBe('2:picking');
    expect(actingDeadline(roundOf(2, { myPick: 3 }), ME)).toBeNull();
    expect(actingDeadline(roundOf(2), WATCHER)).toBeNull();
    expect(actingDeadline(roundOf(2, { phase: 'reveal' }), ME)).toBeNull();
    expect(actingDeadline(minesweeperState(table), ME)).toBeNull();
  });
});

describe('Minesweeper on your own, heard', () => {
  const solo = () =>
    createReplayGuard(deriveSoloSounds(deriveMinesweeperSolo), {
      isNewGame: () => false,
      select: endAlone,
    });
  // A first click in a corner of a board laid around it: an opening.
  const first = (game: SoloGame) => reveal(game, 0, 1000, () => 0.5);

  it('opens a cell, or many at once, each once', () => {
    const game = newGame('Small');
    const opened = first(game);
    expect(deriveMinesweeperSolo(game, opened).map((e) => e.sound)).toEqual([
      'minesweeper-cascade',
    ]);
    // A flag opens nothing.
    expect(deriveMinesweeperSolo(opened, toggleFlag(opened, 80))).toEqual([]);
  });

  it('hears the mine as the loss alone, after a first state that plays nothing', () => {
    const game = solo();
    const opened = first(newGame('Small'));
    expect(game.observe({ game: opened, end: null })).toEqual([]);
    const mine = opened.layout.indexOf(true);
    const lost = reveal(opened, mine, 2000);
    expect(
      game.observe({ game: lost, end: 'loss' }).map((e) => e.sound),
    ).toEqual(['stinger-solo-loss']);
  });
});
