import { describe, expect, it } from 'vitest';
import {
  apply,
  combine,
  dealHands,
  dealtCards,
  evaluate,
  formatExpression,
  formatFraction,
  formatLastStep,
  isSolvable,
  play,
  solve,
  solves,
  whole,
  type Expression,
} from '../../shared/make-24.js';
import {
  newSeed,
  SEED_PATTERN,
  seededRandom,
  seedNumber,
} from '../../shared/seed.js';

const fraction = (n: number, d: number) => ({ n, d });

describe('fractions', () => {
  it('stay exact and in lowest terms', () => {
    expect(apply(whole(8), '/', whole(3))).toEqual(fraction(8, 3));
    expect(apply(fraction(8, 3), '*', whole(3))).toEqual(whole(8));
    expect(apply(whole(1), '-', whole(5))).toEqual(whole(-4));
    expect(apply(fraction(1, 5), '/', fraction(-2, 4))).toEqual(
      fraction(-2, 5),
    );
  });

  it('never divide by zero', () => {
    expect(apply(whole(3), '/', whole(0))).toBeNull();
    expect(apply(whole(0), '/', whole(3))).toEqual(whole(0));
  });

  it('read as a player would write them', () => {
    expect(formatFraction(whole(24))).toBe('24');
    expect(formatFraction(fraction(8, 3))).toBe('8/3');
    expect(formatFraction(fraction(-1, 5))).toBe('−1/5');
  });
});

describe('a step', () => {
  it('puts the new card in the left card’s place', () => {
    const cards = combine(dealtCards([1, 4, 7, 8]), {
      left: 3,
      op: '-',
      right: 1,
    })!;
    expect(cards.map((card) => formatFraction(card.value))).toEqual([
      '1',
      '7',
      '4',
    ]);
    expect(formatLastStep(cards[2]!.expression)).toBe('8 − 4');
  });

  it('is refused for a missing card, the same card twice, or ÷ 0', () => {
    const cards = dealtCards([1, 1, 2, 3]);
    expect(combine(cards, { left: 0, op: '+', right: 4 })).toBeNull();
    expect(combine(cards, { left: 2, op: '*', right: 2 })).toBeNull();
    expect(combine(cards, { left: 0.5, op: '*', right: 2 })).toBeNull();
    const zero = combine(cards, { left: 0, op: '-', right: 1 })!;
    expect(combine(zero, { left: 1, op: '/', right: 0 })).toBeNull();
    expect(combine(cards, { left: 0, op: '^' as never, right: 1 })).toBeNull();
  });
});

describe('a solved hand', () => {
  it('uses every card and ends on 24', () => {
    const steps = [
      { left: 3, op: '-', right: 1 },
      { left: 1, op: '-', right: 0 },
      { left: 1, op: '*', right: 0 },
    ] as const;
    // 8 − 4 = 4, then 7 − 1 = 6, then 4 × 6 = 24.
    expect(solves([1, 4, 7, 8], steps)).toBe(true);
    expect(formatExpression(play([1, 4, 7, 8], steps)![0]!.expression)).toBe(
      '(8 − 4) × (7 − 1)',
    );
  });

  it('is not one that stops early, runs on, or misses', () => {
    expect(solves([4, 6, 1, 1], [{ left: 0, op: '*', right: 1 }])).toBe(false);
    expect(
      solves(
        [1, 2, 3, 4],
        [
          { left: 0, op: '+', right: 1 },
          { left: 0, op: '+', right: 1 },
          { left: 0, op: '+', right: 1 },
        ],
      ),
    ).toBe(false);
  });

  it('can go through fractions', () => {
    // 5 − 1 ÷ 5 = 24/5, and 24/5 × 5 = 24.
    expect(
      solves(
        [1, 5, 5, 5],
        [
          { left: 0, op: '/', right: 1 },
          { left: 1, op: '-', right: 0 },
          { left: 0, op: '*', right: 1 },
        ],
      ),
    ).toBe(true);
  });
});

const op = (
  o: '+' | '-' | '*' | '/',
  left: Expression,
  right: Expression,
): Expression => ({ op: o, left, right });

describe('reading an expression', () => {
  it('keeps only the brackets it needs', () => {
    expect(formatExpression(op('*', op('-', 8, 4), op('-', 7, 1)))).toBe(
      '(8 − 4) × (7 − 1)',
    );
    expect(formatExpression(op('+', 3, op('/', 3, 7)))).toBe('3 + 3 ÷ 7');
    expect(formatExpression(op('+', op('+', 6, 6), op('+', 6, 6)))).toBe(
      '6 + 6 + 6 + 6',
    );
    expect(formatExpression(op('-', 8, op('-', 4, 1)))).toBe('8 − (4 − 1)');
    expect(formatExpression(op('/', 12, op('*', 3, 2)))).toBe('12 ÷ (3 × 2)');
    expect(formatExpression(op('*', 12, op('/', 3, 2)))).toBe('12 × 3 ÷ 2');
  });
});

describe('the solver', () => {
  it('finds a way when there is one, and prefers whole numbers', () => {
    for (const deal of [
      [3, 4, 6, 8],
      [1, 2, 3, 4],
      [1, 4, 7, 8],
      [6, 6, 6, 6],
      [3, 5, 7, 9],
    ]) {
      const solution = solve(deal)!;
      expect(evaluate(solution)).toEqual(whole(24));
      expect(formatExpression(solution)).not.toMatch(/\//);
    }
  });

  it('solves the famous hard ones', () => {
    for (const deal of [
      [1, 5, 5, 5],
      [3, 3, 7, 7],
      [3, 3, 8, 8],
      [1, 3, 4, 6],
    ]) {
      expect(evaluate(solve(deal)!)).toEqual(whole(24));
    }
  });

  it('says so when there is none', () => {
    expect(solve([1, 1, 1, 1])).toBeNull();
    expect(isSolvable([1, 1, 1, 1])).toBe(false);
    expect(isSolvable([13, 13, 13, 13])).toBe(false);
  });
});

describe('the deal', () => {
  it('is always solvable, 1 to 13, smallest first', () => {
    const hands = dealHands(seededRandom(7), 200);
    for (const hand of hands) {
      expect(hand).toHaveLength(4);
      expect(hand).toEqual(hand.toSorted((a, b) => a - b));
      for (const card of hand) {
        expect(card).toBeGreaterThanOrEqual(1);
        expect(card).toBeLessThanOrEqual(13);
      }
      expect(isSolvable(hand)).toBe(true);
    }
  });

  it('is the same for the same seed, which is all a challenge link holds', () => {
    const seed = newSeed(seededRandom(1));
    expect(seed).toMatch(SEED_PATTERN);
    const a = dealHands(seededRandom(seedNumber(seed)), 10);
    const b = dealHands(seededRandom(seedNumber(seed)), 10);
    expect(a).toEqual(b);
    expect(dealHands(seededRandom(seedNumber('zzzzzz')), 10)).not.toEqual(a);
  });
});
