import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LiarsDiceBid,
  LiarsDiceCup,
  LiarsDiceReveal,
  LiarsDiceRoomState,
} from '../../../shared/wire-types';
import { seededRandom } from '../../../shared/seed';
import { BESIDE_AFTER_MS, createReplayGuard } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import { roomPath } from '../games/catalog';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { deriveSoloSounds, endAlone } from '../solo/sounds';
import { liarsDiceState, ME } from '../tests/fixtures';
import { FakeSocket } from '../tests/fake-socket';
import { renderApp } from '../tests/render-app';
import {
  bid as soloBid,
  call as soloCall,
  newGame,
  nextRound,
  YOU,
  type SoloGame,
} from './solo/game';
import {
  actingDeadline,
  deriveLiarsDiceSolo,
  deriveLiarsDiceSounds,
  isNewLiarsDiceGame,
  LIARS_DICE_SOUNDS,
  LOSE_DIE_AFTER_MS,
  REVEAL_AFTER_MS,
  turnOf,
} from './sounds';

// The same dice and the same bots every run, for the page on your own.
vi.mock('./solo/random', () => {
  let random = seededRandom(1);
  return {
    soloRandom: () => random(),
    reseed: (seed: number) => {
      random = seededRandom(seed);
    },
  };
});
const { reseed } = (await import('./solo/random')) as unknown as {
  reseed: (seed: number) => void;
};

const MAYA = 'p2';
const LEO = 'p3';
const WATCHER = 'p9';

const seat = (username: string, points = 3) => ({
  username,
  points,
  isConnected: true,
});

const table = {
  playerList: { [ME]: seat('Ryan'), [MAYA]: seat('Maya'), [LEO]: seat('Leo') },
  spectators: { [WATCHER]: seat('Sam', 0) },
};

const cup = (playerId: string, diceLeft = 3): LiarsDiceCup => ({
  playerId,
  diceLeft,
  dice: null,
  outInRound: diceLeft === 0 ? 1 : null,
});

const three = [cup(ME), cup(MAYA), cup(LEO)];

const bidBy = (playerId: string, count = 2, face = 3): LiarsDiceBid => ({
  playerId,
  count,
  face,
});

/** Round `round` open for bids, by `by` in order; `turn` is the next to bid. */
const bidding = (
  round: number,
  cups: LiarsDiceCup[],
  by: string[],
  turn: string,
) =>
  liarsDiceState({
    ...table,
    isGameStarted: true,
    phase: 'bidding',
    round,
    cups,
    bids: by.map((playerId, index) => bidBy(playerId, index + 1)),
    turnPlayerId: turn,
    phaseEndsInMs: 20_000,
  });

/** Maya's bid called by Ryan, who was right: Maya loses a die. */
const found: LiarsDiceReveal = {
  bid: bidBy(MAYA),
  callerId: ME,
  matched: 1,
  wild: 0,
  loserId: MAYA,
  out: false,
};

/** The call's reveal, the dice already counted off Maya. */
const revealed = (round: number, reveal = found) =>
  liarsDiceState({
    ...table,
    isGameStarted: true,
    phase: 'reveal',
    round,
    cups: [cup(ME), cup(MAYA, 2), cup(LEO)],
    bids: [bidBy(MAYA)],
    reveal,
  });

const heard = (
  prev: LiarsDiceRoomState,
  next: LiarsDiceRoomState,
  viewer = ME,
) => deriveLiarsDiceSounds(viewer)(prev, next);

const sounds = (
  prev: LiarsDiceRoomState,
  next: LiarsDiceRoomState,
  viewer = ME,
) => heard(prev, next, viewer).map((e) => e.sound);

const viewOf = (
  state: LiarsDiceRoomState,
  viewer: string,
  connection: number,
): RoomSoundView => ({
  state,
  // The viewer's go while they bid, as the room names it.
  turn:
    state.isGameStarted &&
    state.phase === 'bidding' &&
    state.turnPlayerId === viewer
      ? turnOf(state)
      : null,
  connection,
  readied: 0,
});

/** The events of each snapshot the room hears, with their delays. */
const timedGuard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, LIARS_DICE_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return (state: LiarsDiceRoomState, connection = 1, resync = false) =>
    inner.observe(viewOf(state, viewer, connection), resync);
};

const guard = (viewer = ME) => {
  const timed = timedGuard(viewer);
  return (state: LiarsDiceRoomState, connection = 1, resync = false) =>
    timed(state, connection, resync).map((e) => e.sound);
};

const OPEN = bidding(2, three, [], MAYA);

const at = (round: number, cups: LiarsDiceCup[], bids = 0) =>
  liarsDiceState({
    isGameStarted: true,
    phase: 'bidding',
    round,
    cups,
    bids: Array.from({ length: bids }, () => bidBy(ME)),
  });
const five = [cup(ME, 5), cup(MAYA, 5), cup(LEO, 5)];

describe('a Liar’s Dice room’s goes and games', () => {
  it('names each bid within its roll, by the dice still in', () => {
    expect(turnOf(at(3, five))).toBe('3.15.0');
    expect(turnOf(at(3, five, 2))).toBe('3.15.2');
  });

  it('never names a go twice when a round is rolled again', () => {
    // Leo leaves with dice two bids in: round 3 is rolled again without him.
    const before = [0, 1, 2].map((bids) => turnOf(at(3, five, bids)));
    const again = [0, 1, 2].map((bids) =>
      turnOf(at(3, [cup(ME, 5), cup(MAYA, 5)], bids)),
    );
    expect(new Set([...before, ...again]).size).toBe(6);
  });

  it('keeps the go’s name when a player already out leaves', () => {
    const out = { ...cup(LEO, 0), outInRound: 2 };
    const go = at(3, [cup(ME, 5), cup(MAYA, 5), out], 2);
    expect(turnOf(at(3, [cup(ME, 5), cup(MAYA, 5)], 2))).toBe(turnOf(go));
  });

  it('tells another game by its rounds, its players, or its dice', () => {
    const late = at(4, [cup(ME, 3), cup(MAYA, 2)]);
    expect(isNewLiarsDiceGame(late, at(1, [cup(ME, 5), cup(MAYA, 5)]))).toBe(
      true,
    );
    expect(isNewLiarsDiceGame(late, at(4, [cup(ME, 3), cup(LEO, 2)]))).toBe(
      true,
    );
    expect(isNewLiarsDiceGame(late, at(4, [cup(ME, 5), cup(MAYA, 5)]))).toBe(
      true,
    );
    // The same game, further on: a die lost, a player gone.
    expect(isNewLiarsDiceGame(late, at(5, [cup(ME, 3), cup(MAYA, 1)]))).toBe(
      false,
    );
    expect(isNewLiarsDiceGame(late, at(4, [cup(ME, 3)]))).toBe(false);
  });

  it('ticks only for the player whose bid it is', () => {
    expect(actingDeadline(OPEN, MAYA)).toBe('2.9.0:bidding');
    expect(actingDeadline(OPEN, ME)).toBeNull();
    expect(actingDeadline(OPEN, WATCHER)).toBeNull();
    expect(actingDeadline(revealed(2), ME)).toBeNull();
    expect(actingDeadline(liarsDiceState(table), ME)).toBeNull();
    // Each go is its own deadline.
    expect(actingDeadline(bidding(2, three, [LEO, ME], MAYA), MAYA)).toBe(
      '2.9.2:bidding',
    );
  });
});

describe('a Liar’s Dice room, heard', () => {
  it('places each new bid once: yours at full level, everybody else’s softer', () => {
    const next = bidding(2, three, [MAYA], LEO);
    expect(heard(OPEN, next)).toEqual([
      { sound: 'liars-dice-bid', key: 'bid:2.9.0', other: true },
    ]);
    expect(heard(OPEN, next, MAYA)).toEqual([
      { sound: 'liars-dice-bid', key: 'bid:2.9.0', other: false },
    ]);
    expect(heard(OPEN, next, WATCHER)[0]?.other).toBe(true);
    // Nothing new: the same bids again, or a later change in the round.
    expect(heard(next, { ...next })).toEqual([]);
    expect(sounds(next, bidding(2, three, [MAYA, LEO], ME))).toEqual([
      'liars-dice-bid',
    ]);
    expect(heard(next, bidding(2, three, [MAYA, LEO], ME))[0]?.key).toBe(
      'bid:2.9.1',
    );
  });

  it('rattles the dice as a round begins, for a player who has dice', () => {
    const lost = revealed(2);
    const next = bidding(3, [cup(ME), cup(MAYA, 2), cup(LEO)], [], MAYA);
    expect(heard(lost, next)).toEqual([
      { sound: 'liars-dice-roll', key: 'roll:3.8' },
    ]);
    // A spectator has no cup, and a player already out has no dice.
    expect(heard(lost, next, WATCHER)).toEqual([]);
    const out = bidding(3, [cup(ME), cup(MAYA, 0), cup(LEO)], [], ME);
    expect(heard(lost, out, MAYA)).toEqual([]);
  });

  it('rattles again when a round is called off and rolled again', () => {
    const before = bidding(3, three, [MAYA, LEO], ME);
    // Leo, with dice, leaves: the round starts over under the same number.
    const again = bidding(3, [cup(ME), cup(MAYA)], [], MAYA);
    expect(heard(before, again)).toEqual([
      { sound: 'liars-dice-roll', key: 'roll:3.6' },
    ]);
    // A player already out leaving takes no dice: nothing new.
    const out = cup(LEO, 0);
    expect(
      heard(
        bidding(3, [cup(ME), cup(MAYA), out], [MAYA], LEO),
        bidding(3, [cup(ME), cup(MAYA)], [MAYA], LEO),
      ),
    ).toEqual([]);
  });

  it('calls Liar in three beats, with the caller’s and the loser’s own at full level', () => {
    const before = bidding(2, three, [MAYA], ME);
    const after = revealed(2);
    expect(heard(before, after)).toEqual([
      { sound: 'liars-dice-liar', key: 'call:2', other: false },
      {
        sound: 'liars-dice-reveal',
        key: 'reveal:2',
        delayMs: REVEAL_AFTER_MS,
      },
      {
        sound: 'liars-dice-lose-die',
        key: 'lose:2',
        other: true,
        delayMs: LOSE_DIE_AFTER_MS,
      },
    ]);
    // Maya lost the die; Leo watched.
    const maya = heard(before, after, MAYA);
    expect(maya[0]).toMatchObject({ sound: 'liars-dice-liar', other: true });
    expect(maya[2]).toMatchObject({
      sound: 'liars-dice-lose-die',
      other: false,
    });
    expect(heard(before, after, WATCHER).map((e) => e.other)).toEqual([
      true,
      undefined,
      true,
    ]);
    // The reveal staying up, or its next snapshot, adds nothing.
    expect(heard(after, { ...after })).toEqual([]);
    expect(heard(after, revealed(2, { ...found }))).toEqual([]);
  });

  it('keeps the beats in order: Liar, the cups, then the die', () => {
    expect(REVEAL_AFTER_MS).toBeGreaterThan(0);
    expect(LOSE_DIE_AFTER_MS).toBeGreaterThan(REVEAL_AFTER_MS);
  });

  it('hears the call that ends the game as the game’s end, and an early end not at all', () => {
    const room = guard(ME);
    const last = bidding(4, [cup(ME, 1), cup(MAYA, 1)], [MAYA], ME);
    room(last);
    const over = liarsDiceState({
      ...table,
      isGameStarted: false,
      phase: 'waiting',
      round: 4,
      cups: [cup(ME, 1), cup(MAYA, 0)],
      reveal: { ...found, out: true },
      lastGame: {
        endedEarly: false,
        dicePerPlayer: 3,
        rounds: 4,
        standings: [
          { playerId: ME, username: 'Ryan', points: 1, outInRound: null },
          { playerId: MAYA, username: 'Maya', points: 0, outInRound: 4 },
        ],
      },
    });
    expect(room(over)).toEqual(['stinger-win']);
    expect(guard(MAYA)(last)).toEqual([]);
    const loser = guard(MAYA);
    loser(last);
    expect(loser(over)).toEqual(['stinger-nice-game']);

    // A game cut short sounds no result and no call.
    const early = guard(ME);
    early(last);
    expect(
      early({ ...over, lastGame: { ...over.lastGame!, endedEarly: true } }),
    ).toEqual([]);
  });
});

describe('a Liar’s Dice room through the replay guard', () => {
  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const room = guard();
    const one = bidding(2, three, [MAYA], LEO);
    expect(room(OPEN)).toEqual([]);
    expect(room(one)).toEqual(['liars-dice-bid']);
    expect(room({ ...one })).toEqual([]);
    expect(room(OPEN)).toEqual([]);
    expect(room(one)).toEqual([]);
  });

  it('hears a bid that hands you the go, and your go after it', () => {
    const timed = timedGuard();
    timed(OPEN);
    timed(bidding(2, three, [MAYA], LEO));
    expect(
      timed(bidding(2, three, [MAYA, LEO], ME)).map((e) => [
        e.sound,
        e.other,
        e.delayMs,
      ]),
    ).toEqual([
      ['liars-dice-bid', true, undefined],
      ['room-your-turn', undefined, BESIDE_AFTER_MS.turn],
    ]);
    const room = guard();
    room(OPEN);
    room(bidding(2, three, [MAYA], LEO));
    expect(room(bidding(2, three, [MAYA, LEO], ME))).toEqual([
      'liars-dice-bid',
      'room-your-turn',
    ]);
    // Your own bid is yours; the next go is somebody else’s.
    expect(room(bidding(2, three, [MAYA, LEO, ME], MAYA))).toEqual([
      'liars-dice-bid',
    ]);
  });

  it('plays a whole round once, then the next round’s dice', () => {
    const room = guard(LEO);
    room(OPEN);
    expect(room(bidding(2, three, [MAYA], LEO))).toEqual([
      'liars-dice-bid',
      'room-your-turn',
    ]);
    expect(room(bidding(2, three, [MAYA, LEO], ME))).toEqual([
      'liars-dice-bid',
    ]);
    expect(room(revealed(2, { ...found, callerId: ME }))).toEqual([
      'liars-dice-liar',
      'liars-dice-reveal',
      'liars-dice-lose-die',
    ]);
    const next = bidding(3, [cup(ME), cup(MAYA, 2), cup(LEO)], [], MAYA);
    expect(room(next)).toEqual(['liars-dice-roll']);
  });

  it('plays the dice of the next round when you open it, and your go after them', () => {
    const room = timedGuard(MAYA);
    room(revealed(2));
    const next = bidding(3, [cup(ME), cup(MAYA, 2), cup(LEO)], [], MAYA);
    expect(room(next).map((e) => [e.sound, e.delayMs])).toEqual([
      ['liars-dice-roll', undefined],
      ['room-your-turn', BESIDE_AFTER_MS.turn],
    ]);
  });

  it('plays only the go, at once, in a hidden tab', () => {
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    try {
      const room = timedGuard();
      room(OPEN);
      room(bidding(2, three, [MAYA], LEO));
      expect(room(bidding(2, three, [MAYA, LEO], ME))).toEqual([
        { sound: 'room-your-turn', key: 'turn:2.9.2' },
      ]);
    } finally {
      visibility.mockRestore();
    }
  });

  it('opens the game on your go with the dice, but not the start, when you bid first', () => {
    const first = guard(MAYA);
    first(liarsDiceState({ ...table }));
    expect(first(bidding(1, three, [], MAYA))).toEqual([
      'liars-dice-roll',
      'room-your-turn',
    ]);
    // Anybody else hears the start, whose stinger stands alone.
    const other = guard(LEO);
    other(liarsDiceState({ ...table }));
    expect(other(bidding(1, three, [], MAYA))).toEqual(['stinger-game-start']);
  });

  it('never takes a snapshot from earlier for something new', () => {
    const room = guard(LEO);
    room(bidding(2, three, [MAYA], LEO));
    expect(room(bidding(2, three, [MAYA, LEO], ME))).toEqual([
      'liars-dice-bid',
    ]);
    // Round 2 again, a round before, then the round where it was.
    expect(room(revealed(2))).toEqual([
      'liars-dice-liar',
      'liars-dice-reveal',
      'liars-dice-lose-die',
    ]);
    expect(room(bidding(2, three, [MAYA, LEO], ME))).toEqual([]);
    expect(room(bidding(1, three, [LEO], MAYA))).toEqual([]);
    expect(room(revealed(2))).toEqual([]);
  });

  it('takes a reconnection as a baseline, and your go on arrival as heard', () => {
    const room = guard();
    room(OPEN);
    room(bidding(2, three, [MAYA], LEO));
    // Back after a drop, two bids on and the go yours.
    expect(room(bidding(2, three, [MAYA, LEO], ME), 2, true)).toEqual([]);
    expect(room(bidding(2, three, [MAYA, LEO], ME), 2)).toEqual([]);
    expect(room(bidding(2, three, [MAYA, LEO, ME], MAYA), 2)).toEqual([
      'liars-dice-bid',
    ]);
  });

  it('plays the next game anew, across a reconnection too', () => {
    const room = guard();
    room(bidding(5, [cup(ME, 2), cup(MAYA, 1)], [MAYA], ME), 1);
    // Away for a whole game: back in round 2 of the next, same bid index.
    expect(room(bidding(2, [cup(ME), cup(MAYA)], [], MAYA), 2, true)).toEqual(
      [],
    );
    expect(room(bidding(2, [cup(ME), cup(MAYA)], [MAYA], ME), 2)).toEqual([
      'liars-dice-bid',
      'room-your-turn',
    ]);
  });
});

/** The app in a Liar's Dice room, with every sound it plays recorded. */
async function playRoom() {
  const engine = new AudioEngine({});
  const play = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const fake = new FakeSocket();
  fake.answer('room:sync', () => ({ ok: true as const }));
  const view = await renderApp(roomPath('liars-dice', 'r1'), { fake, engine });
  const played = () =>
    play.mock.calls.map(([spec, options]: [SoundSpec, PlayOptions?]) =>
      [
        spec.id,
        options?.other ? 'other' : '',
        options?.variant ? `step ${options.variant}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  const send = (state: LiarsDiceRoomState) =>
    act(() => fake.serverEmits('room:state', state));
  return { ...view, fake, play, played, send };
}

describe('a Liar’s Dice room, heard in the app', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays a round for each player at the right moments, once', async () => {
    const { played, send } = await playRoom();
    send(liarsDiceState(table));
    expect(played()).toEqual([]);

    send(bidding(1, three, [], MAYA));
    send(bidding(1, three, [MAYA], LEO));
    // The last seconds of Ryan's bid tick with the clock beside them.
    send(bidding(1, three, [MAYA, LEO], ME));
    for (let second = 0; second < 19; second++) {
      await act(() => vi.advanceTimersByTimeAsync(1000));
    }
    send(bidding(1, three, [MAYA, LEO, ME], MAYA));
    send(
      revealed(1, { ...found, bid: bidBy(ME), callerId: MAYA, loserId: ME }),
    );
    await act(() => vi.advanceTimersByTimeAsync(LOSE_DIE_AFTER_MS));
    send(bidding(2, [cup(ME, 2), cup(MAYA), cup(LEO)], [], LEO));
    expect(played()).toEqual([
      'stinger-game-start',
      'liars-dice-bid other',
      'liars-dice-bid other',
      'room-your-turn',
      'room-tick step 1',
      'room-tick step 2',
      'room-tick step 3',
      'room-tick step 4',
      'room-tick step 5',
      'liars-dice-bid',
      'liars-dice-liar other',
      'liars-dice-reveal',
      'liars-dice-lose-die',
      'liars-dice-roll',
    ]);
  });

  it('plays nothing it played before when the page comes back', async () => {
    const first = await playRoom();
    first.send(bidding(2, three, [MAYA], ME));
    expect(first.played()).toEqual([]);
    first.send(bidding(2, three, [MAYA, ME], LEO));
    expect(first.played()).toEqual(['liars-dice-bid']);
    first.unmount();

    // A refresh mid-round: its first state, and the next bids it sees.
    const again = await playRoom();
    again.send(bidding(2, three, [MAYA, ME], LEO));
    again.send({ ...bidding(2, three, [MAYA, ME], LEO) });
    expect(again.played()).toEqual([]);
    again.send(bidding(2, three, [MAYA, ME, LEO], MAYA));
    expect(again.played()).toEqual(['liars-dice-bid other']);
  });
});

const picks = { bots: 2, dicePerPlayer: 3 } as const;

/** A table of you and Pip, one die each: you bid, and Pip calls. */
const duel = (): SoloGame => {
  const game = newGame({ bots: 1, dicePerPlayer: 3 }, seededRandom(3));
  const seats = game.seats.map((place) => ({
    ...place,
    diceLeft: 1,
    dice: place.id === YOU ? [4] : [2],
  }));
  return { ...game, seats, turnId: YOU };
};

describe('Liar’s Dice on your own, heard', () => {
  it('hears a bot’s bid softly and yours at full level, each once', () => {
    const game = { ...newGame(picks, seededRandom(5)), turnId: YOU };
    const yours = soloBid(game, YOU, { count: 1, face: 2 });
    expect(deriveLiarsDiceSolo(game, yours)).toEqual([
      { sound: 'liars-dice-bid', key: 'bid:1.0', other: false },
    ]);
    const bot = yours.turnId!;
    const theirs = soloBid(yours, bot, { count: 1, face: 3 });
    expect(deriveLiarsDiceSolo(yours, theirs)).toEqual([
      { sound: 'liars-dice-bid', key: 'bid:1.1', other: true },
    ]);
    expect(deriveLiarsDiceSolo(theirs, theirs)).toEqual([]);
  });

  it('hears a call in three beats, and the next round’s dice', () => {
    const game = duel();
    const bid = soloBid(game, YOU, { count: 2, face: 5 });
    const called = soloCall(bid, bid.turnId!);
    expect(deriveLiarsDiceSolo(bid, called)).toEqual([
      { sound: 'liars-dice-liar', key: 'call:1', other: true },
      {
        sound: 'liars-dice-reveal',
        key: 'reveal:1',
        delayMs: REVEAL_AFTER_MS,
      },
      {
        sound: 'liars-dice-lose-die',
        key: 'lose:1',
        other: false,
        delayMs: LOSE_DIE_AFTER_MS,
      },
    ]);
    // A round that goes on: you lose a die, and the next round rattles.
    const long = newGame(picks, seededRandom(5));
    const seats = long.seats.map((place) => ({
      ...place,
      dice: place.id === YOU ? [4, 4, 4] : [2, 2, 2],
    }));
    const open = { ...long, seats, turnId: YOU };
    const lie = soloBid(open, YOU, { count: 1, face: 5 });
    const lost = soloCall(lie, lie.turnId!);
    expect(lost.phase).toBe('reveal');
    expect(deriveLiarsDiceSolo(lost, nextRound(lost, seededRandom(9)))).toEqual(
      [{ sound: 'liars-dice-roll', key: 'roll:2' }],
    );
  });

  it('hears the call that ends it as its end alone, and a refresh on it not at all', () => {
    const game = duel();
    const bid = soloBid(game, YOU, { count: 2, face: 5 });
    const called = soloCall(bid, bid.turnId!);
    // You bid two 5s on one die each; Pip called, and you lost your last die.
    expect(called.phase).toBe('over');
    const run = createReplayGuard(deriveSoloSounds(deriveLiarsDiceSolo), {
      isNewGame: () => false,
      select: endAlone,
    });
    expect(run.observe({ game: bid, end: null })).toEqual([]);
    expect(
      run.observe({ game: called, end: 'loss' as const }).map((e) => e.sound),
    ).toEqual(['stinger-solo-loss']);

    const fresh = createReplayGuard(deriveSoloSounds(deriveLiarsDiceSolo), {
      isNewGame: () => false,
      select: endAlone,
    });
    expect(fresh.observe({ game: called, end: 'loss' as const })).toEqual([]);
    expect(fresh.observe({ game: called, end: 'loss' as const })).toEqual([]);
    expect(called.reveal?.callerId).not.toBe(YOU);
  });
});

async function openSolo() {
  const engine = new AudioEngine({});
  const play = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const played = () =>
    play.mock.calls.map(([spec, options]: [SoundSpec, PlayOptions?]) =>
      options?.other ? `${spec.id} other` : spec.id,
    );
  const view = await renderApp('/games/liars-dice/solo', { engine });
  return { ...view, played, play };
}

describe('Liar’s Dice on your own, heard in the app', () => {
  beforeEach(() => {
    localStorage.clear();
    reseed(7);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays the bids, the call and the end of a game, and nothing on a refresh', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const first = await openSolo();
    expect(first.played()).toEqual([]);
    // Play to the end: Liar whenever you can, and the lowest opening.
    for (let step = 0; step < 400; step++) {
      if (screen.queryByRole('heading', { name: /^(You won|You finished)/ })) {
        break;
      }
      const next = screen.queryByRole('button', { name: 'Next round' });
      const liar = screen.queryByRole('button', { name: 'Call Liar' });
      const open = screen.queryByRole('button', { name: /^Bid / });
      if (next) await user.click(next);
      else if (liar) await user.click(liar);
      else if (open) await user.click(open);
      else await act(() => vi.advanceTimersByTimeAsync(1000));
    }
    await act(() => vi.advanceTimersByTimeAsync(2000));
    const all = first.played();
    // The game's end is heard once.
    expect(all.filter((id) => id.startsWith('stinger-'))).toHaveLength(1);
    expect(all.find((id) => id.startsWith('stinger-'))).toMatch(
      /^stinger-(win|solo-loss)$/,
    );
    expect(all).toContain('liars-dice-bid other');
    expect(all).toContain('liars-dice-liar');
    expect(all).toContain('liars-dice-roll');
    // A bot calling Liar is somebody else’s doing.
    expect(
      all.filter((id) => id === 'liars-dice-lose-die').length +
        all.filter((id) => id === 'liars-dice-lose-die other').length,
    ).toBeGreaterThan(0);

    // A refresh starts a fresh table: its first state is silent.
    first.unmount();
    const again = await openSolo();
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(again.played()).toEqual([]);
  });
});
