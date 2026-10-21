import type { ReactNode } from 'react';
import {
  GomokuBoard,
  GomokuSeat,
  type GomokuBoardProps,
  type GomokuSeatProps,
} from '../ui';
import { cx } from '../ui/cx';
import { playColumn } from '../shell/play-board';
import styles from './table.module.css';

export interface SeatView extends GomokuSeatProps {
  key: string;
}

export interface GomokuTableProps {
  /** The board; its size follows the layout. */
  board: Omit<GomokuBoardProps, 'size'>;
  /** Black's seat first, then White's. */
  seats: readonly SeatView[];
  /** Under the seats, for the viewer alone: a missed turn. */
  notice?: ReactNode;
  /** Under the seats, in muted text: how colours work, or a hint. */
  note?: string;
  /** Under the seats on a phone, at the foot of the side on a desktop. */
  actions?: ReactNode;
  /** A phone's column: no panel, the small board, actions full width. */
  phone: boolean;
  /**
   * A game on a phone, played on one screen: the board takes the height
   * the actions and the seats leave it.
   */
  fill?: boolean;
}

/**
 * GM03-GM19: the board and its two seats. On a desktop they share a paper
 * panel, the seats beside the board and the actions at the foot of the
 * seats' column; on a phone the board comes first, then the actions, then
 * the two seats side by side. The table keeps its place in the tree through
 * every turn and between games, so a focused point keeps the focus through
 * a move.
 */
export function GomokuTable({
  board,
  seats,
  notice,
  note,
  actions,
  phone,
  fill = false,
}: GomokuTableProps) {
  return (
    <section
      className={cx(
        styles.table,
        phone ? styles.phone : styles.panel,
        playColumn,
      )}
    >
      <div className={cx(styles.game, playColumn)}>
        <div
          className={styles.boardBox}
          data-play-board={fill ? '' : undefined}
        >
          <GomokuBoard
            {...board}
            size={phone ? 'small' : 'regular'}
            className={styles.board}
          />
        </div>
        <div className={styles.side}>
          <div className={styles.seats}>
            {seats.map(({ key, ...seat }) => (
              <GomokuSeat key={key} {...seat} compact={phone} />
            ))}
            {notice}
            {note && <p className={styles.note}>{note}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      </div>
    </section>
  );
}
