import { describe, expect, it } from 'vitest';
import {
  cardsOf,
  elapsed,
  flip,
  isOver,
  isShowingMiss,
  lastTurn,
  newGame,
  pairsFound,
  summary,
  turnBack,
  type SoloGame,
} from './game';

const SEED = 'k3f9x2';

/** The places of each symbol's two cards. */
function placesOf(game: SoloGame): [number, number][] {
  const places = new Map<number, number[]>();
  game.deck.forEach((symbol, index) =>
    places.set(symbol, [...(places.get(symbol) ?? []), index]),
  );
  return [...places.values()] as [number, number][];
}

/** Two places that do not match. */
function aMiss(game: SoloGame): [number, number] {
  const [a] = placesOf(game)[0]!;
  const [b] = placesOf(game)[1]!;
  return [a, b];
}

describe('Pairs on your own', () => {
  it('deals a seed’s deck face down, with no clock running', () => {
    const game = newGame('Small', SEED);
    expect(game.deck).toEqual(newGame('Small', SEED).deck);
    expect(game.deck).toHaveLength(16);
    expect(cardsOf(game).every((card) => card.kind === 'down')).toBe(true);
    expect(elapsed(game, 5000)).toBe(0);
  });

  it('starts the clock with the first card', () => {
    const game = flip(newGame('Small', SEED), 0, 1000);
    expect(cardsOf(game)[0]).toEqual({ kind: 'up', symbol: game.deck[0] });
    expect(elapsed(game, 3500)).toBe(2500);
    expect(game.turns).toEqual([]);
  });

  it('keeps a pair up, matched, and counts the turn', () => {
    const [a, b] = placesOf(newGame('Small', SEED))[0]!;
    let game = flip(newGame('Small', SEED), a, 0);
    game = flip(game, b, 100);
    expect(cardsOf(game)[a]!.kind).toBe('matched');
    expect(cardsOf(game)[b]!.kind).toBe('matched');
    expect(pairsFound(game)).toBe(1);
    expect(lastTurn(game)).toBe('pair');
    expect(game.up).toEqual([]);
  });

  it('shows a miss until it turns back, or until another card is flipped', () => {
    const start = newGame('Small', SEED);
    const [a, b] = aMiss(start);
    let game = flip(flip(start, a, 0), b, 100);
    expect(isShowingMiss(game)).toBe(true);
    expect(lastTurn(game)).toBe('miss');
    expect(turnBack(game).up).toEqual([]);

    const third = game.deck.findIndex((_, index) => index !== a && index !== b);
    game = flip(game, third, 200);
    expect(game.up).toEqual([third]);
    expect(game.turns).toEqual([false]);
  });

  it('ignores a card already up or matched', () => {
    const [a, b] = placesOf(newGame('Small', SEED))[0]!;
    const up = flip(newGame('Small', SEED), a, 0);
    expect(flip(up, a, 10)).toBe(up);
    const matched = flip(up, b, 20);
    expect(flip(matched, a, 30)).toBe(matched);
  });

  it('ends with the last pair, and sums the game up', () => {
    let game = newGame('Small', SEED);
    const [a, b] = aMiss(game);
    game = flip(flip(game, a, 0), b, 500);
    let now = 1000;
    for (const [x, y] of placesOf(game)) {
      game = flip(flip(game, x!, now), y!, now + 100);
      now += 1000;
    }
    expect(isOver(game)).toBe(true);
    expect(summary(game, 99_999)).toEqual({
      pairs: 8,
      turns: 9,
      timeMs: now - 1000 + 100,
      streak: 8,
    });
    expect(flip(game, 0, now)).toBe(game);
  });
});
