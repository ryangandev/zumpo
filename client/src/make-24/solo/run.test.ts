import { describe, expect, it } from 'vitest';
import { formatFraction } from '../../../../shared/make-24';
import { stepsToSolve } from '../../tests/make-24';
import {
  cardsOf,
  deal,
  isBetweenHands,
  isOver,
  newRun,
  nextHand,
  RUN_HANDS,
  runTime,
  skip,
  SKIP_PENALTY_MS,
  startOver,
  summary,
  takeStep,
  undo,
  type SoloRun,
} from './run';

function solveHand(run: SoloRun, now: number): SoloRun {
  for (const step of stepsToSolve(deal(run))) {
    run = takeStep(run, step, now);
  }
  return run;
}

describe('a run on your own', () => {
  it('deals the same ten hands from the same seed', () => {
    const a = newRun('k3f9x2', 0);
    expect(a.deals).toHaveLength(RUN_HANDS);
    expect(newRun('k3f9x2', 99).deals).toEqual(a.deals);
    expect(newRun('aaaaaa', 0).deals).not.toEqual(a.deals);
  });

  it('combines cards a step at a time, and undoes them for free', () => {
    let run = newRun('k3f9x2', 0);
    const [first] = stepsToSolve(deal(run));
    run = takeStep(run, first!, 1000);
    expect(cardsOf(run)).toHaveLength(3);
    expect(undo(run).steps).toEqual([]);
    expect(
      startOver(takeStep(run, { left: 0, op: '+', right: 1 }, 0)).steps,
    ).toEqual([]);
    // A step that cannot be taken changes nothing.
    expect(takeStep(run, { left: 0, op: '+', right: 0 }, 0)).toBe(run);
  });

  it('stops the clock on a solved hand and deals the next after a pause', () => {
    let run = newRun('k3f9x2', 0);
    run = solveHand(run, 21_000);
    expect(isBetweenHands(run)).toBe(true);
    expect(run.results[0]).toMatchObject({ skipped: false, ms: 21_000 });
    expect(formatFraction(cardsOf(run)[0]!.value)).toBe('24');
    // The pause between hands is not on the clock.
    expect(runTime(run, 25_000)).toBe(21_000);
    run = nextHand(run, 25_000);
    expect(run.hand).toBe(1);
    expect(runTime(run, 30_000)).toBe(26_000);
    // A reading from before the deal never winds the clock back.
    expect(runTime(run, 24_000)).toBe(21_000);
  });

  it('adds 30 seconds for a skip, and keeps a way to solve it', () => {
    let run = skip(newRun('k3f9x2', 0), 5000);
    expect(run.results[0]).toMatchObject({
      skipped: true,
      ms: 5000 + SKIP_PENALTY_MS,
    });
    expect(run.results[0]!.expression).not.toBeTypeOf('number');
    // Nothing more can happen to a hand that is over.
    expect(skip(run, 6000)).toBe(run);
    expect(undo(run)).toBe(run);
  });

  it('ends after the tenth hand with what it took', () => {
    let run = newRun('k3f9x2', 0);
    let now = 0;
    for (let hand = 0; hand < RUN_HANDS; hand++) {
      now += 10_000;
      run = hand === 4 ? skip(run, now) : solveHand(run, now);
      now += 2000;
      run = nextHand(run, now);
    }
    expect(isOver(run)).toBe(true);
    expect(isBetweenHands(run)).toBe(false);
    expect(summary(run)).toEqual({
      timeMs: 10 * 10_000 + SKIP_PENALTY_MS,
      solved: 9,
      skipped: 1,
      fastestMs: 10_000,
    });
  });
});
