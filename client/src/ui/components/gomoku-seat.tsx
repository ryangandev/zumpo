import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { Avatar, type AvatarTone } from './avatar';
import { Stone, type StoneColor } from './stone';
import { Tag } from './tag';
import styles from './gomoku-seat.module.css';

/** Turn is the player to move; Won the winner of the game just ended. */
export type GomokuSeatState = 'default' | 'turn' | 'won';

export interface GomokuSeatProps {
  name: string;
  /** Under the name: "Black · your turn", "White · Medium", "Here". */
  detail: string;
  /**
   * After the name in a compact seat, where the stone says the colour: the
   * note alone ("Your turn", "1 win"); the detail when there is none.
   */
  compactDetail?: string;
  /** The player's avatar; a free seat has none. */
  avatar?: { initials: string; tone: AvatarTone };
  /** Their stones this game; none before the first. */
  color?: StoneColor | null;
  state?: GomokuSeatState;
  you?: boolean;
  /**
   * A phone's seat, one of two one under the other below the board: one
   * line, the stone before the name, no avatar, and the detail at its end.
   */
  compact?: boolean;
  className?: string;
}

/** Zumpo/Gomoku seat: one of the two players, with a stone of their colour. */
export function GomokuSeat({
  name,
  detail,
  compactDetail,
  avatar,
  color = null,
  state = 'default',
  you = false,
  compact = false,
  className,
}: GomokuSeatProps) {
  const m = useMessages();
  const line = compact ? (compactDetail ?? detail) : detail;
  return (
    <div
      className={cx(
        styles.seat,
        state !== 'default' && styles[state],
        compact && styles.compact,
        className,
      )}
    >
      <div className={styles.player}>
        {avatar && !compact && (
          <Avatar initials={avatar.initials} tone={avatar.tone} />
        )}
        <div className={styles.details}>
          <div className={styles.nameLine}>
            <span className={styles.name}>{name}</span>
            {you && (
              <Tag size={compact ? 'compact' : 'regular'}>{m.ui.you}</Tag>
            )}
          </div>
          {/* The stone is drawn, not said: a screen reader hears the colour. */}
          {compact && color && (
            <span className={styles.colour}>{m.gomoku.color(color)}</span>
          )}
          {line && <span className={styles.detail}>{line}</span>}
        </div>
      </div>
      {color && <Stone color={color} size={compact ? 'small' : undefined} />}
    </div>
  );
}
