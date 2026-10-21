import { useMessages } from '../i18n';
import type { ReactNode } from 'react';
import { LetterTile } from '../ui';
import styles from './panel.module.css';

/** The paper panel a board is played on (CB02-CB12); bare on a phone. */
export function BoardPanel({ children }: { children: ReactNode }) {
  return <div className={styles.panel}>{children}</div>;
}

/** CB02-CB05: what the three pegs mean, beside a board on your own. */
export function PegLegend() {
  const m = useMessages();
  return (
    <div className={styles.legend}>
      <ul className={styles.pegs}>
        <li className={styles.peg}>
          <span className={styles.icon} aria-hidden="true">
            <LetterTile state="correct" size="mini" />
          </span>
          {m.codeBreaker.legend.right}
        </li>
        <li className={styles.peg}>
          <span className={styles.icon} aria-hidden="true">
            <LetterTile state="present" size="mini" />
          </span>
          {m.codeBreaker.legend.moved}
        </li>
        <li className={styles.peg}>
          <span className={styles.icon} aria-hidden="true">
            <LetterTile state="absent" size="mini" />
          </span>
          {m.codeBreaker.legend.none}
        </li>
      </ul>
      <p className={styles.count}>{m.codeBreaker.legend.count}</p>
    </div>
  );
}
