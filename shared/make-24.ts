/**
 * Make 24's arithmetic, which a room on the server and a run on your own in
 * the browser both play by: exact fractions, the steps a player takes, how a
 * finished hand reads, a solver, and the deal. The rules are in
 * docs/games/make-24.md.
 */

export const TARGET = 24;
export const HAND_SIZE = 4;
/** Cards are dealt from 1 to this, as from a suit without its picture cards' names. */
export const HIGHEST_CARD = 13;

/** A rational number in lowest terms, with a positive denominator. */
export interface Fraction {
  n: number;
  d: number;
}

import type { Make24Operator, Make24Step } from './wire-types.js';

/** On the wire, plain ASCII; on screen, see OPERATOR_SYMBOLS. */
export type Operator = Make24Operator;
export const OPERATORS: readonly Operator[] = ['+', '-', '*', '/'];
export const OPERATOR_SYMBOLS: Readonly<Record<Operator, string>> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
};

/** One step: the card at `left` and the card at `right` make a new card. */
export type Step = Make24Step;

/** How a card came to be: a dealt number, or two cards and an operator. */
export type Expression =
  number | { op: Operator; left: Expression; right: Expression };

/** A card in front of the player: what it is worth, and how it was made. */
export interface Card {
  value: Fraction;
  expression: Expression;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function reduced(n: number, d: number): Fraction {
  const sign = d < 0 ? -1 : 1;
  const divisor = gcd(Math.abs(n), Math.abs(d)) || 1;
  return { n: (sign * n) / divisor, d: (sign * d) / divisor };
}

export const whole = (n: number): Fraction => ({ n, d: 1 });

/** `a op b`, or null for a division by zero, which is never allowed. */
export function apply(a: Fraction, op: Operator, b: Fraction): Fraction | null {
  switch (op) {
    case '+':
      return reduced(a.n * b.d + b.n * a.d, a.d * b.d);
    case '-':
      return reduced(a.n * b.d - b.n * a.d, a.d * b.d);
    case '*':
      return reduced(a.n * b.n, a.d * b.d);
    case '/':
      return b.n === 0 ? null : reduced(a.n * b.d, a.d * b.n);
  }
}

export const isTarget = (value: Fraction) =>
  value.n === TARGET && value.d === 1;

/** "24", "8/3", "−2". */
export function formatFraction({ n, d }: Fraction): string {
  const sign = n < 0 ? '−' : '';
  return d === 1 ? `${sign}${Math.abs(n)}` : `${sign}${Math.abs(n)}/${d}`;
}

export const dealtCards = (deal: readonly number[]): Card[] =>
  deal.map((n) => ({ value: whole(n), expression: n }));

/**
 * The cards after one more step: the new card takes the left card's place
 * and the right card goes. Null when the step cannot be taken: a card that is
 * not there, a card used twice, or a division by zero.
 */
export function combine(cards: readonly Card[], step: Step): Card[] | null {
  const { left, op, right } = step;
  if (
    !Number.isInteger(left) ||
    !Number.isInteger(right) ||
    left === right ||
    !cards[left] ||
    !cards[right] ||
    !OPERATORS.includes(op)
  ) {
    return null;
  }
  const value = apply(cards[left].value, op, cards[right].value);
  if (!value) return null;
  const made: Card = {
    value,
    expression: {
      op,
      left: cards[left].expression,
      right: cards[right].expression,
    },
  };
  return cards.flatMap((card, index) =>
    index === left ? [made] : index === right ? [] : [card],
  );
}

/** Every step in turn from the deal, or null as soon as one cannot be taken. */
export function play(
  deal: readonly number[],
  steps: readonly Step[],
): Card[] | null {
  let cards: Card[] | null = dealtCards(deal);
  for (const step of steps) {
    cards = combine(cards, step);
    if (!cards) return null;
  }
  return cards;
}

/**
 * True when the steps use every card and end on 24: a solved hand. A server
 * checks a claimed solution with this and nothing else.
 */
/** The one card left once every card is combined, or null while more remain. */
export const lastCard = (cards: readonly Card[]): Card | null =>
  cards.length === 1 ? (cards[0] ?? null) : null;

export function solves(deal: readonly number[], steps: readonly Step[]) {
  if (steps.length !== deal.length - 1) return false;
  const last = lastCard(play(deal, steps) ?? []);
  return last !== null && isTarget(last.value);
}

const PRECEDENCE: Readonly<Record<Operator, number>> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
};

/**
 * "(8 − 4) × (7 − 1)": a card's expression with only the brackets it needs.
 * A right-hand operand of − or ÷ keeps them at equal precedence, because
 * 8 − (4 − 1) is not 8 − 4 − 1.
 */
export function formatExpression(expression: Expression): string {
  if (typeof expression === 'number') return String(expression);
  const { op, left, right } = expression;
  const side = (operand: Expression, isRight: boolean) => {
    const text = formatExpression(operand);
    if (typeof operand === 'number') return text;
    const inner = PRECEDENCE[operand.op];
    const outer = PRECEDENCE[op];
    const bracket =
      inner < outer ||
      (isRight && inner === outer && (op === '-' || op === '/'));
    return bracket ? `(${text})` : text;
  };
  return `${side(left, false)} ${OPERATOR_SYMBOLS[op]} ${side(right, true)}`;
}

/** "8 − 4": the one step that made a card, for the card's own small print. */
export function formatLastStep(expression: Expression): string | null {
  if (typeof expression === 'number') return null;
  const value = (operand: Expression) =>
    formatFraction(evaluate(operand) ?? whole(0));
  return `${value(expression.left)} ${OPERATOR_SYMBOLS[expression.op]} ${value(expression.right)}`;
}

export function evaluate(expression: Expression): Fraction | null {
  if (typeof expression === 'number') return whole(expression);
  const left = evaluate(expression.left);
  const right = evaluate(expression.right);
  return left && right ? apply(left, expression.op, right) : null;
}

/** Every way to finish from `cards`, as the expressions that make 24. */
function* solutions(cards: readonly Card[]): Generator<Expression> {
  const last = lastCard(cards);
  if (last) {
    if (isTarget(last.value)) yield last.expression;
    return;
  }
  for (let left = 0; left < cards.length; left++) {
    for (let right = 0; right < cards.length; right++) {
      if (left === right) continue;
      for (const op of OPERATORS) {
        // a + b and b + a are the same card; trying one is enough.
        if ((op === '+' || op === '*') && right < left) continue;
        const next = combine(cards, { left, op, right });
        if (next) yield* solutions(next);
      }
    }
  }
}

/** True when some intermediate card is a fraction or below zero. */
function awkward(expression: Expression): boolean {
  if (typeof expression === 'number') return false;
  const value = evaluate(expression);
  return (
    !value ||
    value.d !== 1 ||
    value.n < 0 ||
    awkward(expression.left) ||
    awkward(expression.right)
  );
}

/**
 * One way to make 24 from the deal, or null when there is none. Of all the
 * ways, the one a person would most likely write: whole numbers all along if
 * possible, then the shortest.
 */
export function solve(deal: readonly number[]): Expression | null {
  let best: Expression | null = null;
  let bestRank: [number, number] = [Infinity, Infinity];
  for (const expression of solutions(dealtCards(deal))) {
    const rank: [number, number] = [
      awkward(expression) ? 1 : 0,
      formatExpression(expression).length,
    ];
    if (
      rank[0] < bestRank[0] ||
      (rank[0] === bestRank[0] && rank[1] < bestRank[1])
    ) {
      best = expression;
      bestRank = rank;
    }
  }
  return best;
}

export const isSolvable = (deal: readonly number[]) =>
  !solutions(dealtCards(deal)).next().done;

/**
 * Four cards from 1 to 13, smallest first, that can make 24: drawn again
 * until they can, so every hand is solvable.
 */
export function dealHand(random: () => number): number[] {
  for (;;) {
    const deal = Array.from(
      { length: HAND_SIZE },
      () => 1 + Math.floor(random() * HIGHEST_CARD),
    ).toSorted((a, b) => a - b);
    if (isSolvable(deal)) return deal;
  }
}

/** `count` hands from one source: a run on your own, or a room's game. */
export function dealHands(random: () => number, count: number): number[][] {
  return Array.from({ length: count }, () => dealHand(random));
}
