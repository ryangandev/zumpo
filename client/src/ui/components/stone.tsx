import { cx } from '../cx';
import styles from './stone.module.css';

export type StoneColor = 'black' | 'white';

/** Last carries the coral dot of the last stone placed; Win the coral ring. */
export type StoneMark = 'none' | 'last' | 'win';

export interface StoneProps {
  color: StoneColor;
  mark?: StoneMark;
  /** The faint stone: where yours would go, or one sent and not yet placed. */
  ghost?: boolean;
  /** Regular is 32 px, on a desktop board; Small is 18 px, on a phone's. */
  size?: 'regular' | 'small';
  className?: string;
}

/**
 * Zumpo/Stone: one Gomoku stone, with Zumpo/Last move marker on it when it is
 * the last placed. It is decorative: the board names each point.
 */
export function Stone({
  color,
  mark = 'none',
  ghost = false,
  size = 'regular',
  className,
}: StoneProps) {
  return (
    <span
      className={cx(
        styles.stone,
        styles[color],
        size === 'small' && styles.small,
        mark === 'win' && styles.win,
        ghost && styles.ghost,
        className,
      )}
      aria-hidden="true"
    >
      {mark === 'last' && <span className={styles.last} />}
    </span>
  );
}
