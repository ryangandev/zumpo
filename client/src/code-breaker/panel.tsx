import { useMessages } from '../i18n';
import type { ReactNode } from 'react';
import { LetterTile } from '../ui';
import { cx } from '../ui/cx';
import { useFitHeight, type FitHeight } from '../shell/fit-height';
import { playColumn } from '../shell/play-board';
import styles from './panel.module.css';

/**
 * The paper panel a board is played on (CB02-CB12); bare on a phone.
 * `fitHeight` keeps the board and its keys inside the window, on your own or
 * in a room, measured afresh when `layout` changes (useFitHeight).
 */
export function BoardPanel({
  children,
  fitHeight = false,
  layout,
}: {
  children: ReactNode;
  fitHeight?: FitHeight;
  /** Where the keys are, such as beside the board on a short wide window. */
  layout?: unknown;
}) {
  const ref = useFitHeight<HTMLDivElement>(fitHeight, layout);
  return (
    <div ref={ref} className={cx(styles.panel, playColumn)}>
      {children}
    </div>
  );
}

/** CB02-CB05: what the three pegs mean, beside a board on your own. */
export function PegLegend() {
  const m = useMessages();
  return (
    <div className={styles.legend}>
      <ul className={styles.pegs}>
        <li className={styles.peg}>
          <span className={styles.icon} aria-hidden="true">
            <LetterTile state="correct" size="mini" decorative />
          </span>
          {m.codeBreaker.legend.right}
        </li>
        <li className={styles.peg}>
          <span className={styles.icon} aria-hidden="true">
            <LetterTile state="present" size="mini" decorative />
          </span>
          {m.codeBreaker.legend.moved}
        </li>
        <li className={styles.peg}>
          <span className={styles.icon} aria-hidden="true">
            <LetterTile state="absent" size="mini" decorative />
          </span>
          {m.codeBreaker.legend.none}
        </li>
      </ul>
      <p className={styles.count}>{m.codeBreaker.legend.count}</p>
    </div>
  );
}
