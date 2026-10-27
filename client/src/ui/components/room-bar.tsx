import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useMessages } from '../../i18n';
import { fittingZoom } from '../../shell/fit';
import { cx } from '../cx';
import { Button } from './button';
import { ViewerAvatar, type Viewer, type ViewerMenu } from './header';
import { SoundMenu, type SoundMenuProps } from './sound-menu';
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
  /**
   * Where the room is: "Waiting room", "Round 2 of 2", "Game over". `lead`
   * comes before it, as "Watching" does for a spectator; on a phone it gives
   * way before the label does.
   */
  phase: { tone: TagTone; label: string; lead?: string };
  onHowToPlay: () => void;
  /** Without it, as while reconnecting, there is no Leave room button. */
  onLeave?: () => void;
  /** "Leave room"; a game on your own has no room, so it says "Leave". */
  leaveLabel?: string;
  viewer?: Viewer;
  viewerMenu?: ViewerMenu;
  /** The speaker before the avatar; left out where there is no sound to set. */
  sound?: SoundMenuProps;
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
  sound,
  className,
}: RoomBarProps) {
  const m = useMessages();
  const phone = layout === 'phone';
  const gameName = useFittedName(phone);
  const separator = m.ui.room.contextSeparator;
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
        <h1 className={styles.game}>
          <span ref={gameName}>{game}</span>
        </h1>
        {phone ? (
          <p className={styles.context}>
            {room && (
              <span className={styles.room}>
                <span className={styles.roomName}>{room}</span>
                {separator}
              </span>
            )}
            {phase.lead && (
              <span className={styles.lead}>
                {phase.lead}
                {separator}
              </span>
            )}
            <span className={styles.phase}>{phase.label}</span>
          </p>
        ) : (
          <div className={styles.tags}>
            {room && <Tag>{room}</Tag>}
            <Tag tone={phase.tone}>
              {phase.lead && phase.lead + separator}
              {phase.label}
            </Tag>
          </div>
        )}
      </div>
      <Button
        variant="secondary"
        icon="info"
        iconOnly={phone}
        className={phone ? styles.action : undefined}
        onClick={onHowToPlay}
      >
        {m.ui.room.howToPlay}
      </Button>
      {onLeave && (
        <Button
          variant="secondary"
          icon="leave"
          iconOnly={phone}
          className={phone ? styles.action : undefined}
          onClick={onLeave}
        >
          {leaveLabel ?? m.ui.room.leave}
        </Button>
      )}
      {sound && (
        <SoundMenu
          {...sound}
          triggerClassName={phone ? styles.action : undefined}
        />
      )}
      {viewer && <ViewerAvatar viewer={viewer} menu={viewerMenu} />}
    </header>
  );
}

/**
 * The smallest a game's name is scaled in the Phone bar: 24 px down to about
 * 14, still larger than the line under it. Draw & Guess, the longest name,
 * needs it at 320 px, the narrowest phone; past it the name ends in an
 * ellipsis instead.
 */
const SMALLEST_NAME = 0.6;

/**
 * The Phone bar's game name, scaled down to the width its three icon buttons
 * leave it, as the turn bar's main line is, rather than cut: at 390 px every
 * game's name fits as Figma draws it (SO07), and a narrower phone shrinks
 * the longest a little. It is measured again as the bar or the name changes.
 */
function useFittedName(phone: boolean) {
  const name = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = name.current;
    const heading = element?.parentElement;
    if (!element || !heading) return;
    const fit = () => {
      element.style.removeProperty('zoom');
      if (!phone) return;
      const given = heading.clientWidth;
      const needed = element.getBoundingClientRect().width;
      if (given > 0 && needed > given) {
        const zoom = fittingZoom(element, given, needed);
        if (zoom < SMALLEST_NAME) {
          element.style.setProperty('zoom', String(SMALLEST_NAME));
        }
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(heading);
    // The name's own width is not watched, an inline box having none to
    // observe: a new name, or one in another language, is.
    const words = new MutationObserver(fit);
    words.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      observer.disconnect();
      words.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
      element.style.removeProperty('zoom');
    };
  }, [phone]);
  return name;
}
