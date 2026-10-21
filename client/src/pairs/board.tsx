import type { ReactNode } from 'react';
import { PairsCard, type PairsCardSize, type PairsCardState } from '../ui';
import { cx } from '../ui/cx';
import { Fit } from '../shell/fit';
import { PlayBoard, playColumn } from '../shell/play-board';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { useMessages } from '../i18n';
import styles from './board.module.css';

export interface PairsGridProps {
  /** Every card in its place, row by row, on a square board. */
  cards: readonly PairsCardState[];
  /** Set while a face-down card may be turned over. */
  onFlip?: (index: number) => void;
  /**
   * The board being played, which a phone fits into its one screen with the
   * turn bar; false for a finished board under its results.
   */
  inPlay?: boolean;
}

/**
 * A Pairs board, in a room or on your own. On a phone a 6 × 6 board uses
 * compact cards, so it fits without panning; on a wider screen a 4 × 4 board
 * uses large ones, as wide as a 6 × 6 board (PR11).
 */
export function PairsGrid({ cards, onFlip, inPlay = true }: PairsGridProps) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const side = Math.round(Math.sqrt(cards.length));
  const size: PairsCardSize =
    side > 4 ? (phone ? 'compact' : 'regular') : phone ? 'regular' : 'large';
  const rows = Array.from({ length: side }, (_, row) =>
    cards.slice(row * side, (row + 1) * side),
  );
  const Holder = inPlay ? PlayBoard : Fit;
  return (
    <Holder>
      <div
        className={cx(styles.board, size === 'compact' && styles.compact)}
        role="grid"
        aria-label={m.pairs.cards}
      >
        {rows.map((row, r) => (
          <div key={r} className={styles.row} role="row">
            {row.map((card, c) => {
              const index = r * side + c;
              return (
                <PairsCard
                  key={index}
                  state={card}
                  size={size}
                  row={r}
                  column={c}
                  onPick={onFlip ? () => onFlip(index) : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </Holder>
  );
}

/** The paper panel a board is played on; bare on a phone. */
export function BoardPanel({ children }: { children: ReactNode }) {
  return <div className={cx(styles.panel, playColumn)}>{children}</div>;
}
