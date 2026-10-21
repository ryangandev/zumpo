import { describe, expect, it } from 'vitest';
import {
  brokenFeature,
  cardFeatures,
  cardName,
  cardOf,
  DECK_SIZE,
  dealTable,
  findTrios,
  hasTrio,
  isTrio,
  TABLE_SIZE,
  takeTrio,
  thirdCard,
  type Deal,
} from '../../shared/trios.js';
import { seededRandom, seedNumber } from '../../shared/seed.js';
import { shuffle } from '../../shared/list.js';

const ALL = Array.from({ length: DECK_SIZE }, (_, card) => card);

/** Every trio there is, checked feature by feature the long way. */
const isTrioByHand = (a: number, b: number, c: number) =>
  (['colour', 'shape', 'count', 'fill'] as const).every((feature) => {
    const values = new Set(
      [a, b, c].map((card) => cardFeatures(card)[feature]),
    );
    return values.size !== 2;
  });

describe('the cards', () => {
  it('are 81, one for every combination of the four features', () => {
    const names = new Set(
      ALL.map((card) => JSON.stringify(cardFeatures(card))),
    );
    expect(names.size).toBe(81);
    for (const card of ALL) expect(cardOf(cardFeatures(card))).toBe(card);
  });

  it('read their features as base-3 digits', () => {
    expect(cardFeatures(0)).toEqual({
      colour: 'coral',
      shape: 'circle',
      count: 1,
      fill: 'solid',
    });
    expect(cardFeatures(2 * 27 + 1 * 9 + 2 * 3 + 1)).toEqual({
      colour: 'ink',
      shape: 'triangle',
      count: 3,
      fill: 'striped',
    });
  });

  it('are named by all four features', () => {
    expect(cardName(0)).toBe('One coral solid circle');
    expect(
      cardName(
        cardOf({
          colour: 'blue',
          shape: 'triangle',
          count: 2,
          fill: 'striped',
        }),
      ),
    ).toBe('Two blue striped triangles');
    expect(cardName(80)).toBe('Three black outlined squares');
  });
});

describe('a trio', () => {
  it('is all the same or all different in every feature', () => {
    let trios = 0;
    for (let a = 0; a < DECK_SIZE; a++) {
      for (let b = a + 1; b < DECK_SIZE; b++) {
        for (let c = b + 1; c < DECK_SIZE; c++) {
          const expected = isTrioByHand(a, b, c);
          expect(isTrio(a, b, c)).toBe(expected);
          if (expected) trios++;
        }
      }
    }
    // The deck holds 1080 trios: any two cards have exactly one third.
    expect(trios).toBe(1080);
  });

  it('never repeats a card', () => {
    expect(isTrio(5, 5, 5)).toBe(false);
    expect(isTrio(5, 5, thirdCard(5, 5))).toBe(false);
  });

  it('has exactly one third card for any two', () => {
    for (const a of [0, 13, 40, 80]) {
      for (const b of ALL.filter((card) => card !== a)) {
        const c = thirdCard(a, b);
        expect(c).not.toBe(a);
        expect(c).not.toBe(b);
        expect(isTrio(a, b, c)).toBe(true);
        expect(ALL.filter((other) => isTrio(a, b, other))).toEqual([c]);
      }
    }
  });

  it('says which feature breaks three cards that are not one', () => {
    const coral = cardOf({
      colour: 'coral',
      shape: 'circle',
      count: 1,
      fill: 'solid',
    });
    const coralStriped = cardOf({
      colour: 'coral',
      shape: 'circle',
      count: 1,
      fill: 'striped',
    });
    const blue = cardOf({
      colour: 'blue',
      shape: 'circle',
      count: 1,
      fill: 'outline',
    });
    // Two coral and one blue: colour breaks it before fill can.
    expect(brokenFeature(coral, coralStriped, blue)).toBe('colour');
    const coralOutline = cardOf({
      colour: 'coral',
      shape: 'circle',
      count: 1,
      fill: 'outline',
    });
    const coralTwo = cardOf({
      colour: 'coral',
      shape: 'circle',
      count: 2,
      fill: 'striped',
    });
    expect(brokenFeature(coral, coralOutline, coralTwo)).toBe('count');
    expect(brokenFeature(coral, coralStriped, coralOutline)).toBeNull();
  });

  it('is found on a table by the places of its cards', () => {
    const table = [0, 1, 9, 2, 18];
    expect(findTrios(table)).toEqual([
      [0, 1, 3],
      [0, 2, 4],
    ]);
    expect(hasTrio([0, 1, 9, 10])).toBe(false);
  });
});

/** Every card exactly once, between the table and the deck. */
const accountedFor = ({ table, deck }: Deal, taken: readonly number[] = []) =>
  [...table, ...deck, ...taken].toSorted((a, b) => a - b);

const dealFor = (seed: string) => dealTable(seededRandom(seedNumber(seed)));

/** The table with `cards` dealt into `places`, in order. */
const dealtInto = (
  table: readonly number[],
  places: readonly number[],
  cards: readonly number[],
) =>
  table.map((card, place) =>
    places.includes(place) ? cards[places.indexOf(place)]! : card,
  );

/**
 * The first seed whose first table's first trio, once taken, is followed by
 * three cards that do (or do not) leave a trio on the table.
 */
function seedWhereNextThree(leaveATrio: boolean) {
  for (let seed = 0; ; seed++) {
    const random = seededRandom(seed);
    const dealt = dealTable(random);
    const [trio] = findTrios(dealt.table);
    const naive = dealtInto(dealt.table, trio!, dealt.deck.slice(0, 3));
    if (hasTrio(naive) === leaveATrio) return { random, dealt, trio };
  }
}

describe('the deal', () => {
  it('lays out twelve cards with a trio among them, the rest in the deck', () => {
    for (let seed = 0; seed < 300; seed++) {
      const dealt = dealTable(seededRandom(seed));
      expect(dealt.table).toHaveLength(TABLE_SIZE);
      expect(dealt.deck).toHaveLength(DECK_SIZE - TABLE_SIZE);
      expect(hasTrio(dealt.table)).toBe(true);
      expect(accountedFor(dealt)).toEqual(ALL);
    }
  });

  it('deals the same table and deck from the same seed, and others from another', () => {
    expect(dealFor('k3f9x2')).toEqual(dealFor('k3f9x2'));
    expect(dealFor('k3f9x2').table).not.toEqual(dealFor('zzzzzz').table);
  });

  it('redeals a table whose first twelve cards hold no trio', () => {
    let redealt = 0;
    for (let seed = 0; seed < 300; seed++) {
      const firstTwelve = shuffle(ALL, seededRandom(seed)).slice(0, TABLE_SIZE);
      if (hasTrio(firstTwelve)) continue;
      redealt++;
      expect(hasTrio(dealTable(seededRandom(seed)).table)).toBe(true);
    }
    // About one deal in thirty.
    expect(redealt).toBeGreaterThan(0);
  });
});

describe('taking a trio', () => {
  it('deals the next cards of the deck into its places, the rest staying put', () => {
    const { random, dealt, trio } = seedWhereNextThree(true);
    const next = takeTrio(dealt, trio!, random)!;

    expect(next.table).toEqual(
      dealtInto(dealt.table, trio!, dealt.deck.slice(0, 3)),
    );
    expect(next.deck).toEqual(dealt.deck.slice(3));
  });

  it('puts the next cards back when they would leave no trio, and deals others', () => {
    const { random, dealt, trio } = seedWhereNextThree(false);
    const next = takeTrio(dealt, trio!, random)!;

    expect(hasTrio(next.table)).toBe(true);
    const kept = (table: readonly number[]) =>
      table.filter((_, place) => !trio!.includes(place));
    expect(kept(next.table)).toEqual(kept(dealt.table));
    expect(next.deck).toHaveLength(dealt.deck.length - 3);
    expect(
      accountedFor(
        next,
        trio!.map((place) => dealt.table[place]!),
      ),
    ).toEqual(ALL);
  });

  it('keeps a trio on the table through a whole deck, then ends', () => {
    for (let seed = 0; seed < 40; seed++) {
      const random = seededRandom(seed);
      let deal: Deal | null = dealTable(random);
      const taken: number[] = [];
      let trios = 0;
      while (deal) {
        expect(hasTrio(deal.table)).toBe(true);
        const [trio] = findTrios(deal.table);
        taken.push(...trio!.map((place) => deal!.table[place]!));
        const next = takeTrio(deal, trio!, random);
        trios++;
        if (!next) break;
        expect(accountedFor(next, taken)).toEqual(ALL);
        deal = next;
      }
      // Any 21 cards hold a trio, so a game of 20 never runs out.
      expect(trios).toBeGreaterThanOrEqual(20);
      expect(trios).toBeLessThanOrEqual(27);
    }
  });

  it('is the same from the same seed and the same picks', () => {
    expect(playTen()).toEqual(playTen());
  });
});

/** Ten trios taken from the deal of one seed, the first trio each time. */
function playTen() {
  const random = seededRandom(seedNumber('k3f9x2'));
  let deal = dealTable(random);
  for (let i = 0; i < 10; i++)
    deal = takeTrio(deal, findTrios(deal.table)[0]!, random)!;
  return deal;
}
