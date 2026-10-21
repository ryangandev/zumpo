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

export type PairsCardSize = 'regular' | 'compact' | 'large';

/** The symbol on a card of each size, as Figma draws it. */
const SYMBOL_SIZE: Record<PairsCardSize, number> = {
  regular: 44,
  compact: 30,
  large: 68,
};

export interface PairsCardProps {
  state: PairsCardState;
  /**
   * Regular is 80 px; Compact, 52 px, fits a 6 × 6 board on a phone; Large,
   * 124 px, makes a 4 × 4 board on a desktop as wide as 6 × 6 at Regular.
   */
  size?: PairsCardSize;
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
  const label = m.ui.position(row + 1, column + 1, describe(state, m));
  const actionable = state.kind === 'down' && onPick != null;
  return (
    <span
      className={cx(
        styles.card,
        size !== 'regular' && styles[size],
        styles[state.kind],
        actionable && styles.pickable,
      )}
      role="gridcell"
      aria-label={actionable ? undefined : label}
    >
      {state.kind !== 'down' && (
        <PairsSymbol
          symbol={state.symbol}
          size={SYMBOL_SIZE[size]}
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
