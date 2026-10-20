import { useMessages } from '../../i18n';
import { useId, type ReactNode } from 'react';
import { cx } from '../cx';
import panel from './panel.module.css';
import styles from './scoreboard.module.css';

export interface ScoreboardProps {
  /** The heading; Players unless given, as for the spectator seats. */
  title?: string;
  players: number;
  seats: number;
  /** Zumpo/Player rows, sorted by score. */
  children: ReactNode;
  className?: string;
}

/** Zumpo/Scoreboard: the room's players, sorted by score. */
export function Scoreboard({
  title,
  players,
  seats,
  children,
  className,
}: ScoreboardProps) {
  const m = useMessages();
  const headingId = useId();
  return (
    <section
      className={cx(panel.panel, styles.scoreboard, className)}
      aria-labelledby={headingId}
    >
      <div className={cx(panel.heading, styles.heading)}>
        <h2 id={headingId} className={panel.heading}>
          {title ?? m.ui.players}
        </h2>
        <span
          className={styles.count}
          aria-label={m.ui.seatsTaken(players, seats)}
        >
          {players} / {seats}
        </span>
      </div>
      <ul className={styles.list}>{children}</ul>
    </section>
  );
}
