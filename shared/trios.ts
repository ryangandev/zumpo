import { itemAt, shuffle } from './list.js';

/**
 * Trios rules that a room on the server and a run on your own in the browser
 * both need, so the two always deal and judge a table alike. The rules are in
 * docs/games/trios.md.
 *
 * A card is a number from 0 to 80 whose base-3 digits are its four features:
 * `card = colour × 27 + shape × 9 + (count − 1) × 3 + fill`.
 */

export const DECK_SIZE = 81;
/** The table always shows this many cards, with a trio among them. */
export const TABLE_SIZE = 12;
/** Trios in a room's game: the choices its owner has. */
export const GAME_LENGTHS = [10, 20] as const;
/** Trios in a run on your own. */
export const RUN_TRIOS = 10;

export const COLOURS = ['coral', 'blue', 'ink'] as const;
export const SHAPES = ['circle', 'triangle', 'square'] as const;
export const FILLS = ['solid', 'striped', 'outline'] as const;
/** The four features, in the order a broken trio is explained. */
export const FEATURES = ['colour', 'shape', 'count', 'fill'] as const;

export type Colour = (typeof COLOURS)[number];
export type Shape = (typeof SHAPES)[number];
export type Fill = (typeof FILLS)[number];
export type Feature = (typeof FEATURES)[number];

export interface CardFeatures {
  colour: Colour;
  shape: Shape;
  /** How many shapes the card shows: 1, 2 or 3. */
  count: 1 | 2 | 3;
  fill: Fill;
}

/** Each feature's place value in a card's number. */
const WEIGHT: Readonly<Record<Feature, number>> = {
  colour: 27,
  shape: 9,
  count: 3,
  fill: 1,
};

/** A feature's value on a card, from 0 to 2. */
const digit = (card: number, feature: Feature): number =>
  Math.floor(card / WEIGHT[feature]) % 3;

export const isCard = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value < DECK_SIZE;

export function cardFeatures(card: number): CardFeatures {
  return {
    colour: itemAt(COLOURS, digit(card, 'colour')),
    shape: itemAt(SHAPES, digit(card, 'shape')),
    count: (digit(card, 'count') + 1) as 1 | 2 | 3,
    fill: itemAt(FILLS, digit(card, 'fill')),
  };
}

export function cardOf({ colour, shape, count, fill }: CardFeatures): number {
  return (
    COLOURS.indexOf(colour) * 27 +
    SHAPES.indexOf(shape) * 9 +
    (count - 1) * 3 +
    FILLS.indexOf(fill)
  );
}

const COUNT_WORDS = ['One', 'Two', 'Three'] as const;
const FILL_WORDS: Readonly<Record<Fill, string>> = {
  solid: 'solid',
  striped: 'striped',
  outline: 'outlined',
};

/** What a card shows, in words: "Two blue striped triangles". */
export function cardName(card: number): string {
  const { colour, shape, count, fill } = cardFeatures(card);
  return `${COUNT_WORDS[count - 1]} ${colour} ${FILL_WORDS[fill]} ${shape}${count === 1 ? '' : 's'}`;
}

/** True when, for `feature`, three cards are all the same or all different. */
const holds = (feature: Feature, a: number, b: number, c: number) =>
  (digit(a, feature) + digit(b, feature) + digit(c, feature)) % 3 === 0;

/**
 * Three different cards make a trio when every feature is all the same or all
 * different across them: its three values add up to a multiple of 3.
 */
export function isTrio(a: number, b: number, c: number): boolean {
  if (a === b || b === c || a === c) return false;
  return FEATURES.every((feature) => holds(feature, a, b, c));
}

/**
 * The first feature that keeps three cards from being a trio, two alike and
 * one not; null when they are one.
 */
export function brokenFeature(a: number, b: number, c: number): Feature | null {
  return FEATURES.find((feature) => !holds(feature, a, b, c)) ?? null;
}

/** The one card that makes a trio with `a` and `b`. */
export function thirdCard(a: number, b: number): number {
  return FEATURES.reduce((card, feature) => {
    const value = (6 - digit(a, feature) - digit(b, feature)) % 3;
    return card + value * WEIGHT[feature];
  }, 0);
}

/** Every trio among `cards`, as the places of its three cards, in order. */
export function findTrios(
  cards: readonly number[],
): [number, number, number][] {
  const place = new Map(cards.map((card, index) => [card, index]));
  const trios: [number, number, number][] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const k = place.get(thirdCard(itemAt(cards, i), itemAt(cards, j)));
      if (k !== undefined && k > j) trios.push([i, j, k]);
    }
  }
  return trios;
}

export const hasTrio = (cards: readonly number[]): boolean =>
  findTrios(cards).length > 0;

/** The cards on the table and the deck under it, its top first. */
export interface Deal {
  table: readonly number[];
  deck: readonly number[];
}

/**
 * How many shuffled draws to try before looking for a working one in order.
 * A random twelve lacks a trio about one time in thirty, so this is reached
 * only near the bottom of a long deck.
 */
const RANDOM_DRAWS = 32;

/**
 * Deals cards from `deck` into the empty places (`null`) of `table`, so the
 * table holds a trio. The next cards of the deck come first; when they leave
 * no trio they go back, the deck is shuffled, and others are drawn, as the
 * rules say. Null when no draw can make a trio: the game is over.
 */
function dealInto(
  table: readonly (number | null)[],
  deck: readonly number[],
  random: () => number,
): Deal | null {
  const empty = table.flatMap((card, place) => (card === null ? [place] : []));
  if (deck.length < empty.length) return null;

  const lay = (order: readonly number[]): Deal => {
    const next = [...table];
    empty.forEach((place, i) => (next[place] = itemAt(order, i)));
    return { table: next as number[], deck: order.slice(empty.length) };
  };

  let order = deck;
  for (let attempt = 0; attempt <= RANDOM_DRAWS; attempt++) {
    const dealt = lay(order);
    if (hasTrio(dealt.table)) return dealt;
    order = shuffle(order, random);
  }

  // Shuffling keeps missing: put the deck cards of the first trio a draw can
  // complete on top, and deal again. Any trio has at most three cards, all of
  // which a draw of three can bring.
  const kept = table.filter((card): card is number => card !== null);
  const pool = [...kept, ...order];
  for (const [i, j, k] of findTrios(pool)) {
    const needed = [i, j, k]
      .filter((index) => index >= kept.length)
      .map((index) => itemAt(pool, index));
    if (needed.length > empty.length) continue;
    return lay([...needed, ...order.filter((card) => !needed.includes(card))]);
  }
  return null;
}

/** A shuffled deck and the twelve cards laid out from it, a trio among them. */
export function dealTable(random: () => number): Deal {
  const deck = shuffle(
    Array.from({ length: DECK_SIZE }, (_, card) => card),
    random,
  );
  const dealt = dealInto(Array(TABLE_SIZE).fill(null), deck, random);
  // A whole deck always holds a trio.
  if (!dealt) throw new Error('A full deck dealt no trio.');
  return dealt;
}

/**
 * The trio at `places` taken from the table, and three new cards dealt into
 * its places. Null when the table and the deck have no trio left between
 * them, which ends the game.
 */
export function takeTrio(
  { table, deck }: Deal,
  places: readonly number[],
  random: () => number,
): Deal | null {
  return dealInto(
    table.map((card, place) => (places.includes(place) ? null : card)),
    deck,
    random,
  );
}
