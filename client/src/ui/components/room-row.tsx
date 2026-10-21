import { useMessages } from '../../i18n';
import { useId } from 'react';
import { cx } from '../cx';
import { Avatar, type AvatarTone } from './avatar';
import { Button } from './button';
import { Icon } from './icon';
import { Tag } from './tag';
import styles from './room-row.module.css';

/** Private is an open room with a password, which is checked on join. */
export type RoomRowStatus = 'open' | 'private' | 'full' | 'playing';

export interface RoomRowProps {
  name: string;
  /**
   * The host plus the game's setting: "Hosted by Maya · 3 rounds"; empty for
   * a room whose name says it all.
   */
  details: string;
  host: { initials: string; tone: AvatarTone };
  players: number;
  seats: number;
  status: RoomRowStatus;
  /** Open and Private rooms only. */
  onJoin?: () => void;
  /** Full and Playing rooms with a spectator seat free: watch instead. */
  onWatch?: () => void;
  className?: string;
}

/**
 * Zumpo/Room row: one room in a lobby list. Full and Playing rooms show their
 * state instead of Join, because they cannot be joined, and Watch beside it
 * while a spectator seat is free. It lays itself out as the Phone variant
 * when its container is narrow.
 */
export function RoomRow({
  name,
  details,
  host,
  players,
  seats,
  status,
  onJoin,
  onWatch,
  className,
}: RoomRowProps) {
  const m = useMessages();
  const nameId = useId();
  return (
    <li className={cx(styles.container, className)}>
      <article className={styles.row} aria-labelledby={nameId}>
        <Avatar {...host} className={styles.host} />
        <div className={styles.identity}>
          <h3 id={nameId} className={styles.name}>
            <span className={styles.nameText}>{name}</span>
            {status === 'private' && (
              <Icon
                glyph="lock"
                size={16}
                label={m.ui.room.password}
                className={styles.lock}
              />
            )}
          </h3>
          {details && <span className={styles.details}>{details}</span>}
        </div>
        <span
          className={styles.players}
          aria-label={m.ui.room.players(players, seats)}
        >
          <Icon glyph="user" size={16} />
          {players} / {seats}
        </span>
        <div className={styles.action}>
          {status === 'full' && <Tag tone="peach">{m.ui.room.full}</Tag>}
          {status === 'playing' && <Tag tone="blue">{m.ui.room.playing}</Tag>}
          {(status === 'full' || status === 'playing') && onWatch && (
            <Button
              variant="secondary"
              onClick={onWatch}
              aria-describedby={nameId}
            >
              {m.ui.room.watch}
            </Button>
          )}
          {(status === 'open' || status === 'private') && (
            <Button
              variant="secondary"
              onClick={onJoin}
              aria-describedby={nameId}
            >
              {m.ui.room.join}
            </Button>
          )}
        </div>
      </article>
    </li>
  );
}
