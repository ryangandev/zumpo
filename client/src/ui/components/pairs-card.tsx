import { itemAt } from '../../../../shared/list';
import { useMessages, type Messages } from '../../i18n';
import { cx } from '../cx';
import { PairsSymbol } from './pairs-symbol';
import styles from './pairs-card.module.css';

export type PairsCardState =
  | { kind: 'down' }
  /** Turned over this turn. */
  | { kind: 'up'; symbol: number }
  /** One of a pair somebody found; it stays where it lies. */
  | { kind: 'matched'; symbol: number };

export interface PairsCardProps {
  state: PairsCardState;
  /** Regular is 80 px; Compact, 52 px, fits a 6 × 6 board on a phone. */
  size?: 'regular' | 'compact';
  /** Makes a face-down card a button that turns it over. */
  onPick?: () => void;
  /** The card's place, for its accessible name. */
  row: number;
  column: number;
}

function describe(state: PairsCardState, m: Messages): string {
  switch (state.kind) {
    case 'down':
      return m.ui.pairs.down;
    case 'up':
      return itemAt(m.ui.pairs.symbols, state.symbol);
    case 'matched':
      return m.ui.pairs.matched(itemAt(m.ui.pairs.symbols, state.symbol));
  }
}

/** Zumpo/Pairs card: one card of a Pairs board, in its place. */
export function PairsCard({
  state,
  size = 'regular',
  onPick,
  row,
  column,
}: PairsCardProps) {
  const m = useMessages();
  const compact = size === 'compact';
  const label = m.ui.position(row + 1, column + 1, describe(state, m));
  const actionable = state.kind === 'down' && onPick != null;
  return (
    <span
      className={cx(
        styles.card,
        compact && styles.compact,
        styles[state.kind],
        actionable && styles.pickable,
      )}
      role="gridcell"
      aria-label={actionable ? undefined : label}
    >
      {state.kind !== 'down' && (
        <PairsSymbol
          symbol={state.symbol}
          size={compact ? 30 : 44}
          className={styles.symbol}
        />
      )}
      {actionable && (
        <button
          type="button"
          className={styles.hit}
          aria-label={label}
          onClick={onPick}
        />
      )}
    </span>
  );
}
