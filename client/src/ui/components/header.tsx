import { Link } from 'react-router';
import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { Avatar, type AvatarProps } from './avatar';
import { NameMenu, type NameMenuProps } from './name-menu';
import { SoundMenu, type SoundMenuProps } from './sound-menu';
import { Wordmark } from './wordmark';
import styles from './header.module.css';

export interface HeaderLink {
  label: string;
  to: string;
  current?: boolean;
}

/** The person at the screen, shown by their avatar. */
export type Viewer = Pick<AvatarProps, 'initials' | 'tone' | 'label'>;

export interface HeaderProps {
  links: readonly HeaderLink[];
  viewer?: Viewer;
  /** Opened from the viewer's avatar: their name, and the way to change it. */
  viewerMenu?: ViewerMenu;
  /** The speaker before the avatar; left out where there is no sound to set. */
  sound?: SoundMenuProps;
  className?: string;
}

/** The name menu the viewer's avatar opens, all but its trigger. */
export type ViewerMenu = Omit<NameMenuProps, 'trigger' | 'align'>;

/**
 * Zumpo/Header: the wordmark home link, the main links, the speaker and the
 * viewer. On a phone it is the Mobile navigation row: the wordmark, then the
 * speaker and a smaller avatar.
 */
export function Header({
  links,
  viewer,
  viewerMenu,
  sound,
  className,
}: HeaderProps) {
  const m = useMessages();
  return (
    <header className={cx(styles.header, className)}>
      <Link to="/" className={styles.home} aria-label={m.shell.nav.home}>
        <Wordmark />
      </Link>
      <nav className={styles.nav} aria-label={m.shell.nav.main}>
        <ul className={styles.links}>
          {links.map((link) => (
            <li key={link.label}>
              <Link
                to={link.to}
                className={styles.link}
                aria-current={link.current ? 'page' : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        {sound && <SoundMenu {...sound} />}
        {viewer && <ViewerAvatar viewer={viewer} menu={viewerMenu} />}
      </nav>
    </header>
  );
}

/**
 * The viewer's avatar at the end of a header or room bar: 40 px, 32 px on a
 * phone. With a menu it is the button that opens the name menu (P13).
 */
export function ViewerAvatar({
  viewer,
  menu,
}: {
  viewer: Viewer;
  menu?: ViewerMenu;
}) {
  const m = useMessages();
  if (!menu) return <Avatar {...viewer} className={styles.viewer} />;
  return (
    <NameMenu
      {...menu}
      trigger={
        <button
          type="button"
          className={styles.viewerButton}
          aria-label={viewer.label ?? m.shell.name.yourName}
        >
          <Avatar
            initials={viewer.initials}
            tone={viewer.tone}
            className={styles.viewer}
          />
        </button>
      }
    />
  );
}
