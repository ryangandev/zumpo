import type { ReactNode } from 'react';
import { Confetti } from '../room/confetti';
import { StatList, type Stat } from '../ui';
import styles from './solo-result.module.css';

/**
 * A finished game on your own, over the board it was played on (MS04, T05,
 * PR04, DW04-DW06): how it went, its numbers and what next.
 */
export function SoloResult({
  title,
  answer,
  body,
  stats,
  actions,
  celebrate = false,
}: {
  /** "Cleared in 3:05." */
  title: string;
  /** What was missed, under the title: a `SoloAnswer` (DW05, CB07). */
  answer?: ReactNode;
  /** How it compares with the best on this device. */
  body: string;
  /** None for a game that keeps no numbers, such as a practice word. */
  stats?: readonly Stat[];
  /** Buttons, primary first. */
  actions: ReactNode;
  /** Bursts into a room's confetti: a new best, or a win against the bots. */
  celebrate?: boolean;
}) {
  return (
    <section className={styles.result} aria-labelledby="solo-result-title">
      <div className={styles.heading}>
        <h2 id="solo-result-title" className={styles.title}>
          {title}
        </h2>
        {answer}
        <p className={styles.body}>{body}</p>
      </div>
      {stats && <StatList stats={stats} />}
      <div className={styles.actions}>{actions}</div>
      {celebrate && <Confetti />}
    </section>
  );
}

/** The answer a missed puzzle had, as a row of its tiles that reads as `label`. */
export function SoloAnswer({
  label,
  children,
}: {
  /** "The word was WATCH." */
  label: string;
  /** The tiles, each saying nothing on its own. */
  children: ReactNode;
}) {
  return (
    <div role="img" aria-label={label} className={styles.answer}>
      {children}
    </div>
  );
}
