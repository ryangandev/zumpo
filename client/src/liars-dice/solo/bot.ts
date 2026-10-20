import { pickFrom } from '../../../../shared/list';
import {
  BID_FACES,
  counts,
  smallestCountFor,
  type Bid,
} from '../../../../shared/liars-dice';

/**
 * How a bot plays Liar's Dice on your own: a simple, believable game from its
 * own dice and the chance that the dice it cannot see make up the rest. The
 * rules are in docs/games/liars-dice.md#the-bots.
 *
 * Only the browser runs bots: a room on the server is people only.
 */

/** Any one die a bot cannot see counts towards a face 1 time in 3: the face, or a wild one. */
export const MATCH_CHANCE = 1 / 3;

/** A bid a bot believes is at least this likely. */
const BELIEVED = 0.5;

/** How one bot plays, drawn when a game starts so some are bolder than others. */
export interface BotStyle {
  /** It calls Liar on a bid less likely than this: 0.30 to 0.45. */
  callBelow: number;
  /** How often it bluffs when it raises. */
  bluff: number;
}

export function newStyle(random: () => number): BotStyle {
  return { callBelow: 0.3 + random() * 0.15, bluff: 0.2 };
}

/** What a bot knows on its turn. */
export interface BotView {
  /** Its own dice. */
  dice: readonly number[];
  diceOnTable: number;
  /** The bid in front of it; null when it opens the round. */
  bid: Bid | null;
}

export type BotMove = { kind: 'bid'; bid: Bid } | { kind: 'call' };

/** The chance that at least `need` of `unknown` dice match, each 1 in 3. */
export function chanceAtLeast(
  need: number,
  unknown: number,
  chance = MATCH_CHANCE,
): number {
  if (need <= 0) return 1;
  if (need > unknown) return 0;
  let total = 0;
  let ways = 1; // unknown choose k, built up as k grows
  for (let k = 0; k <= unknown; k++) {
    if (k > 0) ways = (ways * (unknown - k + 1)) / k;
    if (k >= need) total += ways * chance ** k * (1 - chance) ** (unknown - k);
  }
  return Math.min(1, total);
}

/** How many of `dice` count towards `face`, wild ones included. */
export const holding = (dice: readonly number[], face: number) =>
  dice.filter((die) => counts(die, face)).length;

/** How likely `bid` is, as a bot holding `dice` sees it. */
export function chanceOf(
  bid: Bid,
  dice: readonly number[],
  diceOnTable: number,
): number {
  return chanceAtLeast(
    bid.count - holding(dice, bid.face),
    diceOnTable - dice.length,
  );
}

/** The most dice of `face` a bot believes the table holds. */
function believedCount(view: BotView, face: number): number {
  let count = 0;
  while (
    count < view.diceOnTable &&
    chanceOf({ count: count + 1, face }, view.dice, view.diceOnTable) >=
      BELIEVED
  ) {
    count += 1;
  }
  return count;
}

/**
 * An honest raise: on the face it believes most in, one short of as many as it
 * believes, so the bidding climbs quickly without the bot overreaching. Null
 * when it believes no raise at all.
 */
function honestRaise(view: BotView): Bid | null {
  let best: Bid | null = null;
  let bestBelieved = 0;
  for (const face of BID_FACES) {
    const believed = believedCount(view, face);
    const lowest = smallestCountFor(face, view.bid);
    if (believed < lowest) continue;
    // Ties go to the higher face, as a real player's would.
    if (believed >= bestBelieved) {
      bestBelieved = believed;
      best = { count: Math.max(lowest, believed - 1), face };
    }
  }
  return best;
}

/**
 * A bluff: a raise on a face it holds none of (wild ones aside), at about
 * what the table holds of any face, so it sounds like a real bid.
 */
function bluffRaise(view: BotView, random: () => number): Bid | null {
  const faces = BID_FACES.filter((face) => !view.dice.includes(face));
  if (faces.length === 0) return null;
  const face = pickFrom(faces, random);
  const count = Math.max(
    smallestCountFor(face, view.bid),
    Math.round(view.diceOnTable * MATCH_CHANCE),
  );
  return count <= view.diceOnTable ? { count, face } : null;
}

/** The raise most likely to be true, the cheapest of equals. */
function likeliestRaise(view: BotView): Bid | null {
  let best: { bid: Bid; chance: number } | null = null;
  for (const face of BID_FACES) {
    const count = smallestCountFor(face, view.bid);
    if (count > view.diceOnTable) continue;
    const bid = { count, face };
    const chance = chanceOf(bid, view.dice, view.diceOnTable);
    if (!best || chance > best.chance) best = { bid, chance };
  }
  return best?.bid ?? null;
}

/**
 * A bot's turn. It calls Liar on a bid less likely than its own threshold,
 * bluffs on about one turn in five, and otherwise raises honestly. With no
 * raise it believes, it takes whichever is likelier to come out right: the
 * call, or the likeliest raise.
 */
export function botMove(
  view: BotView,
  style: BotStyle,
  random: () => number,
): BotMove {
  const standing = view.bid
    ? chanceOf(view.bid, view.dice, view.diceOnTable)
    : 1;
  if (view.bid && standing < style.callBelow) return { kind: 'call' };

  if (random() < style.bluff) {
    const bluff = bluffRaise(view, random);
    if (bluff) return { kind: 'bid', bid: bluff };
  }

  const honest = honestRaise(view);
  if (honest) return { kind: 'bid', bid: honest };

  const likeliest = likeliestRaise(view);
  if (!likeliest) return { kind: 'call' };
  if (
    view.bid &&
    1 - standing > chanceOf(likeliest, view.dice, view.diceOnTable)
  ) {
    return { kind: 'call' };
  }
  return { kind: 'bid', bid: likeliest };
}
