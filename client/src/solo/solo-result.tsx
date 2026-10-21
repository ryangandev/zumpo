import type { ReactNode } from 'react';
import { Confetti } from '../room/confetti';
import { Card, StatList, type Stat } from '../ui';
import styles from './solo-result.module.css';

/**
 * A finished game on your own, first in the column beside the board, so the
 * board stays where it was played (MS03, MS04, T05, PR04, DW04-DW06): how it
 * went, a number or two the screen shows nowhere else, and what next.
 * `SoloLayout` places it, under the board on one column.
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
  /** How it compares with the best on this device, or what comes next. */
  body: string;
  /** None for a game whose numbers the screen already shows. */
  stats?: readonly Stat[];
  /**
   * Play again first, then the change of settings ("Change board"): two at
   * most, so they share one line.
   */
  actions: ReactNode;
  /** Bursts into a room's confetti: a new best, or a win against the bots. */
  celebrate?: boolean;
}) {
  return (
    <Card
      kind="panel"
      title={title}
      actions={actions}
      className={styles.result}
    >
      {answer}
      <p className={styles.body}>{body}</p>
      {stats && <StatList className={styles.stats} stats={stats} />}
      {celebrate && <Confetti />}
    </Card>
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
