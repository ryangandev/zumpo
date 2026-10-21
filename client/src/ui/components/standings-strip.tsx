import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { Avatar, type AvatarTone } from './avatar';
import styles from './standings-strip.module.css';

export interface Standing {
  key: string;
  name: string;
  initials: string;
  tone: AvatarTone;
  /** The score, or what stands for one: "295". */
  value: string;
  /** The viewer's own chip, marked. */
  you?: boolean;
  /** The player's connection dropped: the chip says so instead. */
  away?: boolean;
}

export interface StandingsStripProps {
  /** Best first. */
  standings: readonly Standing[];
  /** Opens the Players tab, where the full rows are. */
  onOpen: () => void;
  className?: string;
}

/**
 * Zumpo/Standings strip: a phone's one line of standings on the Board tab
 * while a game is on, each player a Zumpo/Standing chip, best first, so the
 * race stays in sight without leaving the board. It is one button, to the
 * Players tab; wider than the screen, it scrolls sideways.
 */
export function StandingsStrip({
  standings,
  onOpen,
  className,
}: StandingsStripProps) {
  const m = useMessages();
  const said = standings.map(({ name, value, you, away }) =>
    m.ui.standings.entry(
      you ? m.ui.you : name,
      away ? m.ui.standings.away : value,
    ),
  );
  return (
    <button
      type="button"
      className={cx(styles.strip, className)}
      onClick={onOpen}
      aria-label={m.ui.standings.label(said)}
    >
      {standings.map(({ key, initials, tone, value, you, away }) => (
        <span
          key={key}
          className={cx(
            styles.standing,
            you && styles.you,
            away && styles.away,
          )}
        >
          <Avatar initials={initials} tone={tone} size="small" />
          <span className={styles.value}>
            {away ? m.ui.standings.away : value}
          </span>
        </span>
      ))}
    </button>
  );
}
