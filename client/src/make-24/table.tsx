import { itemAt } from '../../../shared/list';
import { useState, type ReactNode } from 'react';
import {
  formatExpression,
  formatFraction,
  formatLastStep,
  isTarget,
  OPERATOR_SYMBOLS,
  OPERATORS,
  play,
  type Card,
  type Operator,
  type Step,
} from '../../../shared/make-24';
import { Button, NumberCard, OperatorKey, type NumberCardState } from '../ui';
import { cx } from '../ui/cx';
import { Fit } from '../shell/fit';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { useMessages, type Messages } from '../i18n';
import styles from './table.module.css';

/** The cards after `steps`, or the deal itself if a step does not fit it. */
export const cardsAfter = (deal: readonly number[], steps: readonly Step[]) =>
  play(deal, steps) ?? play(deal, [])!;

/** The paper panel a hand is played on (T02-T09); bare on a phone. */
export function TablePanel({ children }: { children: ReactNode }) {
  return <div className={styles.panel}>{children}</div>;
}

/** The cards in one row, each as it stands; scaled down where the row is wider than the table. */
function CardRow({
  cards,
  compact,
  children,
}: {
  cards: readonly {
    key: string;
    value: string;
    formula?: string;
    state?: NumberCardState;
    label?: string;
    onPick?: () => void;
    disabled?: boolean;
  }[];
  compact: boolean;
  children?: ReactNode;
}) {
  return (
    <Fit>
      <div className={cx(styles.cards, compact && styles.compactCards)}>
        {cards.map(({ key, ...card }) => (
          <NumberCard
            key={key}
            size={compact ? 'compact' : 'regular'}
            {...card}
          />
        ))}
        {children}
      </div>
    </Fit>
  );
}

/** A hand's four cards as dealt, to look at: a reveal, a game's results. */
export function DealtCards({ deal }: { deal: readonly number[] }) {
  const phone = useMediaQuery(PHONE);
  return (
    <div className={styles.table}>
      <CardRow
        compact={phone}
        cards={deal.map((value, index) => ({
          key: String(index),
          value: String(value),
        }))}
      />
    </div>
  );
}

/** One card that ends a hand, such as a skipped hand's 24 and how. */
export function FinalCard({
  value,
  formula,
  state,
  prompt,
}: {
  value: string;
  formula: string;
  state: NumberCardState;
  prompt: string;
}) {
  return (
    <div className={styles.table}>
      {/* One card fits a phone at full size, with room for its formula. */}
      <CardRow
        compact={false}
        cards={[{ key: 'final', value, formula, state }]}
      />
      <p className={styles.prompt}>{prompt}</p>
    </div>
  );
}

function cardView(card: Card, cards: readonly Card[], m: Messages) {
  const value = formatFraction(card.value);
  const last = cards.length === 1;
  if (last && isTarget(card.value)) {
    return {
      value,
      formula: formatExpression(card.expression),
      state: 'solved' as const,
    };
  }
  if (last)
    return { value, formula: m.make24.table.not24, state: 'not-24' as const };
  const formula = formatLastStep(card.expression) ?? undefined;
  return {
    value,
    formula,
    state: formula ? ('made' as const) : undefined,
    label: formula ? m.make24.table.cardFrom(value, formula) : value,
  };
}

export interface HandTableProps {
  deal: readonly number[];
  steps: readonly Step[];
  onStep: (step: Step) => void;
  onUndo: () => void;
  onStartOver: () => void;
  /**
   * The hand is over for this player: its last card, with this under it.
   * Nothing can be picked.
   */
  done?: string;
  /** Nothing can be picked for now, such as while reconnecting. */
  paused?: boolean;
  /** Another way out, such as Skip on your own. */
  extraTool?: ReactNode;
}

/**
 * T02-T04, T06, T07, T11, T12: a hand in play. Pick a card, a sign and a
 * second card; the two become one in the first card's place. One card left
 * is 24, or it is not and says so.
 */
export function HandTable({
  deal,
  steps,
  onStep,
  onUndo,
  onStartOver,
  done,
  paused = false,
  extraTool,
}: HandTableProps) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const cards = cardsAfter(deal, steps);
  // A selection belongs to the cards it was made on; any step resets it.
  const [selection, setSelection] = useState<{
    at: number;
    first: number | null;
    op: Operator | null;
  }>({ at: 0, first: null, op: null });
  const { first, op } =
    selection.at === steps.length ? selection : { first: null, op: null };
  const select = (next: { first: number | null; op: Operator | null }) =>
    setSelection({ at: steps.length, ...next });

  const compact = phone && cards.length > 2;
  const views = cards.map((card) => cardView(card, cards, m));

  if (done !== undefined) {
    return (
      <div className={styles.table}>
        <CardRow
          compact={compact}
          cards={views.map((view, index) => ({ key: String(index), ...view }))}
        />
        <p className={styles.prompt}>{done}</p>
      </div>
    );
  }

  const finished = cards.length === 1;
  const pick = (index: number) => {
    if (first === null) return select({ first: index, op: null });
    if (index === first) return select({ first: null, op: null });
    if (op === null) return select({ first: index, op: null });
    select({ first: null, op: null });
    onStep({ left: first, op, right: index });
  };

  const firstValue = first === null ? null : itemAt(views, first).value;
  const prompt =
    firstValue === null
      ? m.make24.table.pickNumber
      : op === null
        ? m.make24.table.pickSign(firstValue)
        : m.make24.table.pickSecond(firstValue, OPERATOR_SYMBOLS[op]);

  const tools = (
    <>
      <Button
        variant={finished ? 'primary' : 'secondary'}
        icon="undo"
        onClick={onUndo}
        disabled={paused || steps.length === 0}
      >
        {m.make24.table.undo}
      </Button>
      <Button
        variant="secondary"
        onClick={onStartOver}
        disabled={paused || steps.length === 0}
      >
        {m.make24.table.startOver}
      </Button>
    </>
  );

  return (
    <div className={styles.table}>
      <CardRow
        compact={compact}
        cards={views.map((view, index) => ({
          key: String(index),
          ...view,
          state: index === first ? 'selected' : view.state,
          label: view.label ?? view.value,
          onPick: finished ? undefined : () => pick(index),
          disabled:
            paused ||
            // Nothing divides by zero.
            (op === '/' &&
              index !== first &&
              itemAt(cards, index).value.n === 0),
        }))}
      />
      {!finished && (
        <>
          <p className={styles.prompt} aria-live="polite">
            {prompt}
          </p>
          <div
            className={styles.operators}
            role="group"
            aria-label={m.make24.table.signs}
          >
            {OPERATORS.map((sign) => (
              <OperatorKey
                key={sign}
                symbol={OPERATOR_SYMBOLS[sign]}
                label={m.make24.table.operator(sign)}
                selected={op === sign}
                disabled={paused || first === null}
                onPick={() => select({ first, op: op === sign ? null : sign })}
              />
            ))}
          </div>
        </>
      )}
      {phone && extraTool ? (
        <>
          <div className={styles.tools}>{tools}</div>
          {extraTool}
        </>
      ) : (
        <div className={styles.tools}>
          {tools}
          {extraTool}
        </div>
      )}
    </div>
  );
}

/** "Your steps": each step as sums, "8 − 4 = 4". A phone leaves it out. */
export function StepList({
  deal,
  steps,
}: {
  deal: readonly number[];
  steps: readonly Step[];
}) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  if (phone || steps.length === 0) return null;
  const lines = steps.map((step, index) => {
    const cards = cardsAfter(deal, steps.slice(0, index + 1));
    // The new card took the first card's place, one along if a card before
    // it went.
    const made = itemAt(
      cards,
      step.right < step.left ? step.left - 1 : step.left,
    );
    return `${formatLastStep(made.expression)} = ${formatFraction(made.value)}`;
  });
  return (
    <section className={styles.steps} aria-labelledby="your-steps">
      <h2 id="your-steps" className={styles.heading}>
        {m.make24.table.yourSteps}
      </h2>
      <ol className={styles.list}>
        {lines.map((line, index) => (
          <li key={index} className={styles.step}>
            <span className={styles.number}>{index + 1}</span>
            <span className={styles.sum}>{line}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
