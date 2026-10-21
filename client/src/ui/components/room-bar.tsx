import { Link } from 'react-router';
import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { Button } from './button';
import { ViewerAvatar, type Viewer, type ViewerMenu } from './header';
import { Tag, type TagTone } from './tag';
import { Wordmark } from './wordmark';
import styles from './room-bar.module.css';

export interface RoomBarProps {
  /**
   * Desktop is one row after the wordmark. Phone is one row too, 48 px tall:
   * no wordmark, the game over a line saying the room and its phase, and the
   * actions as their icons, so it never wraps and never moves the game under
   * it.
   */
  layout?: 'desktop' | 'phone';
  game: string;
  /** The room's name, the first tag; a game on your own's phone bar has none. */
  room?: string;
  /** Where the room is: "Waiting room", "Round 2 of 2", "Game over". */
  phase: { tone: TagTone; label: string };
  onHowToPlay: () => void;
  /** Without it, as while reconnecting, there is no Leave room button. */
  onLeave?: () => void;
  /** "Leave room"; a game on your own has no room, so it says "Leave". */
  leaveLabel?: string;
  viewer?: Viewer;
  viewerMenu?: ViewerMenu;
  className?: string;
}

/**
 * Zumpo/Room bar: a seated room's header and heading in one row, and a game on your own's. How to play
 * opens over the room and Leave room is the way out; the wordmark is a way
 * out too, so whoever renders the bar guards the navigation.
 */
export function RoomBar({
  layout = 'desktop',
  game,
  room,
  phase,
  onHowToPlay,
  onLeave,
  leaveLabel,
  viewer,
  viewerMenu,
  className,
}: RoomBarProps) {
  const m = useMessages();
  const phone = layout === 'phone';
  return (
    <header className={cx(styles.bar, phone && styles.phone, className)}>
      {!phone && (
        <>
          <Link to="/" className={styles.home} aria-label={m.shell.nav.home}>
            <Wordmark />
          </Link>
          <span className={styles.divider} aria-hidden="true" />
        </>
      )}
      <div className={styles.identity}>
        <h1 className={styles.game}>{game}</h1>
        {phone ? (
          <p className={styles.context}>
            {room && <span className={styles.room}>{room}</span>}
            <span className={styles.phase}>
              {room && m.ui.room.contextSeparator}
              {phase.label}
            </span>
          </p>
        ) : (
          <div className={styles.tags}>
            {room && <Tag>{room}</Tag>}
            <Tag tone={phase.tone}>{phase.label}</Tag>
          </div>
        )}
      </div>
      <Button
        variant="secondary"
        icon="info"
        iconOnly={phone}
        onClick={onHowToPlay}
      >
        {m.ui.room.howToPlay}
      </Button>
      {onLeave && (
        <Button
          variant="secondary"
          icon="leave"
          iconOnly={phone}
          onClick={onLeave}
        >
          {leaveLabel ?? m.ui.room.leave}
        </Button>
      )}
      {viewer && <ViewerAvatar viewer={viewer} menu={viewerMenu} />}
    </header>
  );
}
