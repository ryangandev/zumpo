import { SPOT_LAYOUT } from '../../../../shared/snap';
import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { SnapSymbol } from './snap-symbol';
import styles from './snap-card.module.css';

export type SnapCardState =
  | 'default'
  /** Just taken: ringed in green, with the taker's initials on its badge. */
  | 'taken'
  /** Yours while you are locked out: every symbol but a marked one fades. */
  | 'locked';

export type SnapCardSize = 'regular' | 'compact' | 'mini';

/** Zumpo/Snap spot's marks: the match, a wrong tap, or faded. */
export type SnapSpotMark = 'match' | 'miss' | 'dim';

export interface SnapCardProps {
  /** The card's six symbols in spot order, the first in the centre. */
  symbols: readonly number[];
  /** Regular is 320 px across; Compact, 224, fits a phone; Mini, 72. */
  size?: SnapCardSize;
  state?: SnapCardState;
  /** Marks by symbol: the match on both cards, a miss where it was tapped. */
  marks?: Readonly<Partial<Record<number, SnapSpotMark>>>;
  /** The taker's initials, on the badge over a taken card. */
  badge?: string;
  /** What the badge means, for the card's accessible name: "taken by Maya". */
  badgeLabel?: string;
  /** The card's accessible name: "Middle card". */
  label?: string;
  /** Makes every spot a button that taps its symbol. */
  onTap?: (symbol: number) => void;
  /**
   * Keeps the buttons but taps nothing, while a card is taken or you are
   * locked out; a button that went away would take the keyboard focus too.
   */
  disabled?: boolean;
}

/** Zumpo/Snap card: a round card of six symbols in its spots. */
export function SnapCard({
  symbols,
  size = 'regular',
  state = 'default',
  marks = {},
  badge,
  badgeLabel,
  label,
  onTap,
  disabled = false,
}: SnapCardProps) {
  const m = useMessages();
  const words = m.ui.snap;
  let name = label;
  if (name && badgeLabel) name = words.note(name, badgeLabel);
  if (name && state === 'locked') name = words.note(name, words.locked);
  return (
    <div
      className={cx(
        styles.card,
        size !== 'regular' && styles[size],
        state !== 'default' && styles[state],
      )}
      role="group"
      aria-label={name}
    >
      {symbols.map((symbol, spot) => {
        const layout = SPOT_LAYOUT[spot];
        if (!layout) return null;
        const mark =
          marks[symbol] ?? (state === 'locked' ? ('dim' as const) : undefined);
        const spotName = `${words.symbol(symbol)}${
          mark === 'match' || mark === 'miss' ? words.marks[mark] : ''
        }`;
        const className = cx(
          styles.spot,
          mark && styles[mark],
          onTap && styles.button,
        );
        const place = {
          left: `${(layout.x - layout.size / 2) * 100}%`,
          top: `${(layout.y - layout.size / 2) * 100}%`,
          width: `${layout.size * 100}%`,
          height: `${layout.size * 100}%`,
        };
        const face = <SnapSymbol symbol={symbol} className={styles.symbol} />;
        // Keyed by spot, not symbol, so the focused spot stays as the next
        // card comes up.
        return onTap ? (
          <button
            key={spot}
            type="button"
            className={className}
            style={place}
            aria-label={spotName}
            aria-disabled={disabled || undefined}
            onClick={disabled ? undefined : () => onTap(symbol)}
          >
            {face}
          </button>
        ) : (
          <span
            key={spot}
            className={className}
            style={place}
            role="img"
            aria-label={spotName}
          >
            {face}
          </span>
        );
      })}
      {badge && (
        <span className={styles.badge} aria-hidden="true">
          {badge}
        </span>
      )}
    </div>
  );
}
