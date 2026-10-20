import { itemAt, pickFrom } from '../../../../shared/list';
import {
  brokenFeature,
  dealTable,
  findTrios,
  isTrio,
  RUN_TRIOS,
  takeTrio,
  type Deal,
  type Feature,
} from '../../../../shared/trios';
import { shuffle } from '../../../../shared/pairs';
import { seededRandom, seedNumber } from '../../../../shared/seed';

/**
 * A run of Trios on your own: ten trios against one clock, in the browser.
 * Every function returns a new run and leaves the one it was given alone, so
 * React state can hold it as is. The rules are in docs/games/trios.md.
 */

export { RUN_TRIOS };
/** What a wrong pick adds to the run time. */
export const WRONG_PENALTY_MS = 5_000;
/** What each hint adds to the run time. */
export const HINT_PENALTY_MS = 10_000;
/** Hints a trio may have: the second marks a second card of the same trio. */
export const MAX_HINTS = 2;
/** How long a found trio, or three that are not one, stay up. */
export const FLASH_MS = 600;

export interface TrioResult {
  cards: readonly number[];
  /** Its time on the run clock, with what its wrong picks and hints cost. */
  ms: number;
  wrongPicks: number;
  hints: number;
}

/** Three cards just judged, shown for a moment. */
export interface Flash {
  found: boolean;
  places: readonly number[];
  /** For three that are not a trio: the first feature that breaks it. */
  feature: Feature | null;
}

export interface SoloRun {
  /** Deals the run; a challenge link is just this. */
  seed: string;
  deal: Deal;
  /** The places picked, in the order they were picked. */
  picked: readonly number[];
  /** A trio on the table that hints mark, its cards in the order they are. */
  hintTrio: readonly number[] | null;
  /** How many of its cards the hints have marked. */
  hints: number;
  /** The open trio's wrong picks so far. */
  wrongPicks: number;
  results: readonly TrioResult[];
  /** The time of every finished trio, penalties included. */
  bankedMs: number;
  /** When the open trio began; null while a found trio is up and after the last. */
  trioStartedAt: number | null;
  flash: Flash | null;
}

/**
 * A source of numbers for one moment of the run: the deal's own for the
 * first table, then one per refill and per hint, so the same picks on the
 * same seed always deal the same cards.
 */
const randomFor = (seed: string, moment: string) =>
  seededRandom(seedNumber(moment ? `${seed}/${moment}` : seed));

export function newRun(seed: string, now: number): SoloRun {
  return {
    seed,
    deal: dealTable(randomFor(seed, '')),
    picked: [],
    hintTrio: null,
    hints: 0,
    wrongPicks: 0,
    results: [],
    bankedMs: 0,
    trioStartedAt: now,
    flash: null,
  };
}

export const isOver = (run: SoloRun) =>
  run.results.length === RUN_TRIOS && run.flash === null;

/** Cards can be picked: the clock runs and nothing is up. */
export const canPick = (run: SoloRun) =>
  run.trioStartedAt !== null && run.flash === null;

/** The open trio, from 1. */
export const trioNumber = (run: SoloRun) =>
  Math.min(run.results.length + (run.flash?.found ? 0 : 1), RUN_TRIOS);

/** Penalties on the open trio so far. */
const penaltyMs = (run: SoloRun) =>
  run.wrongPicks * WRONG_PENALTY_MS + run.hints * HINT_PENALTY_MS;

/**
 * The run clock: finished trios, and the open one so far with its penalties.
 * A reading taken before the trio began counts it as just begun, so the
 * clock never runs back.
 */
export const runTime = (run: SoloRun, now: number) =>
  run.bankedMs +
  (run.trioStartedAt === null
    ? 0
    : penaltyMs(run) + Math.max(0, now - run.trioStartedAt));

/**
 * Picks the card at `place`, or puts it back. The third pick is judged: a
 * trio is found, or three that are not one cost 5 seconds.
 */
export function pick(run: SoloRun, place: number, now: number): SoloRun {
  if (!canPick(run)) return run;
  if (run.picked.includes(place)) {
    return { ...run, picked: run.picked.filter((p) => p !== place) };
  }
  const picked = [...run.picked, place];
  if (picked.length < 3) return { ...run, picked };

  const cards = picked.map((p) => itemAt(run.deal.table, p));
  const [a, b, c] = [itemAt(cards, 0), itemAt(cards, 1), itemAt(cards, 2)];
  if (!isTrio(a, b, c)) {
    return {
      ...run,
      picked: [],
      wrongPicks: run.wrongPicks + 1,
      flash: { found: false, places: picked, feature: brokenFeature(a, b, c) },
    };
  }
  const ms = runTime(run, now) - run.bankedMs;
  return {
    ...run,
    picked: [],
    results: [
      ...run.results,
      { cards, ms, wrongPicks: run.wrongPicks, hints: run.hints },
    ],
    bankedMs: run.bankedMs + ms,
    trioStartedAt: null,
    flash: {
      found: true,
      places: picked.toSorted((x, y) => x - y),
      feature: null,
    },
  };
}

/**
 * Ends what is up: three that were not a trio go back; a found trio's places
 * are dealt new cards and the next trio begins, unless that was the last.
 */
export function afterFlash(run: SoloRun, now: number): SoloRun {
  if (!run.flash) return run;
  if (!run.flash.found) return { ...run, flash: null };
  if (run.results.length === RUN_TRIOS) return { ...run, flash: null };
  const deal = takeTrio(
    run.deal,
    run.flash.places,
    randomFor(run.seed, `trio-${run.results.length}`),
  );
  // A deck of 81 cannot run out in ten trios; this keeps the types honest.
  if (!deal) return { ...run, flash: null };
  return {
    ...run,
    deal,
    hintTrio: null,
    hints: 0,
    wrongPicks: 0,
    trioStartedAt: now,
    flash: null,
  };
}

/** Hint is offered until two cards of a trio are marked. */
export const canHint = (run: SoloRun) => canPick(run) && run.hints < MAX_HINTS;

/** Marks one more card of a trio on the table, for 10 seconds. */
export function hint(run: SoloRun): SoloRun {
  if (!canHint(run)) return run;
  let hintTrio = run.hintTrio;
  if (!hintTrio) {
    const random = randomFor(run.seed, `hint-${run.results.length}`);
    const trios = findTrios(run.deal.table);
    hintTrio = shuffle(
      pickFrom(trios, random).map((place) => itemAt(run.deal.table, place)),
      random,
    );
  }
  return { ...run, hintTrio, hints: run.hints + 1 };
}

/** The places the hints have marked. */
export const hintedPlaces = (run: SoloRun): number[] =>
  (run.hintTrio ?? [])
    .slice(0, run.hints)
    .map((card) => run.deal.table.indexOf(card));

export function summary(run: SoloRun) {
  const total = (key: 'wrongPicks' | 'hints') =>
    run.results.reduce((sum, result) => sum + result[key], 0);
  return {
    timeMs: run.bankedMs,
    found: run.results.length,
    wrongPicks: total('wrongPicks'),
    hints: total('hints'),
    fastestMs: run.results.length
      ? Math.min(...run.results.map((result) => result.ms))
      : null,
  };
}
