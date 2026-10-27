import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findTrios, isTrio } from '../../../shared/trios';
import type { TriosRoomState } from '../../../shared/wire-types';
import { createReplayGuard } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { deriveSoloSounds, endAlone } from '../solo/sounds';
import { renderApp } from '../tests/render-app';
import { ME, triosState } from '../tests/fixtures';
import {
  afterFlash,
  FLASH_MS,
  hint,
  newRun,
  pick,
  type SoloRun,
} from './solo/run';
import {
  deriveTriosSolo,
  deriveTriosSounds,
  isNewTriosGame,
  TRIOS_SOUNDS,
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

const taken = (playerId: string, cards = [0, 1, 2]) => ({
  playerId,
  username: playerId,
  cards,
  places: [0, 1, 2],
});

/** A game under way with `found` trios found, finding unless said otherwise. */
const gameAt = (
  found: number,
  overrides: Partial<TriosRoomState> = {},
): TriosRoomState =>
  triosState({
    ...table,
    isGameStarted: true,
    phase: 'finding',
    found,
    table: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    searchingMs: 1000,
    ...overrides,
  });

const heard = (prev: TriosRoomState, next: TriosRoomState, viewer = ME) =>
  deriveTriosSounds(viewer)(prev, next);

const viewOf = (state: TriosRoomState, connection = 1): RoomSoundView => ({
  state,
  turn: null,
  connection,
  readied: 0,
});

const guard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, TRIOS_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: TriosRoomState, connection = 1, resync = false) =>
    inner.observe(viewOf(state, connection), resync).map((e) => e.sound);
};

const lockedAt = (ms: number) =>
  gameAt(1, { searchingMs: ms, lockedOutMs: 3000, myMiss: [0, 1, 2] });
const free = (ms: number) => gameAt(1, { searchingMs: ms });

describe('a Trios room, heard', () => {
  it('rings your own trio, and softens everybody else’s', () => {
    const open = gameAt(2);
    const mine = gameAt(3, { phase: 'taken', lastTrio: taken(ME) });
    expect(heard(open, mine)).toEqual([
      { sound: 'trios-found', key: 'taken:3', other: false },
    ]);
    const maya = gameAt(3, { phase: 'taken', lastTrio: taken(MAYA) });
    expect(heard(open, maya)).toEqual([
      { sound: 'trios-found', key: 'taken:3', other: true },
    ]);
    // A spectator has no trios of their own.
    expect(heard(open, maya, WATCHER)[0]).toMatchObject({ other: true });
    // The refill after the 2 seconds adds nothing.
    expect(heard(maya, gameAt(3, { lastTrio: taken(MAYA) }))).toEqual([]);
  });

  it('gives the hint to everybody, once for each', () => {
    const open = gameAt(4);
    const one = gameAt(4, { hint: [3] });
    const two = gameAt(4, { hint: [3, 7] });
    expect(heard(open, one)).toEqual([
      { sound: 'trios-hint', key: 'hint:4:1' },
    ]);
    expect(heard(one, two)).toEqual([{ sound: 'trios-hint', key: 'hint:4:2' }]);
    expect(heard(open, one, WATCHER)).toHaveLength(1);
    // A trio taken clears the hints, which is not a hint.
    expect(
      heard(two, gameAt(5, { phase: 'taken', lastTrio: taken(MAYA) })).map(
        (e) => e.sound,
      ),
    ).toEqual(['trios-found']);
  });

  it('buzzes your own wrong claim and clicks when its lockout ends, never anybody else’s', () => {
    const open = gameAt(1, { searchingMs: 8000 });
    const locked = gameAt(1, {
      searchingMs: 9000,
      lockedOutMs: 3000,
      myMiss: [0, 1, 2],
    });
    expect(heard(open, locked)).toEqual([
      { sound: 'ui-nope', key: 'miss:1:9000' },
    ]);
    // Still locked on the next snapshot: nothing.
    expect(
      heard(locked, { ...locked, searchingMs: 10_000, lockedOutMs: 2000 }),
    ).toEqual([]);
    expect(heard(locked, gameAt(1, { searchingMs: 12_000 }))).toEqual([
      { sound: 'ui-lockout-end', key: 'free:1:12000' },
    ]);
    // The server never tells anyone else: their snapshots do not change.
    expect(heard(open, { ...open, searchingMs: 9000 })).toEqual([]);
  });

  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard();
    const open = gameAt(2);
    const mine = gameAt(3, { phase: 'taken', lastTrio: taken(ME) });
    expect(room(open)).toEqual([]);
    expect(room(mine)).toEqual(['trios-found']);
    expect(room({ ...mine })).toEqual([]);
    expect(room(open)).toEqual([]);
    expect(room(mine)).toEqual([]);
  });

  it('hears a second wrong claim on the same cards, and each lockout ending', () => {
    const room = guard();
    room(free(1000));
    expect(room(lockedAt(2000))).toEqual(['ui-nope']);
    expect(room(free(5000))).toEqual(['ui-lockout-end']);
    expect(room(lockedAt(9000))).toEqual(['ui-nope']);
    expect(room(free(12_000))).toEqual(['ui-lockout-end']);
  });

  it('takes a reconnection as a baseline, with the lockout that went on without it', () => {
    const room = guard();
    room(gameAt(2));
    room(gameAt(3, { phase: 'taken', lastTrio: taken(MAYA) }));
    // Back after the next trio, hint and a miss, all of it unseen.
    expect(
      room(
        gameAt(4, {
          lastTrio: taken(ME),
          hint: [2],
          lockedOutMs: 1500,
          myMiss: [0, 1, 2],
        }),
        2,
        true,
      ),
    ).toEqual([]);
    // The lockout runs out live: heard.
    expect(room(gameAt(4, { lastTrio: taken(ME), hint: [2] }), 2)).toEqual([
      'ui-lockout-end',
    ]);
  });

  it('tells another game by its size, its count, its latest trio or points gone down', () => {
    const late = gameAt(5, { lastTrio: taken(MAYA) });
    expect(
      isNewTriosGame(late, gameAt(5, { trios: 20, lastTrio: taken(MAYA) })),
    ).toBe(true);
    expect(isNewTriosGame(late, gameAt(2, { lastTrio: taken(MAYA) }))).toBe(
      true,
    );
    // The same count, another trio taken last.
    expect(isNewTriosGame(late, gameAt(5, { lastTrio: taken(ME) }))).toBe(true);
    expect(
      isNewTriosGame(late, gameAt(5, { lastTrio: taken(MAYA, [3, 4, 5]) })),
    ).toBe(true);
    const scored = gameAt(5, {
      lastTrio: taken(MAYA),
      playerList: { ...table.playerList, [MAYA]: seat('Maya', 3) },
    });
    expect(isNewTriosGame(scored, gameAt(6, { lastTrio: taken(ME) }))).toBe(
      true,
    );
    expect(isNewTriosGame(late, gameAt(6, { lastTrio: taken(ME) }))).toBe(
      false,
    );
    expect(isNewTriosGame(late, { ...late, hint: [1] })).toBe(false);
  });

  it('hears the next game’s first trio after a reconnection into it', () => {
    const room = guard();
    room(gameAt(3, { lastTrio: taken(MAYA) }));
    room(gameAt(3, { phase: 'taken', lastTrio: taken(ME) }));
    // Back in the next game, at the same count but another latest trio.
    room(gameAt(3, { lastTrio: taken(MAYA, [9, 10, 11]) }), 2, true);
    expect(
      room(gameAt(4, { phase: 'taken', lastTrio: taken(MAYA, [3, 4, 5]) }), 2),
    ).toEqual(['trios-found']);
  });
});

const solo = () =>
  createReplayGuard(deriveSoloSounds(deriveTriosSolo), {
    isNewGame: () => false,
    select: endAlone,
  });

/** The cards of a place that are not a trio with the first two. */
const missFor = (run: SoloRun) => {
  const cards = run.deal.table;
  const third = cards.findIndex(
    (_, place) => place > 1 && !isTrio(cards[0]!, cards[1]!, cards[place]!),
  );
  return [0, 1, third];
};

describe('a Trios run, heard', () => {
  it('hears a trio, a wrong pick and a hint once each, and nothing for the first state', () => {
    const game = solo();
    let run = newRun('k3f9x2', 0);
    expect(game.observe({ game: run, end: null })).toEqual([]);

    for (const place of missFor(run)) run = pick(run, place, 1000);
    expect(game.observe({ game: run, end: null })).toEqual([
      { sound: 'ui-nope', key: 'game:wrong:1' },
    ]);
    run = afterFlash(run, 1700);
    expect(game.observe({ game: run, end: null })).toEqual([]);

    run = hint(run);
    expect(game.observe({ game: run, end: null })).toEqual([
      { sound: 'trios-hint', key: 'game:hint:1' },
    ]);

    for (const place of findTrios(run.deal.table)[0]!) {
      run = pick(run, place, 4000);
    }
    expect(game.observe({ game: run, end: null })).toEqual([
      { sound: 'trios-found', key: 'game:found:1' },
    ]);
    // The new cards, and the next trio's counts starting from nothing again.
    run = afterFlash(run, 4700);
    expect(game.observe({ game: run, end: null })).toEqual([]);
    for (const place of missFor(run)) run = pick(run, place, 5000);
    expect(game.observe({ game: run, end: null })).toEqual([
      { sound: 'ui-nope', key: 'game:wrong:2' },
    ]);
  });

  it('hears the run’s end once, after the tenth trio', () => {
    const game = solo();
    let run = newRun('k3f9x2', 0);
    game.observe({ game: run, end: null });
    for (let found = 1; found <= 10; found++) {
      for (const place of findTrios(run.deal.table)[0]!) {
        run = pick(run, place, found * 1000);
      }
      expect(game.observe({ game: run, end: null })).toEqual([
        { sound: 'trios-found', key: `game:found:${found}` },
      ]);
      run = afterFlash(run, found * 1000 + 700);
      if (found < 10) game.observe({ game: run, end: null });
    }
    expect(
      game.observe({ game: run, end: 'complete' }).map((e) => e.sound),
    ).toEqual(['stinger-solo-complete']);
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
  const view = await renderApp('/games/trios/solo?seed=k3f9x2', { engine });
  return { ...view, played, play };
}

const cards = () =>
  within(screen.getByRole('group', { name: 'Table' })).getAllByRole('button');

describe('Trios on your own, heard in the app', () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lifts and sets down a card, judges three, and plays a hint once', async () => {
    const page = await openSolo();
    const model = newRun('k3f9x2', 0);
    expect(page.played()).toEqual([]);

    await user.click(cards()[0]!);
    await user.click(cards()[0]!);
    expect(page.played()).toEqual(['trios-pick', 'trios-unpick']);
    page.play.mockClear();

    for (const place of missFor(model)) await user.click(cards()[place]!);
    expect(page.played()).toEqual([
      'trios-pick',
      'trios-pick',
      'trios-pick',
      'ui-nope',
    ]);
    page.play.mockClear();

    await act(() => vi.advanceTimersByTimeAsync(FLASH_MS));
    await user.click(screen.getByRole('button', { name: /^Hint/ }));
    expect(page.played()).toEqual(['trios-hint']);
    page.play.mockClear();

    for (const place of findTrios(model.deal.table)[0]!) {
      await user.click(cards()[place]!);
    }
    expect(page.played()).toEqual([
      'trios-pick',
      'trios-pick',
      'trios-pick',
      'trios-found',
    ]);
  });
});
