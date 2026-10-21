import { useMessages } from '../../i18n';
import { useId, type ReactNode } from 'react';
import { cx } from '../cx';
import { Icon } from './icon';
import panel from './panel.module.css';
import styles from './scoreboard.module.css';

export interface ScoreboardProps {
  /** The heading; Players unless given, as for the spectator seats. */
  title?: string;
  players: number;
  seats: number;
  /** Zumpo/Player rows, sorted by score. */
  children: ReactNode;
  /**
   * Folded to its heading line, with these names in it, until it is opened:
   * the spectators beside a desktop room, where the chat needs the room.
   */
  folded?: string;
  className?: string;
}

/** Zumpo/Scoreboard: the room's players, sorted by score. */
export function Scoreboard({
  title,
  players,
  seats,
  children,
  folded,
  className,
}: ScoreboardProps) {
  const m = useMessages();
  const headingId = useId();
  const count = (
    <span className={styles.count} aria-label={m.ui.seatsTaken(players, seats)}>
      {players} / {seats}
    </span>
  );
  if (folded !== undefined) {
    return (
      <section
        className={cx(panel.panel, styles.scoreboard, className)}
        aria-labelledby={headingId}
      >
        <details className={styles.fold}>
          <summary className={cx(panel.heading, styles.summary)}>
            <h2 id={headingId} className={cx(panel.heading, styles.title)}>
              {title ?? m.ui.players}
            </h2>
            <span className={styles.names}>{folded}</span>
            {count}
            <Icon glyph="chevron-down" size={20} className={styles.chevron} />
          </summary>
          <ul className={styles.list}>{children}</ul>
        </details>
      </section>
    );
  }
  return (
    <section
      className={cx(panel.panel, styles.scoreboard, className)}
      aria-labelledby={headingId}
    >
      <div className={cx(panel.heading, styles.heading)}>
        <h2 id={headingId} className={panel.heading}>
          {title ?? m.ui.players}
        </h2>
        {count}
      </div>
      <ul className={styles.list}>{children}</ul>
    </section>
  );
}
