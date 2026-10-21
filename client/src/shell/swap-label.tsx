import { cx } from '../ui/cx';
import styles from './swap-label.module.css';

/**
 * One of two labels, in the room of the wider, so a button that says "Copy"
 * and then "Copied" keeps its width and moves nothing beside it. The label not
 * shown is hidden from assistive technology too.
 */
export function SwapLabel({
  second,
  labels: [first, other],
}: {
  /** Shows the second label instead of the first. */
  second: boolean;
  labels: readonly [string, string];
}) {
  return (
    <span className={styles.swap}>
      <span className={cx(second && styles.hidden)} aria-hidden={second}>
        {first}
      </span>
      <span className={cx(!second && styles.hidden)} aria-hidden={!second}>
        {other}
      </span>
    </span>
  );
}
