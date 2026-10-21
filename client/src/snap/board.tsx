import type { Card } from '../../../shared/snap';
import { SnapCard, Tag, type SnapCardState, type SnapSpotMark } from '../ui';
import { Fit } from '../shell/fit';
import { PlayBoard, playColumn } from '../shell/play-board';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { cx } from '../ui/cx';
import styles from './board.module.css';

/** One card on the board, with the label over it. */
export interface CardView {
  symbols: Card;
  /** "Middle card", "Your card", "Last card". */
  label: string;
  /** The tag beside the label: "18 left", "2 won", who took the last card. */
  tag?: string;
  state?: SnapCardState;
  marks?: Readonly<Partial<Record<number, SnapSpotMark>>>;
  badge?: string;
  badgeLabel?: string;
}

export interface SnapBoardProps {
  middle: CardView;
  /** Yours; a spectator has none. */
  mine?: CardView | null;
  /** Set for a player who taps, on either card; a spectator has none. */
  onTap?: (symbol: number) => void;
  /** Taps nothing for now, keeping the buttons and their focus. */
  disabled?: boolean;
  /**
   * The cards being played, which a phone fits into its one screen with the
   * turn bar; false for the last card under the results.
   */
  inPlay?: boolean;
}

/**
 * The middle card and yours: side by side on a desktop, the middle card over
 * yours on a phone, so yours is nearer the thumb. Either card's spots tap
 * the same symbol, so it does not matter which one you find it on.
 */
export function SnapBoard({
  middle,
  mine,
  onTap,
  disabled,
  inPlay = true,
}: SnapBoardProps) {
  const phone = useMediaQuery(PHONE);
  const size = phone ? 'compact' : 'regular';
  const Holder = inPlay ? PlayBoard : Fit;
  return (
    <div className={cx(styles.panel, playColumn)}>
      <Holder>
        <div className={styles.cards}>
          {[middle, mine].map(
            (view) =>
              view && (
                <section key={view.label} className={styles.column}>
                  <h2 className={styles.label}>
                    {view.label}
                    {view.tag !== undefined && <Tag>{view.tag}</Tag>}
                  </h2>
                  <SnapCard
                    symbols={view.symbols}
                    size={size}
                    state={view.state}
                    marks={view.marks}
                    badge={view.badge}
                    badgeLabel={view.badgeLabel}
                    label={view.label}
                    onTap={onTap}
                    disabled={disabled}
                  />
                </section>
              ),
          )}
        </div>
      </Holder>
    </div>
  );
}
