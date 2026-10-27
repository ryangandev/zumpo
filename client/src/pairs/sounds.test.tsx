import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PairsCardView, PairsRoomState } from '../../../shared/wire-types';
import { createReplayGuard, SoundProvider } from '../audio';
import { AudioEngine } from '../audio/engine';
import { useRoomSounds } from '../room/sounds';
import { deriveSoloSounds, endAlone } from '../solo/sounds';
import { ME, pairsState } from '../tests/fixtures';
import { flip, newGame, turnBack, type SoloGame } from './solo/game';
import {
  actingDeadline,
  derivePairsSolo,
  derivePairsSounds,
  isNewPairsGame,
  newPairsGo,
  PAIRS_SOUNDS,
  streakOf,
} from './sounds';

/** The places of each symbol's two cards in `game`'s deck. */
function pairsOf(game: SoloGame): [number, number][] {
  const places = new Map<number, number[]>();
  game.deck.forEach((symbol, index) =>
    places.set(symbol, [...(places.get(symbol) ?? []), index]),
  );
  return [...places.values()].map(([a, b]) => [a!, b!]);
}

const solo = () =>
  createReplayGuard(deriveSoloSounds(derivePairsSolo), {
    isNewGame: () => false,
    select: endAlone,
  });

describe('Pairs on your own, heard', () => {
  const start = newGame('Small', 'k3f9x2');
  const [[a, b], [c, d]] = pairsOf(start) as [
    [number, number],
    [number, number],
  ];

  it('flips each card, and finds a pair a step higher each in a row', () => {
    const one = flip(start, a, 1);
    expect(derivePairsSolo(start, one)).toEqual([
      { sound: 'pairs-flip', key: 'flip:0' },
    ]);
    const pair = flip(one, b, 2);
    expect(derivePairsSolo(one, pair)).toEqual([
      { sound: 'pairs-match', key: 'turn:0', variant: 1 },
    ]);
    const second = flip(flip(pair, c, 3), d, 4);
    expect(derivePairsSolo(flip(pair, c, 3), second)).toEqual([
      { sound: 'pairs-match', key: 'turn:1', variant: 2 },
    ]);
  });

  it('turns a miss back once, by its timer or by the next card', () => {
    const one = flip(start, a, 1);
    const miss = flip(one, c, 2);
    expect(derivePairsSolo(one, miss)).toEqual([
      { sound: 'pairs-flip', key: 'turn:0' },
    ]);
    expect(derivePairsSolo(miss, turnBack(miss))).toEqual([
      { sound: 'pairs-miss', key: 'back:0' },
    ]);
    // The same card again, turning the miss back with it.
    expect(derivePairsSolo(miss, flip(miss, a, 3))).toEqual([
      { sound: 'pairs-miss', key: 'back:0' },
      { sound: 'pairs-flip', key: 'flip:1' },
    ]);
  });

  it('starts a streak again after a miss', () => {
    expect(streakOf([])).toBe(0);
    expect(streakOf([true, true])).toBe(2);
    expect(streakOf([true, false, true])).toBe(1);
    expect(streakOf([true, true, false])).toBe(0);
  });

  it('hears the last pair as the board’s end alone, after a silent first state', () => {
    const game = solo();
    let state = start;
    expect(game.observe({ game: state, end: null })).toEqual([]);
    const pairs = pairsOf(start);
    for (const [first, second] of pairs.slice(0, -1)) {
      state = flip(flip(state, first, 1), second, 2);
    }
    game.observe({ game: state, end: null });
    const [last, other] = pairs.at(-1)!;
    const up = flip(state, last, 3);
    expect(game.observe({ game: up, end: null }).map((e) => e.sound)).toEqual([
      'pairs-flip',
    ]);
    expect(
      game
        .observe({ game: flip(up, other, 4), end: 'best' })
        .map((e) => e.sound),
    ).toEqual(['stinger-new-best']);
  });
});

const MAYA = 'p2';

/**
 * A Small board in play: `up` face up, the first `pairs` pairs (cards 0 and
 * 1, 2 and 3, ...) found, every other card face down.
 */
function cardsWith(up: number[], pairs: number): PairsCardView[] {
  return Array.from({ length: 16 }, (_, index) =>
    index < pairs * 2
      ? { state: 'matched', symbol: Math.floor(index / 2) }
      : up.includes(index)
        ? { state: 'up', symbol: index }
        : { state: 'down', symbol: null },
  );
}

/** A go in a game under way: `turn` flips, `up` shows, `pairs` found. */
const at = (
  turn: string,
  up: number[] = [],
  pairs = 0,
  overrides: Partial<PairsRoomState> = {},
): PairsRoomState =>
  pairsState({
    isGameStarted: true,
    phase: up.length === 2 ? 'showing' : 'flipping',
    turnPlayerId: turn,
    cards: cardsWith(up, pairs),
    pairsFound: pairs,
    ...overrides,
  });

describe('a Pairs room’s goes', () => {
  it('begins another go as it passes, a miss turns back, or a go runs out', () => {
    expect(newPairsGo(at(ME), at(MAYA))).toBe(true);
    // A miss turning back, were the go to come straight back.
    expect(newPairsGo(at(ME, [4, 6]), at(ME))).toBe(true);
    // Out of time, were the go to come straight back too.
    expect(newPairsGo(at(ME, [4]), at(ME, [], 0, { timedOut: ME }))).toBe(true);
    expect(
      newPairsGo(
        at(MAYA, [], 0, { timedOut: ME }),
        at(MAYA, [], 0, { timedOut: MAYA }),
      ),
    ).toBe(true);
    // The game's first go.
    expect(newPairsGo(pairsState(), at(ME))).toBe(true);
  });

  it('keeps the go for a card, a pair, a miss showing, and a time up said', () => {
    expect(newPairsGo(at(ME), at(ME, [4]))).toBe(false);
    expect(newPairsGo(at(ME, [0]), at(ME, [], 1))).toBe(false);
    expect(newPairsGo(at(ME, [4]), at(ME, [4, 6]))).toBe(false);
    // The next player's first card clears whose go ran out.
    expect(newPairsGo(at(MAYA, [], 0, { timedOut: ME }), at(MAYA, [4]))).toBe(
      false,
    );
  });

  it('cannot see a go run out twice by one player without a card', () => {
    const late = at(ME, [], 0, { timedOut: ME });
    expect(newPairsGo(late, { ...late })).toBe(false);
  });

  it('tells another game by its board, fewer pairs, or a pair lost', () => {
    const late = at(ME, [], 3);
    expect(isNewPairsGame(late, at(ME, [], 1))).toBe(true);
    expect(isNewPairsGame(late, at(ME, [], 3, { board: 'Large' }))).toBe(true);
    const moved = at(ME, [], 3);
    moved.cards[0] = { state: 'down', symbol: null };
    moved.cards[15] = { state: 'matched', symbol: 0 };
    expect(isNewPairsGame(late, moved)).toBe(true);
    expect(isNewPairsGame(late, at(ME, [8], 4))).toBe(false);
  });

  it('ticks only on your own go, anew for each go and each pair', () => {
    expect(actingDeadline(at(ME), ME, 3)).toBe('3:0:flipping');
    expect(actingDeadline(at(ME, [], 1), ME, 3)).toBe('3:1:flipping');
    expect(actingDeadline(at(MAYA), ME, 3)).toBeNull();
    expect(actingDeadline(at(ME, [4, 6]), ME, 3)).toBeNull();
    expect(actingDeadline(pairsState(), ME, 3)).toBeNull();
  });
});

/** What one change sounds like to `viewer`, in go `count` begun on `began`. */
const heard = (
  prev: PairsRoomState,
  next: PairsRoomState,
  count = 1,
  viewer = ME,
  began = prev,
) => derivePairsSounds(viewer)(prev, next, { count, began });

describe('a Pairs room, heard', () => {
  it('names a turn’s cards by the go and the pairs, softer for another’s', () => {
    expect(heard(at(ME), at(ME, [4]), 2)).toEqual([
      { sound: 'pairs-flip', key: 'flip:2:0', other: false },
    ]);
    expect(heard(at(MAYA), at(MAYA, [4]), 3)).toEqual([
      { sound: 'pairs-flip', key: 'flip:3:0', other: true },
    ]);
    expect(heard(at(ME, [4]), at(ME, [4, 6]), 2)).toEqual([
      { sound: 'pairs-miss', key: 'miss:2', other: false },
    ]);
    // Turning back is silent: the go passes, and its "your turn" stands alone.
    expect(heard(at(ME, [4, 6]), at(MAYA), 3)).toEqual([]);
  });

  it('steps each pair a go finds a step higher, and starts again next go', () => {
    const began = at(ME, [], 1);
    expect(heard(at(ME, [2], 1), at(ME, [], 2), 4, ME, began)).toEqual([
      { sound: 'pairs-match', key: 'pair:2', other: false, variant: 1 },
    ]);
    expect(heard(at(ME, [4], 2), at(ME, [], 3), 4, ME, began)).toEqual([
      { sound: 'pairs-match', key: 'pair:3', other: false, variant: 2 },
    ]);
    expect(
      heard(at(MAYA, [4], 2), at(MAYA, [], 3), 5, ME, at(MAYA, [], 2)),
    ).toEqual([
      { sound: 'pairs-match', key: 'pair:3', other: true, variant: 1 },
    ]);
  });

  it('says time up to the player whose go ran out, alone', () => {
    const late = at(MAYA, [], 0, { timedOut: ME });
    expect(heard(at(ME, [4]), late, 3)).toEqual([
      { sound: 'room-time-up', key: 'timeout:3' },
    ]);
    expect(heard(at(ME, [4]), late, 3, MAYA)).toEqual([]);
  });

  it('leaves a game’s start and end to the room', () => {
    expect(heard(pairsState(), at(ME), 1)).toEqual([]);
    const over = pairsState({ isGameStarted: false, cards: cardsWith([], 8) });
    expect(heard(at(ME, [14], 7), over, 1)).toEqual([]);
  });
});

/** A Pairs room page's sounds, as `RoomLayout` plays them. */
function Room({ state, epoch }: { state: PairsRoomState; epoch: number }) {
  useRoomSounds({
    state,
    viewer: ME,
    yourTurn:
      state.isGameStarted &&
      state.phase === 'flipping' &&
      state.turnPlayerId === ME,
    epoch,
    readied: 0,
    game: PAIRS_SOUNDS,
  });
  return null;
}

/** A room page from `state` on, and what each next snapshot plays. */
function openRoom(state: PairsRoomState, epoch = 1) {
  const engine = new AudioEngine({});
  const play = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const page = (s: PairsRoomState, e: number) => (
    <StrictMode>
      <SoundProvider engine={engine}>
        <Room state={s} epoch={e} />
      </SoundProvider>
    </StrictMode>
  );
  const view = render(page(state, epoch));
  return {
    to: (next: PairsRoomState, e = epoch) => {
      play.mockClear();
      view.rerender(page(next, e));
      return play.mock.calls.map(([spec, options]) =>
        options?.variant ? `${spec.id} ${options.variant}` : spec.id,
      );
    },
    unmount: () => view.unmount(),
  };
}

describe('a Pairs room page', () => {
  it('chimes each go of yours, even one that came straight back after a miss', () => {
    const room = openRoom(pairsState());
    expect(room.to(at(ME))).toEqual(['room-your-turn']);
    expect(room.to(at(ME, [0]))).toEqual(['pairs-flip']);
    // A pair keeps the go: no chime, a step higher for the next.
    expect(room.to(at(ME, [], 1))).toEqual(['pairs-match 1']);
    expect(room.to(at(ME, [2], 1))).toEqual(['pairs-flip']);
    expect(room.to(at(ME, [], 2))).toEqual(['pairs-match 2']);
    expect(room.to(at(ME, [4], 2))).toEqual(['pairs-flip']);
    expect(room.to(at(ME, [4, 6], 2))).toEqual(['pairs-miss']);
    // Were the go to come straight back, it is a new go all the same.
    expect(room.to(at(ME, [], 2))).toEqual(['room-your-turn']);
    expect(room.to(at(ME, [4], 2))).toEqual(['pairs-flip']);
    expect(room.to(at(ME, [], 3))).toEqual(['pairs-match 1']);
  });

  it('says time up as your go runs out, and chimes your next', () => {
    const room = openRoom(at(ME, [4]));
    expect(room.to(at(MAYA, [], 0, { timedOut: ME }))).toEqual([
      'room-time-up',
    ]);
    expect(room.to(at(MAYA, [6]))).toEqual(['pairs-flip']);
    expect(room.to(at(MAYA, [6, 8]))).toEqual(['pairs-miss']);
    expect(room.to(at(ME))).toEqual(['room-your-turn']);
    // Your go runs out into Maya's, and hers into yours: the chime alone.
    expect(room.to(at(MAYA, [], 0, { timedOut: ME }))).toEqual([
      'room-time-up',
    ]);
    expect(room.to(at(ME, [], 0, { timedOut: MAYA }))).toEqual([
      'room-your-turn',
    ]);
  });

  it('plays nothing for a refresh or a reconnection mid-go', () => {
    const first = openRoom(pairsState());
    first.to(at(ME));
    first.to(at(ME, [0]));
    first.unmount();
    // A new page on the same go: its card is not played again.
    const again = openRoom(at(ME, [0]));
    expect(again.to(at(ME, [0]))).toEqual([]);
    expect(again.to(at(ME, [], 1))).toEqual(['pairs-match 1']);
    // Back on a new connection, mid-go: neither the go nor the card again.
    expect(again.to(at(ME, [2], 1), 2)).toEqual([]);
    expect(again.to(at(ME, [2], 1), 2)).toEqual([]);
    expect(again.to(at(ME, [], 2), 2)).toEqual(['pairs-match 1']);
  });

  it('leaves silent a go run out twice in a row by one player', () => {
    const room = openRoom(at(ME, [4]));
    const late = at(ME, [], 0, { timedOut: ME });
    expect(room.to(late)).toEqual(['room-your-turn']);
    // Out of time again without a card: every snapshot reads the same.
    expect(room.to({ ...late })).toEqual([]);
  });
});
