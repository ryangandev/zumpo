import { itemAt } from '../../../../shared/list';
import {
  combine,
  dealHands,
  dealtCards,
  isTarget,
  lastCard,
  play,
  solve,
  type Card,
  type Expression,
  type Step,
} from '../../../../shared/make-24';
import { seededRandom, seedNumber } from '../../../../shared/seed';

/**
 * A run of Make 24 on your own: ten hands against one clock, in the browser.
 * Every function returns a new run and leaves the one it was given alone, so
 * React state can hold it as is. The rules are in docs/games/make-24.md.
 */

export const RUN_HANDS = 10;
/** What a skip adds to the run time. */
export const SKIP_PENALTY_MS = 30_000;
/** How long a solved hand stays up before the next one. */
export const SOLVED_PAUSE_MS = 1500;
/** How long a skipped hand's solution stays up. */
export const SKIPPED_PAUSE_MS = 2000;

export interface HandResult {
  deal: readonly number[];
  /** How it was solved, or for a skipped hand, one way it could have been. */
  expression: Expression;
  skipped: boolean;
  /** Its time on the run clock, with a skip's 30 seconds. */
  ms: number;
}

export interface SoloRun {
  /** Deals the run's hands; a challenge link is just this. */
  seed: string;
  deals: readonly (readonly number[])[];
  /** The hand in front of the player, from 0. */
  hand: number;
  /** The steps taken on it so far. */
  steps: readonly Step[];
  results: readonly HandResult[];
  /** The time of every finished hand, penalties included. */
  bankedMs: number;
  /** When the open hand was dealt; null between hands and after the last. */
  handStartedAt: number | null;
}

export function newRun(seed: string, now: number): SoloRun {
  return {
    seed,
    deals: dealHands(seededRandom(seedNumber(seed)), RUN_HANDS),
    hand: 0,
    steps: [],
    results: [],
    bankedMs: 0,
    handStartedAt: now,
  };
}

export const deal = (run: SoloRun) => itemAt(run.deals, run.hand);

/** The cards in front of the player after their steps. */
export const cardsOf = (run: SoloRun): Card[] =>
  play(deal(run), run.steps) ?? dealtCards(deal(run));

/** Between hands: the last one is up, solved or skipped. */
export const isBetweenHands = (run: SoloRun) =>
  run.handStartedAt === null && !isOver(run);

export const isOver = (run: SoloRun) => run.results.length === RUN_HANDS;

/**
 * The run clock: finished hands, and the open one so far. A reading taken
 * before the hand was dealt counts it as just begun, so the clock never runs
 * back.
 */
export const runTime = (run: SoloRun, now: number) =>
  run.bankedMs +
  (run.handStartedAt === null ? 0 : Math.max(0, now - run.handStartedAt));

function finishHand(run: SoloRun, result: HandResult): SoloRun {
  return {
    ...run,
    results: [...run.results, result],
    bankedMs: run.bankedMs + result.ms,
    handStartedAt: null,
  };
}

/** One step; the last one that makes 24 solves the hand and stops its clock. */
export function takeStep(run: SoloRun, step: Step, now: number): SoloRun {
  if (run.handStartedAt === null) return run;
  if (!combine(cardsOf(run), step)) return run;
  const next = { ...run, steps: [...run.steps, step] };
  const last = lastCard(cardsOf(next));
  if (!last || !isTarget(last.value)) return next;
  return finishHand(next, {
    deal: deal(run),
    expression: last.expression,
    skipped: false,
    ms: now - run.handStartedAt,
  });
}

export function undo(run: SoloRun): SoloRun {
  if (run.handStartedAt === null || run.steps.length === 0) return run;
  return { ...run, steps: run.steps.slice(0, -1) };
}

export function startOver(run: SoloRun): SoloRun {
  if (run.handStartedAt === null || run.steps.length === 0) return run;
  return { ...run, steps: [] };
}

/** Gives the hand up: one way to solve it, and 30 seconds on the clock. */
export function skip(run: SoloRun, now: number): SoloRun {
  if (run.handStartedAt === null) return run;
  return finishHand(
    { ...run, steps: [] },
    {
      deal: deal(run),
      // Every hand is dealt solvable.
      expression: solve(deal(run))!,
      skipped: true,
      ms: now - run.handStartedAt + SKIP_PENALTY_MS,
    },
  );
}

/** Deals the next hand after a pause, unless that was the last. */
export function nextHand(run: SoloRun, now: number): SoloRun {
  if (!isBetweenHands(run)) return run;
  if (run.results.length === RUN_HANDS) return run;
  return { ...run, hand: run.hand + 1, steps: [], handStartedAt: now };
}

/** The latest finished hand, shown while the next waits. */
export const lastResult = (run: SoloRun): HandResult | undefined =>
  run.results.at(-1);

export function summary(run: SoloRun) {
  const solved = run.results.filter((result) => !result.skipped);
  return {
    timeMs: run.bankedMs,
    solved: solved.length,
    skipped: run.results.length - solved.length,
    fastestMs: solved.length
      ? Math.min(...solved.map((result) => result.ms))
      : null,
  };
}
