import { describe, expect, it } from 'vitest';
import { matchOf } from '../../../../shared/snap';
import {
  afterFlash,
  canTap,
  cardNumber,
  cardsLeft,
  isOver,
  matchNow,
  middleOf,
  newRun,
  RUN_CARDS,
  runTime,
  summary,
  tap,
  WRONG_PENALTY_MS,
  type SoloRun,
} from './run';

const SEED = 'k3f9x2';

/** A symbol on your card that is not on the middle card. */
const onlyMine = (run: SoloRun) =>
  run.mine.find((symbol) => !middleOf(run).includes(symbol))!;

/** Taps the match at `now` and turns the next card. */
const takeOne = (run: SoloRun, now: number) =>
  afterFlash(tap(run, matchNow(run)!, now), now);

describe('a run of Snap on your own', () => {
  it('deals the same deck from the same seed', () => {
    const a = newRun(SEED, 0);
    expect(newRun(SEED, 99).deck).toEqual(a.deck);
    expect(newRun('aaaaaa', 0).deck).not.toEqual(a.deck);
    expect(a.deck).toHaveLength(RUN_CARDS + 1);
    expect(a.mine).toEqual(a.deck[0]);
    expect(middleOf(a)).toEqual(a.deck[1]);
  });

  it('takes the middle card on a match, which becomes yours', () => {
    let run = newRun(SEED, 0);
    const match = matchNow(run)!;
    run = tap(run, match, 4_000);
    expect(run.flash).toEqual({ match: true, symbol: match });
    expect(canTap(run)).toBe(false);
    // The match stays up, off the clock.
    expect(runTime(run, 9_000)).toBe(4_000);
    expect(cardNumber(run)).toBe(1);

    run = afterFlash(run, 4_500);
    expect(run.mine).toEqual(run.deck[1]);
    expect(middleOf(run)).toEqual(run.deck[2]);
    expect(cardNumber(run)).toBe(2);
    expect(cardsLeft(run)).toBe(RUN_CARDS - 1);
    expect(runTime(run, 5_500)).toBe(5_000);
  });

  it('costs 3 seconds for a symbol on only one card, and takes nothing', () => {
    let run = newRun(SEED, 0);
    const wrong = onlyMine(run);
    run = tap(run, wrong, 1_000);
    expect(run.flash).toEqual({ match: false, symbol: wrong, on: 'mine' });
    expect(runTime(run, 1_000)).toBe(1_000 + WRONG_PENALTY_MS);
    run = afterFlash(run, 1_600);
    expect(run.results).toEqual([]);
    expect(canTap(run)).toBe(true);
    run = tap(run, matchNow(run)!, 2_000);
    expect(run.results).toEqual([
      { ms: 2_000 + WRONG_PENALTY_MS, wrongTaps: 1 },
    ]);
  });

  it('counts the open card’s wrong taps once, also while a match is up', () => {
    let run = newRun(SEED, 0);
    run = afterFlash(tap(run, onlyMine(run), 1_000), 1_600);
    expect(summary(run).wrongTaps).toBe(1);
    run = tap(run, matchNow(run)!, 2_000);
    expect(run.flash?.match).toBe(true);
    expect(summary(run).wrongTaps).toBe(1);
    run = afterFlash(run, 2_500);
    expect(summary(run).wrongTaps).toBe(1);
  });

  it('ignores a symbol on neither card, and taps while something is up', () => {
    const run = newRun(SEED, 0);
    const neither = [...Array(31).keys()].find(
      (symbol) => !run.mine.includes(symbol) && !middleOf(run).includes(symbol),
    )!;
    expect(tap(run, neither, 1_000)).toBe(run);
    const up = tap(run, matchNow(run)!, 1_000);
    expect(tap(up, matchNow(run)!, 1_100)).toBe(up);
  });

  it('ends after thirty cards, with the fastest and the slowest', () => {
    let run = newRun(SEED, 0);
    let now = 0;
    for (let i = 0; i < RUN_CARDS; i++) {
      // Every two cards share one symbol, so there is always a match.
      expect(matchOf(run.mine, middleOf(run))).not.toBeNull();
      now += 1_000 * ((i % 3) + 1);
      run = takeOne(run, now);
    }
    expect(isOver(run)).toBe(true);
    expect(cardsLeft(run)).toBe(0);
    expect(summary(run)).toEqual({
      timeMs: now,
      taken: RUN_CARDS,
      wrongTaps: 0,
      fastestMs: 1_000,
      slowestMs: 3_000,
    });
  });
});
