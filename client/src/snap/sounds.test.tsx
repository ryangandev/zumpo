import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLANE } from '../../../shared/snap';
import type { SnapRoomState } from '../../../shared/wire-types';
import { createReplayGuard } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import { en } from '../i18n/en';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { deriveSoloSounds, endAlone } from '../solo/sounds';
import { ME, snapState } from '../tests/fixtures';
import { renderApp } from '../tests/render-app';
import {
  afterFlash,
  MATCH_FLASH_MS,
  matchNow,
  middleOf,
  newRun,
  RUN_CARDS,
  tap,
  WRONG_FLASH_MS,
  type SoloRun,
} from './solo/run';
import {
  deriveSnapSolo,
  deriveSnapSounds,
  isNewSnapGame,
  SNAP_SOUNDS,
} from './sounds';

const MAYA = 'p2';
const WATCHER = 'p9';

const seat = (username: string, points = 0) => ({
  username,
  points,
  isConnected: true,
});

const table = {
  playerList: { [ME]: seat('Ryan'), [MAYA]: seat('Maya') },
  spectators: { [WATCHER]: seat('Sam') },
};

/** Two cards of the plane as dealt: they share one symbol. */
const MINE = [...PLANE[0]!];
const middleNumbered = (number: number) => ({
  number,
  symbols: [...PLANE[(number % 30) + 1]!],
});

const took = (playerId: string, number: number) => ({
  playerId,
  username: playerId,
  number,
  symbol: 25,
});

/** The middle card `number` in play, `taken` cards taken so far. */
const cardAt = (
  number: number,
  overrides: Partial<SnapRoomState> = {},
): SnapRoomState =>
  snapState({
    ...table,
    isGameStarted: true,
    phase: 'finding',
    cards: 29,
    taken: number,
    middle: middleNumbered(number),
    myCard: MINE,
    cardMs: 1000,
    ...overrides,
  });

const lockedAt = (number: number, cardMs: number) =>
  cardAt(number, {
    cardMs,
    lockedOutMs: 2000,
    myMiss: { symbol: 0, on: 'mine' },
  });

const heard = (prev: SnapRoomState, next: SnapRoomState, viewer = ME) =>
  deriveSnapSounds(viewer)(prev, next);

const viewOf = (state: SnapRoomState, connection = 1): RoomSoundView => ({
  state,
  turn: null,
  connection,
  readied: 0,
});

const guard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, SNAP_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: SnapRoomState, connection = 1, resync = false) =>
    inner.observe(viewOf(state, connection), resync).map((e) => e.sound);
};

describe('a Snap room, heard', () => {
  it('slaps your own take, softens everybody else’s, and deals the next card quietly', () => {
    const open = cardAt(4);
    const mine = cardAt(5, {
      phase: 'taken',
      middle: open.middle,
      lastTake: took(ME, 5),
    });
    expect(heard(open, mine)).toEqual([
      { sound: 'snap-take', key: 'take:5', other: false },
    ]);
    const maya = { ...mine, lastTake: took(MAYA, 5) };
    expect(heard(open, maya)).toEqual([
      { sound: 'snap-take', key: 'take:5', other: true },
    ]);
    expect(heard(open, maya, WATCHER)[0]).toMatchObject({ other: true });
    // 1.5 seconds later the next card is turned up, for everybody.
    const dealt = cardAt(5, { lastTake: took(MAYA, 5) });
    expect(heard(maya, dealt)).toEqual([{ sound: 'snap-deal', key: 'deal:5' }]);
    expect(heard(maya, dealt, WATCHER)).toHaveLength(1);
  });

  it('buzzes your own wrong claim and clicks when its lockout ends, never anybody else’s', () => {
    const open = cardAt(4, { cardMs: 2000 });
    expect(heard(open, lockedAt(4, 3000))).toEqual([
      { sound: 'ui-nope', key: 'miss:4:3000' },
    ]);
    // Still locked a moment later, with the miss gone under a new card.
    const stillLocked = cardAt(5, { lockedOutMs: 900, myMiss: null });
    expect(
      heard(lockedAt(4, 3000), { ...stillLocked, middle: open.middle }),
    ).toEqual([]);
    expect(heard(lockedAt(4, 3000), cardAt(4, { cardMs: 5500 }))).toEqual([
      { sound: 'ui-lockout-end', key: 'free:4:5500' },
    ]);
    // Nobody else is told: their snapshots do not change.
    expect(heard(open, { ...open, cardMs: 3000 })).toEqual([]);
  });

  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard();
    const open = cardAt(4);
    const mine = cardAt(5, {
      phase: 'taken',
      middle: open.middle,
      lastTake: took(ME, 5),
    });
    expect(room(open)).toEqual([]);
    expect(room(mine)).toEqual(['snap-take']);
    expect(room({ ...mine })).toEqual([]);
    expect(room(open)).toEqual([]);
    expect(room(mine)).toEqual([]);
  });

  it('hears a second wrong claim on the same card, and each lockout ending', () => {
    const room = guard();
    room(cardAt(3, { cardMs: 1000 }));
    expect(room(lockedAt(3, 2000))).toEqual(['ui-nope']);
    expect(room(cardAt(3, { cardMs: 4500 }))).toEqual(['ui-lockout-end']);
    expect(room(lockedAt(3, 5000))).toEqual(['ui-nope']);
    expect(room(cardAt(3, { cardMs: 7500 }))).toEqual(['ui-lockout-end']);
  });

  it('takes a reconnection as a baseline, and the next game’s first take as new', () => {
    const room = guard();
    room(cardAt(2));
    room(
      cardAt(3, {
        phase: 'taken',
        middle: middleNumbered(2),
        lastTake: took(MAYA, 3),
      }),
    );
    // Back with more cards taken and dealt, unseen.
    expect(
      room(cardAt(6, { lastTake: took(ME, 6), lockedOutMs: 800 }), 2, true),
    ).toEqual([]);
    expect(room(cardAt(6, { lastTake: took(ME, 6) }), 2)).toEqual([
      'ui-lockout-end',
    ]);
    // Back in the next game, on the same card, dealt other symbols.
    const other = { number: 6, symbols: [...PLANE[9]!] };
    room(cardAt(6, { middle: other, lastTake: took(MAYA, 6) }), 3, true);
    expect(
      room(
        cardAt(7, {
          phase: 'taken',
          middle: other,
          lastTake: took(MAYA, 7),
        }),
        3,
      ),
    ).toEqual(['snap-take']);
  });

  it('tells another game by its cards, its middle card, or points gone down', () => {
    const late = cardAt(9);
    expect(isNewSnapGame(late, cardAt(9, { cards: 27 }))).toBe(true);
    expect(isNewSnapGame(late, cardAt(2))).toBe(true);
    expect(
      isNewSnapGame(
        late,
        cardAt(9, { middle: { ...late.middle!, symbols: [] } }),
      ),
    ).toBe(true);
    const scored = cardAt(9, {
      playerList: { ...table.playerList, [MAYA]: seat('Maya', 4) },
    });
    expect(isNewSnapGame(scored, cardAt(10))).toBe(true);
    expect(isNewSnapGame(late, cardAt(10))).toBe(false);
    expect(isNewSnapGame(late, { ...late, cardMs: 2000 })).toBe(false);
  });
});

const solo = () =>
  createReplayGuard(deriveSoloSounds(deriveSnapSolo), {
    isNewGame: () => false,
    select: endAlone,
  });

/** A symbol on your card but not the middle one. */
const wrongFor = (run: SoloRun) =>
  run.mine.find((symbol) => !middleOf(run).includes(symbol))!;

describe('a Snap run, heard', () => {
  it('hears a wrong tap, a take and the next card dealt once each, after a silent first state', () => {
    const game = solo();
    let run = newRun('k3f9x2', 0);
    expect(game.observe({ game: run, end: null })).toEqual([]);

    run = tap(run, wrongFor(run), 1000);
    expect(game.observe({ game: run, end: null })).toEqual([
      { sound: 'ui-nope', key: 'game:wrong:1' },
    ]);
    run = afterFlash(run, 1600);
    expect(game.observe({ game: run, end: null })).toEqual([]);

    run = tap(run, matchNow(run)!, 3000);
    expect(game.observe({ game: run, end: null })).toEqual([
      { sound: 'snap-take', key: 'game:take:1' },
    ]);
    run = afterFlash(run, 3500);
    expect(game.observe({ game: run, end: null })).toEqual([
      { sound: 'snap-deal', key: 'game:deal:1' },
    ]);
    // The next card starts its wrong taps from nothing again.
    run = tap(run, wrongFor(run), 4000);
    expect(game.observe({ game: run, end: null })).toEqual([
      { sound: 'ui-nope', key: 'game:wrong:2' },
    ]);
  });

  it('hears the run’s end once, after the thirtieth take, which is not dealt after', () => {
    const game = solo();
    let run = newRun('k3f9x2', 0);
    game.observe({ game: run, end: null });
    for (let taken = 1; taken <= RUN_CARDS; taken++) {
      run = tap(run, matchNow(run)!, taken * 1000);
      expect(game.observe({ game: run, end: null })).toEqual([
        { sound: 'snap-take', key: `game:take:${taken}` },
      ]);
      run = afterFlash(run, taken * 1000 + 500);
      const after = game.observe({ game: run, end: null });
      expect(after.map((e) => e.sound)).toEqual(
        taken < RUN_CARDS ? ['snap-deal'] : [],
      );
    }
    expect(
      game.observe({ game: run, end: 'best' }).map((e) => e.sound),
    ).toEqual(['stinger-new-best']);
  });
});

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
  const view = await renderApp('/games/snap/solo?seed=k3f9x2', { engine });
  return { ...view, played, play };
}

const card = (name: string) =>
  within(screen.getByRole('group', { name: new RegExp(`^${name}`) }));
const nameOf = (symbol: number) => en.ui.snap.symbol(symbol);

describe('Snap on your own, heard in the app', () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('buzzes a wrong tap, slaps a take and deals the next card, each once', async () => {
    const page = await openSolo();
    const model = newRun('k3f9x2', 0);
    expect(page.played()).toEqual([]);

    await user.click(
      card('Your card').getAllByRole('button')[
        model.mine.indexOf(wrongFor(model))
      ]!,
    );
    await act(() => vi.advanceTimersByTimeAsync(WRONG_FLASH_MS));
    expect(page.played()).toEqual(['ui-nope']);
    page.play.mockClear();

    await user.click(
      card('Middle card').getByRole('button', {
        name: nameOf(matchNow(model)!),
      }),
    );
    expect(page.played()).toEqual(['snap-take']);
    page.play.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(MATCH_FLASH_MS));
    expect(page.played()).toEqual(['snap-deal']);
  });
});
