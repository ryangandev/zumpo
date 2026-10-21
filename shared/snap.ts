import { shuffle } from './pairs.js';
import { seededRandom, seedNumber } from './seed.js';

/**
 * Snap rules that a room on the server and a run on your own in the browser
 * both need, so the two always deal and judge a card alike. The rules are in
 * docs/games/snap.md.
 *
 * The deck is the finite projective plane of order 5: 31 symbols (its points)
 * on 31 cards (its lines), six on each, and any two cards share exactly one.
 */

const ORDER = 5;
/** Cards in the deck, and symbols on them. */
export const DECK_SIZE = ORDER * ORDER + ORDER + 1;
/** Symbols on every card. */
export const SPOTS = ORDER + 1;
/** Middle cards in a run on your own: every card but the one you start with. */
export const RUN_CARDS = DECK_SIZE - 1;

/** Zumpo/Snap symbol, in variant order: a symbol is its index here. */
export const SYMBOLS = [
  'circle',
  'ring',
  'half',
  'square',
  'diamond',
  'triangle',
  'star',
  'sparkle',
  'hexagon',
  'heart',
  'moon',
  'plus',
  'drop',
  'cloud',
  'leaf',
  'flower',
  'bolt',
  'arrow',
  'house',
  'fish',
  'bow',
  'tree',
  'mushroom',
  'bell',
  'clover',
  'note',
  'eye',
  'crown',
  'pill',
  'ghost',
  'cup',
] as const;

export type SymbolName = (typeof SYMBOLS)[number];

/** A card: its six symbols in spot order, the first in the centre. */
export type Card = readonly number[];

export const isSymbol = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) < DECK_SIZE;

/**
 * The plane's 31 lines, each as its six points. A point (x, y) is 5x + y, the
 * slope m is 25 + m, and infinity is 30. Lines y = mx + b come first (5m + b),
 * then x = c (25 + c), then the line at infinity.
 */
function planeLines(): number[][] {
  const lines: number[][] = [];
  const slope = (m: number) => ORDER * ORDER + m;
  const infinity = ORDER * ORDER + ORDER;
  for (let m = 0; m < ORDER; m++) {
    for (let b = 0; b < ORDER; b++) {
      const line = [slope(m)];
      for (let x = 0; x < ORDER; x++)
        line.push(x * ORDER + ((m * x + b) % ORDER));
      lines.push(line);
    }
  }
  for (let c = 0; c < ORDER; c++) {
    const line = [infinity];
    for (let y = 0; y < ORDER; y++) line.push(c * ORDER + y);
    lines.push(line);
  }
  lines.push([...Array.from({ length: ORDER }, (_, m) => slope(m)), infinity]);
  return lines;
}

/** The deck before any shuffle: card i is line i, its points as symbols. */
export const PLANE: readonly Card[] = planeLines();

/**
 * A shuffled deck: the symbols put on the plane's points in a new order, the
 * cards in a new order, and each card's symbols in new spots. The same source
 * deals the same deck, so a challenge link is just a seed.
 */
export function dealDeck(random: () => number): Card[] {
  const symbolOf = shuffle(
    Array.from({ length: DECK_SIZE }, (_, index) => index),
    random,
  );
  return shuffle(PLANE, random).map((line) =>
    shuffle(
      line.map((point) => symbolOf[point] ?? point),
      random,
    ),
  );
}

/** The deck a seed deals. */
export const deckFromSeed = (seed: string): Card[] =>
  dealDeck(seededRandom(seedNumber(seed)));

/** The one symbol two different cards share; null for a card and itself. */
export function matchOf(a: Card, b: Card): number | null {
  const shared = a.filter((symbol) => b.includes(symbol));
  return shared.length === 1 ? (shared[0] ?? null) : null;
}

/** What a tapped symbol is to two cards. */
export type Tap = 'match' | 'mine' | 'middle' | 'neither';

/**
 * A tap judged: on both cards it is the match; on one it says which; on
 * neither it was never on the screen.
 */
export function judgeTap(mine: Card, middle: Card, symbol: number): Tap {
  const onMine = mine.includes(symbol);
  const onMiddle = middle.includes(symbol);
  if (onMine && onMiddle) return 'match';
  if (onMine) return 'mine';
  if (onMiddle) return 'middle';
  return 'neither';
}

/** Cards there are to take in a room: all but the one each player is dealt. */
export const cardsToTake = (players: number): number => DECK_SIZE - players;

/**
 * Where a card's spots are, as fractions of its diameter from its top left:
 * spot 1 in the centre, 30% across; spots 2-6 around it, 24% across, 34% out,
 * clockwise from the top. Zumpo/Snap card lays them out the same way.
 */
export const SPOT_LAYOUT: readonly { x: number; y: number; size: number }[] = [
  { x: 0.5, y: 0.5, size: 0.3 },
  ...Array.from({ length: ORDER }, (_, k) => {
    const angle = ((-90 + 72 * k) * Math.PI) / 180;
    return {
      x: 0.5 + 0.34 * Math.cos(angle),
      y: 0.5 + 0.34 * Math.sin(angle),
      size: 0.24,
    };
  }),
];
