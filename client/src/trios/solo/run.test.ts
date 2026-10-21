import { describe, expect, it } from 'vitest';
import { findTrios, isTrio } from '../../../../shared/trios';
import {
  afterFlash,
  canHint,
  canPick,
  hint,
  hintedPlaces,
  HINT_PENALTY_MS,
  isOver,
  newRun,
  pick,
  RUN_TRIOS,
  runTime,
  summary,
  trioNumber,
  WRONG_PENALTY_MS,
  type SoloRun,
} from './run';

/** Picks the places one by one at `now`. */
const pickAll = (run: SoloRun, places: readonly number[], now: number) =>
  places.reduce((next, place) => pick(next, place, now), run);

/** Three places on the table that are not a trio. */
function notATrio(run: SoloRun): number[] {
  const table = run.deal.table;
  for (let c = 2; c < table.length; c++) {
    if (!isTrio(table[0]!, table[1]!, table[c]!)) return [0, 1, c];
  }
  throw new Error('Every card makes a trio with the first two');
}

/** Finds the first trio on the table at `now` and deals the next. */
function findOne(run: SoloRun, now: number): SoloRun {
  return afterFlash(pickAll(run, findTrios(run.deal.table)[0]!, now), now);
}

/** A whole run, finding the first trio every 10 seconds. */
function playTen() {
  let run = newRun('k3f9x2', 0);
  for (let i = 0; i < RUN_TRIOS; i++) run = findOne(run, (i + 1) * 10_000);
  return run;
}

describe('a run on your own', () => {
  it('deals the same table and deck from the same seed', () => {
    const a = newRun('k3f9x2', 0);
    expect(a.deal.table).toEqual([
      65, 16, 26, 37, 27, 46, 61, 68, 67, 72, 51, 4,
    ]);
    expect(newRun('k3f9x2', 99).deal).toEqual(a.deal);
    expect(newRun('aaaaaa', 0).deal).not.toEqual(a.deal);
  });

  it('picks cards and puts them back for free', () => {
    let run = newRun('k3f9x2', 0);
    run = pickAll(run, [3, 5], 1000);
    expect(run.picked).toEqual([3, 5]);
    run = pick(run, 3, 2000);
    expect(run.picked).toEqual([5]);
    expect(runTime(run, 2000)).toBe(2000);
  });

  it('takes a trio on the third pick, stops its clock and deals new cards into its places', () => {
    let run = newRun('k3f9x2', 0);
    const [trio] = findTrios(run.deal.table);
    run = pickAll(run, trio!, 12_000);
    expect(run.flash).toEqual({ found: true, places: trio, feature: null });
    expect(canPick(run)).toBe(false);
    expect(trioNumber(run)).toBe(1);
    // The clock stops while the trio is up.
    expect(runTime(run, 60_000)).toBe(12_000);
    expect(run.results[0]).toEqual({
      cards: trio!.map((place) => newRun('k3f9x2', 0).deal.table[place]),
      ms: 12_000,
      wrongPicks: 0,
      hints: 0,
    });

    const before = run.deal.table;
    run = afterFlash(run, 13_000);
    expect(trioNumber(run)).toBe(2);
    expect(run.deal.table).toHaveLength(12);
    expect(findTrios(run.deal.table).length).toBeGreaterThan(0);
    const kept = (table: readonly number[]) =>
      table.filter((_, place) => !trio!.includes(place));
    expect(kept(run.deal.table)).toEqual(kept(before));
    expect(runTime(run, 14_000)).toBe(13_000);
  });

  it('puts three that are not a trio back and adds 5 seconds', () => {
    let run = newRun('k3f9x2', 0);
    const wrong = notATrio(run);
    run = pickAll(run, wrong, 4000);
    expect(run.flash?.found).toBe(false);
    expect(run.flash?.places).toEqual(wrong);
    expect(run.flash?.feature).not.toBeNull();
    expect(run.picked).toEqual([]);
    // The clock runs on while they are up, 5 seconds ahead.
    expect(runTime(run, 5000)).toBe(5000 + WRONG_PENALTY_MS);
    run = afterFlash(run, 4600);
    expect(run.flash).toBeNull();
    expect(canPick(run)).toBe(true);
    // The miss is kept until the next pick, so its reason can be read.
    expect(run.miss).toEqual(wrong.map((p) => run.deal.table[p]));
    expect(pick(run, 0, 5000).miss).toBeNull();
    expect(hint(run).miss).toBeNull();

    run = findOne(run, 10_000);
    expect(run.results[0]).toMatchObject({
      ms: 10_000 + WRONG_PENALTY_MS,
      wrongPicks: 1,
    });
  });

  it('hints one card of a trio, then a second of the same trio, then no more', () => {
    let run = newRun('k3f9x2', 0);
    run = hint(run);
    const [first] = hintedPlaces(run);
    run = hint(run);
    const places = hintedPlaces(run);
    expect(places[0]).toBe(first);
    expect(places).toHaveLength(2);
    const trio = findTrios(run.deal.table).find(
      (t) => t.includes(places[0]!) && t.includes(places[1]!),
    );
    expect(trio).toBeDefined();
    expect(canHint(run)).toBe(false);
    expect(hint(run)).toBe(run);
    expect(runTime(run, 1000)).toBe(1000 + 2 * HINT_PENALTY_MS);
    // Hints are cleared when a trio is taken.
    run = findOne(run, 3000);
    expect(hintedPlaces(run)).toEqual([]);
    expect(run.results[0]!.hints).toBe(2);
  });

  it('counts the open trio’s wrong picks and hints once, also while a found trio is up', () => {
    let run = newRun('k3f9x2', 0);
    run = afterFlash(pickAll(run, notATrio(run), 1000), 1600);
    run = hint(hint(run));
    expect(summary(run)).toMatchObject({ wrongPicks: 1, hints: 2 });
    run = pickAll(run, findTrios(run.deal.table)[0]!, 3000);
    expect(run.flash?.found).toBe(true);
    expect(summary(run)).toMatchObject({ wrongPicks: 1, hints: 2 });
    run = afterFlash(run, 3600);
    expect(summary(run)).toMatchObject({ wrongPicks: 1, hints: 2 });
  });

  it('ends after ten trios with its time, and plays the same from the same picks', () => {
    const run = playTen();
    expect(isOver(run)).toBe(true);
    expect(canPick(run)).toBe(false);
    expect(summary(run)).toEqual({
      timeMs: 100_000,
      found: RUN_TRIOS,
      wrongPicks: 0,
      hints: 0,
      fastestMs: 10_000,
    });
    expect(run.results).toEqual(playTen().results);
    expect(pick(run, 0, 200_000)).toBe(run);
  });
});
