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
import { useTypingKeys } from '../shell/board-typing';
import { useFitHeight, type FitHeight } from '../shell/fit-height';
import { PlayBoard, playColumn } from '../shell/play-board';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { useMessages, type Messages } from '../i18n';
import styles from './table.module.css';

/** The cards after `steps`, or the deal itself if a step does not fit it. */
export const cardsAfter = (deal: readonly number[], steps: readonly Step[]) =>
  play(deal, steps) ?? play(deal, [])!;

/**
 * The paper panel a hand is played on (T02-T09); bare on a phone.
 * `fitHeight` keeps the cards and their keys inside the window, on your own
 * or in a room (useFitHeight).
 */
export function TablePanel({
  children,
  fitHeight = false,
}: {
  children: ReactNode;
  fitHeight?: FitHeight;
}) {
  const ref = useFitHeight<HTMLDivElement>(fitHeight);
  return (
    <div ref={ref} className={cx(styles.panel, playColumn)}>
      {children}
    </div>
  );
}

/** The cards in one row, each as it stands; scaled down where the row is wider than the table. */
function CardRow({
  cards,
  compact,
  inPlay = false,
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
  /** The hand being played: on a phone it takes the height left. */
  inPlay?: boolean;
  children?: ReactNode;
}) {
  return (
    <PlayBoard inPlay={inPlay}>
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
    </PlayBoard>
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

/** One card that ends a hand, such as a skipped hand's 24 and how (T13). */
export function FinalCard({
  value,
  formula,
  state,
  prompt,
  action,
}: {
  value: string;
  formula: string;
  state: NumberCardState;
  prompt: string;
  /** What to do next, under the prompt: Next hand after a skip. */
  action?: ReactNode;
}) {
  return (
    <div className={cx(styles.table, playColumn)}>
      {/* One card fits a phone at full size, with room for its formula. It
          is still the hand in play, so a phone keeps its one screen and the
          turn bar stays where it was. */}
      <CardRow
        compact={false}
        inPlay
        cards={[{ key: 'final', value, formula, state }]}
      />
      <p className={styles.prompt}>{prompt}</p>
      {action}
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

/** The keys a hand takes: a card's place from the left, or a sign. */
const HAND_KEYS = /^[1-4+\-*x/]$/i;

/** The sign each key picks; "x" is times too, as people write it. */
const KEY_SIGNS: Readonly<Partial<Record<string, Operator>>> = {
  '+': '+',
  '-': '-',
  '*': '*',
  x: '*',
  '/': '/',
};

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
 * is 24, or it is not and says so. A keyboard plays it too, unless the chat
 * has the focus: 1 to 4 pick a card by its place from the left, + - * x /
 * a sign, Backspace undoes a step and Escape starts over.
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

  const finished = cards.length === 1;
  const playing = done === undefined && !paused;
  // Nothing divides by zero.
  const blocked = (index: number) =>
    op === '/' && index !== first && itemAt(cards, index).value.n === 0;
  const pick = (index: number) => {
    if (first === null) return select({ first: index, op: null });
    if (index === first) return select({ first: null, op: null });
    if (op === null) return select({ first: index, op: null });
    select({ first: null, op: null });
    onStep({ left: first, op, right: index });
  };
  const pickSign = (sign: Operator) =>
    select({ first, op: op === sign ? null : sign });

  useTypingKeys(
    {
      onKey: (key) => {
        const sign = KEY_SIGNS[key];
        if (sign) {
          if (first !== null && !finished) pickSign(sign);
          return;
        }
        const index = Number(key) - 1;
        if (index < cards.length && !finished && !blocked(index)) pick(index);
      },
      onDelete: () => {
        if (steps.length > 0) onUndo();
      },
      onEscape: () => {
        if (steps.length > 0) onStartOver();
      },
    },
    playing,
    HAND_KEYS,
  );

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
    <div className={cx(styles.table, playColumn)}>
      <CardRow
        compact={compact}
        inPlay
        cards={views.map((view, index) => ({
          key: String(index),
          ...view,
          state: index === first ? 'selected' : view.state,
          label: view.label ?? view.value,
          onPick: finished ? undefined : () => pick(index),
          disabled: paused || blocked(index),
        }))}
      />
      {/* With one card left there is nothing to pick: the prompt and the
          signs keep their room out of sight, so the tools stay put. */}
      <div
        className={cx(styles.picking, finished && styles.held)}
        aria-hidden={finished || undefined}
      >
        <p className={styles.prompt} aria-live="polite">
          {finished ? '' : prompt}
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
              disabled={paused || first === null || finished}
              onPick={() => pickSign(sign)}
            />
          ))}
        </div>
      </div>
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
      {!phone && <p className={styles.keys}>{m.make24.table.keys}</p>}
    </div>
  );
}
