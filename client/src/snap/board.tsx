import type { Card } from '../../../shared/snap';
import {
  SnapCard,
  Tag,
  TurnBar,
  type SnapCardState,
  type SnapSpotMark,
  type TurnBarProps,
} from '../ui';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
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
  /** Set while a symbol may be tapped, on either card. */
  onTap?: (symbol: number) => void;
}

/**
 * The middle card and yours: side by side on a desktop, the middle card over
 * yours on a phone, so yours is nearer the thumb. Either card's spots tap
 * the same symbol, so it does not matter which one you find it on.
 */
export function SnapBoard({ middle, mine, onTap }: SnapBoardProps) {
  const phone = useMediaQuery(PHONE);
  const size = phone ? 'compact' : 'regular';
  return (
    <div className={styles.panel}>
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
                />
              </section>
            ),
        )}
      </div>
    </div>
  );
}

/**
 * The turn bar over the cards. Stacked on a phone it keeps room for a line
 * of what it says and its meta, so a phase that says less never pulls the
 * cards up under a finger.
 */
export function SnapTurnBar(props: TurnBarProps) {
  return <TurnBar {...props} className={styles.turnBar} />;
}
