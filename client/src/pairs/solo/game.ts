import { itemAt } from '../../../../shared/list';
import type { PairsBoard } from '../../../../shared/wire-types';
import {
  dealDeck,
  longestStreak,
  PAIRS_BOARDS,
} from '../../../../shared/pairs';
import { seededRandom, seedNumber } from '../../../../shared/seed';
import type { PairsCardState } from '../../ui';

/**
 * Pairs on your own: one board in as few turns as you can, in the browser.
 * Every function returns a new game and leaves the one it was given alone, so
 * React state can hold it as is. The rules are in docs/games/pairs.md.
 */

/** How long two cards that do not match stay up. */
export const MISS_SHOWN_MS = 1000;

export interface SoloGame {
  board: PairsBoard;
  /** Deals the deck; a challenge link is this and the board. */
  seed: string;
  /** The symbol in each place, row by row. */
  deck: readonly number[];
  matched: readonly boolean[];
  /** The places of the cards up and not matched: one mid-turn, two missed. */
  up: readonly number[];
  /** Whether each finished turn found a pair, first first. */
  turns: readonly boolean[];
  /** Milliseconds since the epoch: the first card, and the last pair. */
  startedAt: number | null;
  endedAt: number | null;
}

export function newGame(board: PairsBoard, seed: string): SoloGame {
  const deck = dealDeck(board, seededRandom(seedNumber(seed)));
  return {
    board,
    seed,
    deck,
    matched: deck.map(() => false),
    up: [],
    turns: [],
    startedAt: null,
    endedAt: null,
  };
}

export const isOver = (game: SoloGame) => game.endedAt !== null;

export const pairsFound = (game: SoloGame) =>
  game.matched.filter(Boolean).length / 2;

/** Two cards that did not match are up, waiting to turn back. */
export const isShowingMiss = (game: SoloGame) => game.up.length === 2;

/** The last finished turn: a pair, a miss, or none yet. */
export function lastTurn(game: SoloGame): 'pair' | 'miss' | null {
  if (game.turns.length === 0) return null;
  return game.turns.at(-1) ? 'pair' : 'miss';
}

/** The run clock: from the first card to the last pair. */
export const elapsed = (game: SoloGame, now: number) =>
  game.startedAt === null ? 0 : (game.endedAt ?? now) - game.startedAt;

/** Two cards that did not match turn back face down. */
export function turnBack(game: SoloGame): SoloGame {
  return isShowingMiss(game) ? { ...game, up: [] } : game;
}

/**
 * Turns over the card at `index`. A miss still showing turns back first, so
 * nobody waits on it.
 */
export function flip(game: SoloGame, index: number, now: number): SoloGame {
  if (isOver(game)) return game;
  const current = turnBack(game);
  if (current.matched[index] || current.up.includes(index)) return game;
  const startedAt = current.startedAt ?? now;
  if (current.up.length === 0) {
    return { ...current, up: [index], startedAt };
  }
  const first = itemAt(current.up, 0);
  if (current.deck[first] !== current.deck[index]) {
    return {
      ...current,
      up: [first, index],
      turns: [...current.turns, false],
      startedAt,
    };
  }
  const matched = current.matched.map(
    (was, place) => was || place === first || place === index,
  );
  return {
    ...current,
    matched,
    up: [],
    turns: [...current.turns, true],
    startedAt,
    endedAt: matched.every(Boolean) ? now : null,
  };
}

/** What a player sees of each card. */
export function cardsOf(game: SoloGame): PairsCardState[] {
  return game.deck.map((symbol, index) =>
    game.matched[index]
      ? { kind: 'matched', symbol }
      : game.up.includes(index)
        ? { kind: 'up', symbol }
        : { kind: 'down' },
  );
}

export function summary(game: SoloGame, now: number) {
  return {
    pairs: PAIRS_BOARDS[game.board].pairs,
    turns: game.turns.length,
    timeMs: elapsed(game, now),
    streak: longestStreak(game.turns),
  };
}
