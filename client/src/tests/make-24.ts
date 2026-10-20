import {
  combine,
  dealtCards,
  isTarget,
  lastCard,
  OPERATORS,
  type Card,
  type Step,
} from '../../../shared/make-24';

/** Steps that make 24 from `cards`, found the long way. */
function stepsFrom(cards: readonly Card[]): Step[] | null {
  const last = lastCard(cards);
  if (last) return isTarget(last.value) ? [] : null;
  for (let left = 0; left < cards.length; left++) {
    for (let right = 0; right < cards.length; right++) {
      for (const op of OPERATORS) {
        const step = { left, op, right };
        const next = left === right ? null : combine(cards, step);
        const rest = next && stepsFrom(next);
        if (rest) return [step, ...rest];
      }
    }
  }
  return null;
}

/** Steps that solve `deal`, which every dealt hand has. */
export const stepsToSolve = (deal: readonly number[]): Step[] =>
  stepsFrom(dealtCards(deal))!;
