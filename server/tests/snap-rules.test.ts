import { describe, expect, it } from 'vitest';
import {
  cardsToTake,
  dealDeck,
  deckFromSeed,
  DECK_SIZE,
  judgeTap,
  matchOf,
  PLANE,
  RUN_CARDS,
  SPOT_LAYOUT,
  SPOTS,
  SYMBOLS,
  type Card,
} from '../../shared/snap.js';
import { seededRandom } from '../../shared/seed.js';

/** Every two cards of a deck, each pair once. */
const pairsOf = (deck: readonly Card[]) =>
  deck.flatMap((a, i) => deck.slice(i + 1).map((b) => [a, b] as const));

const shared = (a: Card, b: Card) => a.filter((symbol) => b.includes(symbol));

describe('the Snap deck', () => {
  it('is 31 cards of six different symbols, from 31 symbols', () => {
    expect(DECK_SIZE).toBe(31);
    expect(SYMBOLS).toHaveLength(31);
    expect(new Set(SYMBOLS).size).toBe(31);
    expect(PLANE).toHaveLength(31);
    for (const card of PLANE) {
      expect(card).toHaveLength(SPOTS);
      expect(new Set(card).size).toBe(SPOTS);
      for (const symbol of card) {
        expect(symbol).toBeGreaterThanOrEqual(0);
        expect(symbol).toBeLessThan(31);
      }
    }
  });

  it('shares exactly one symbol between any two cards', () => {
    const pairs = pairsOf(PLANE);
    expect(pairs).toHaveLength((31 * 30) / 2);
    for (const [a, b] of pairs) expect(shared(a, b)).toHaveLength(1);
  });

  it('puts every symbol on six cards', () => {
    for (let symbol = 0; symbol < 31; symbol++) {
      expect(PLANE.filter((card) => card.includes(symbol))).toHaveLength(6);
    }
  });

  it('keeps all of that through any shuffle', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deck = dealDeck(seededRandom(seed));
      expect(deck).toHaveLength(31);
      for (const [a, b] of pairsOf(deck)) expect(shared(a, b)).toHaveLength(1);
      expect(new Set(deck.flat()).size).toBe(31);
    }
  });

  it('deals the same deck from the same seed, and another from another', () => {
    expect(deckFromSeed('k3f9x2')).toEqual(deckFromSeed('k3f9x2'));
    expect(deckFromSeed('k3f9x2')).not.toEqual(deckFromSeed('k3f9x3'));
  });

  it('moves the shared symbol around the spots', () => {
    // Over many deals, the match between the first two cards is in the
    // centre about one time in six, not always or never.
    let centred = 0;
    const deals = 600;
    for (let seed = 0; seed < deals; seed++) {
      const [a, b] = dealDeck(seededRandom(seed));
      if (a![0] === matchOf(a!, b!)) centred++;
    }
    expect(centred / deals).toBeGreaterThan(0.1);
    expect(centred / deals).toBeLessThan(0.25);
  });
});

describe('a tap', () => {
  const [mine, middle] = dealDeck(seededRandom(7)) as [Card, Card];
  const match = matchOf(mine, middle)!;

  it('finds the one match between two cards, and none for a card and itself', () => {
    expect(mine).toContain(match);
    expect(middle).toContain(match);
    expect(matchOf(mine, mine)).toBeNull();
  });

  it('is a match on both cards, a miss on one, and nothing on neither', () => {
    expect(judgeTap(mine, middle, match)).toBe('match');
    const onlyMine = mine.find((symbol) => symbol !== match)!;
    const onlyMiddle = middle.find((symbol) => symbol !== match)!;
    expect(judgeTap(mine, middle, onlyMine)).toBe('mine');
    expect(judgeTap(mine, middle, onlyMiddle)).toBe('middle');
    const neither = Array.from({ length: 31 }, (_, s) => s).find(
      (s) => !mine.includes(s) && !middle.includes(s),
    )!;
    expect(judgeTap(mine, middle, neither)).toBe('neither');
  });
});

describe('a game', () => {
  it('has a card for each player, and the rest to take', () => {
    expect(cardsToTake(2)).toBe(29);
    expect(cardsToTake(4)).toBe(27);
    expect(cardsToTake(6)).toBe(25);
    expect(RUN_CARDS).toBe(30);
  });

  it('lays out the spots as Zumpo/Snap card does', () => {
    expect(SPOT_LAYOUT).toHaveLength(6);
    expect(SPOT_LAYOUT[0]).toEqual({ x: 0.5, y: 0.5, size: 0.3 });
    // The first spot around the centre is straight up, 34% out.
    expect(SPOT_LAYOUT[1]!.x).toBeCloseTo(0.5);
    expect(SPOT_LAYOUT[1]!.y).toBeCloseTo(0.16);
    for (const spot of SPOT_LAYOUT.slice(1)) {
      expect(Math.hypot(spot.x - 0.5, spot.y - 0.5)).toBeCloseTo(0.34);
      expect(spot.size).toBe(0.24);
    }
  });
});
