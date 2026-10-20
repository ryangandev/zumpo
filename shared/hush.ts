/**
 * Hush rules that both sides need: the deck, the deal, how long a game is and
 * how many lives a team has. The rules are in docs/games/hush.md.
 *
 * A hand is a player's cards, lowest first. Only the server deals and plays;
 * the client reads the level count and the lives from here to describe a game.
 */

import { swap } from './list.js';

/** The deck is every card from 1 to 100. */
export const LOWEST_CARD = 1;
export const HIGHEST_CARD = 100;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** Every team starts with three lives, and a clean level never wins back more. */
export const START_LIVES = 3;

/**
 * How many levels a game has for `players` seated when it starts: 9 minus the
 * players, so a game deals about 60 cards whatever its size (7, 6 or 5 levels).
 */
export function levelsFor(players: number): number {
  const seated = Math.min(Math.max(players, MIN_PLAYERS), MAX_PLAYERS);
  return 9 - seated;
}

/** "A, B and C". */
export function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Deals level `level`: every player in `playerIds` gets `level` cards from a
 * freshly shuffled deck, each hand lowest first. Every card dealt is
 * different, since the whole table holds at most 4 × 7 of the 100.
 */
export function deal(
  playerIds: readonly string[],
  level: number,
  random: () => number,
): Record<string, number[]> {
  const deck = Array.from(
    { length: HIGHEST_CARD - LOWEST_CARD + 1 },
    (_, index) => LOWEST_CARD + index,
  );
  // A partial Fisher-Yates: only as many cards as are dealt get drawn.
  const needed = playerIds.length * level;
  if (needed > deck.length) throw new Error('Not enough cards to deal.');
  for (let i = 0; i < needed; i++) {
    const j = i + Math.floor(random() * (deck.length - i));
    swap(deck, i, j);
  }
  return Object.fromEntries(
    playerIds.map((playerId, seat) => [
      playerId,
      deck.slice(seat * level, (seat + 1) * level).toSorted((a, b) => a - b),
    ]),
  );
}
