import { describe, expect, it } from 'vitest';
import { createReplayGuard } from '../audio';
import { deriveSoloSounds, endAlone } from '../solo/sounds';
import { flip, newGame, turnBack, type SoloGame } from './solo/game';
import { derivePairsSolo, streakOf } from './sounds';

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
