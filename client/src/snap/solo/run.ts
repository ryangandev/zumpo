import { itemAt } from '../../../../shared/list';
import {
  deckFromSeed,
  judgeTap,
  matchOf,
  RUN_CARDS,
  type Card,
} from '../../../../shared/snap';

/**
 * A run of Snap on your own: thirty middle cards against one clock, in the
 * browser. Every function returns a new run and leaves the one it was given
 * alone, so React state can hold it as is. The rules are in
 * docs/games/snap.md.
 */

export { RUN_CARDS };
/** What a wrong tap adds to the run time. */
export const WRONG_PENALTY_MS = 3_000;
/** How long a match stays marked, off the clock, before the next card. */
export const MATCH_FLASH_MS = 500;
/** How long a wrong tap stays marked. */
export const WRONG_FLASH_MS = 600;

export interface CardResult {
  /** Its time on the run clock, with what its wrong taps cost. */
  ms: number;
  wrongTaps: number;
}

/** A tap just judged, shown for a moment. */
export type Flash =
  | { match: true; symbol: number }
  | { match: false; symbol: number; on: 'mine' | 'middle' };

export interface SoloRun {
  /** Deals the run; a challenge link is just this. */
  seed: string;
  /** The whole deck in the order it is turned: the first card is yours. */
  deck: readonly Card[];
  /** Your card: the first, then each middle card you took. */
  mine: Card;
  /** The open card's wrong taps so far. */
  wrongTaps: number;
  results: readonly CardResult[];
  /** The time of every finished card, penalties included. */
  bankedMs: number;
  /** When the open card was turned; null while a match is up and after the last. */
  cardStartedAt: number | null;
  flash: Flash | null;
}

export function newRun(seed: string, now: number): SoloRun {
  const deck = deckFromSeed(seed);
  return {
    seed,
    deck,
    mine: itemAt(deck, 0),
    wrongTaps: 0,
    results: [],
    bankedMs: 0,
    cardStartedAt: now,
    flash: null,
  };
}

/**
 * The middle card: the open one, or the one just matched while it is up.
 * After the last it stays the last, so the finished cards still show.
 */
export const middleOf = (run: SoloRun): Card =>
  itemAt(
    run.deck,
    Math.min(run.results.length + (run.flash?.match ? 0 : 1), RUN_CARDS),
  );

export const isOver = (run: SoloRun) =>
  run.results.length === RUN_CARDS && run.flash === null;

/** A symbol can be tapped: the clock runs and nothing is up. */
export const canTap = (run: SoloRun) =>
  run.cardStartedAt !== null && run.flash === null;

/** The open card, from 1. */
export const cardNumber = (run: SoloRun) =>
  Math.min(run.results.length + (run.flash?.match ? 0 : 1), RUN_CARDS);

/** The cards still to take, the middle card among them. */
export const cardsLeft = (run: SoloRun) => RUN_CARDS - run.results.length;

/**
 * The run clock: finished cards, and the open one so far with its penalties.
 * A reading taken before the card was turned counts it as just turned, so the
 * clock never runs back.
 */
export const runTime = (run: SoloRun, now: number) =>
  run.bankedMs +
  (run.cardStartedAt === null
    ? 0
    : run.wrongTaps * WRONG_PENALTY_MS + Math.max(0, now - run.cardStartedAt));

/**
 * Taps a symbol on either card. The match takes the middle card; a symbol
 * on only one of the two costs 3 seconds.
 */
export function tap(run: SoloRun, symbol: number, now: number): SoloRun {
  if (!canTap(run)) return run;
  const middle = middleOf(run);
  const judged = judgeTap(run.mine, middle, symbol);
  if (judged === 'neither') return run;
  if (judged !== 'match') {
    return {
      ...run,
      wrongTaps: run.wrongTaps + 1,
      flash: { match: false, symbol, on: judged },
    };
  }
  const ms = runTime(run, now) - run.bankedMs;
  return {
    ...run,
    results: [...run.results, { ms, wrongTaps: run.wrongTaps }],
    bankedMs: run.bankedMs + ms,
    cardStartedAt: null,
    flash: { match: true, symbol },
  };
}

/** How long what is up stays up. */
export const flashMs = (flash: Flash) =>
  flash.match ? MATCH_FLASH_MS : WRONG_FLASH_MS;

/**
 * Ends what is up: a wrong tap's mark goes; a matched middle card becomes
 * yours and the next is turned, unless that was the last.
 */
export function afterFlash(run: SoloRun, now: number): SoloRun {
  if (!run.flash) return run;
  if (!run.flash.match) return { ...run, flash: null };
  const taken = middleOf(run);
  if (run.results.length === RUN_CARDS) return { ...run, flash: null };
  return {
    ...run,
    mine: taken,
    wrongTaps: 0,
    cardStartedAt: now,
    flash: null,
  };
}

/** The match between your card and the middle card. */
export const matchNow = (run: SoloRun) => matchOf(run.mine, middleOf(run));

export function summary(run: SoloRun) {
  const times = run.results.map((result) => result.ms);
  return {
    timeMs: run.bankedMs,
    taken: run.results.length,
    wrongTaps: run.results.reduce((sum, result) => sum + result.wrongTaps, 0),
    fastestMs: times.length ? Math.min(...times) : null,
    slowestMs: times.length ? Math.max(...times) : null,
  };
}
