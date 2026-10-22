import { useMessages } from '../i18n';
import type { ReactNode } from 'react';
import { LetterTile } from '../ui';
import { cx } from '../ui/cx';
import { useFitHeight, type FitHeight } from '../shell/fit-height';
import { playColumn } from '../shell/play-board';
import styles from './panel.module.css';

/**
 * The paper panel a board is played on (DW01-DW10); bare on a phone.
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

/** DW01-DW03: what the three marks mean, beside a board on your own. */
export function MarkLegend() {
  const m = useMessages();
  return (
    <ul className={styles.legend}>
      <li className={styles.mark}>
        <LetterTile letter="P" state="correct" size="small" />
        {m.dailyWord.legend.correct}
      </li>
      <li className={styles.mark}>
        <LetterTile letter="L" state="present" size="small" />
        {m.dailyWord.legend.present}
      </li>
      <li className={styles.mark}>
        <LetterTile letter="S" state="absent" size="small" />
        {m.dailyWord.legend.absent}
      </li>
    </ul>
  );
}
