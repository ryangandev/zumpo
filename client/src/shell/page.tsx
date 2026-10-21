import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Header, type Viewer, type ViewerMenu } from '../ui';
import { useMessages } from '../i18n';
import { useSession } from '../net/session';
import { initialsOf, toneOf } from '../players/avatar';
import { LanguageSwitch } from './language-switch';
import { useViewerMenu } from './name-menu';
import styles from './page.module.css';

// Games is the home page, and stays current on every game's own pages.
const LINKS = [{ label: 'games', to: '/', section: '/games' }] as const;

/**
 * Every screen's frame: the header, the page's own content, and the footer.
 * A seated room brings its own room bar in place of the header.
 */
export function Page({
  header,
  children,
}: {
  header?: ReactNode;
  children: ReactNode;
}) {
  const m = useMessages();
  const { pathname } = useLocation();
  const { viewer, viewerMenu } = useViewer();

  const links = LINKS.map(({ label, to, section }) => ({
    label: m.shell.nav[label],
    to,
    current:
      pathname === to ||
      pathname === section ||
      pathname.startsWith(`${section}/`),
  }));

  return (
    <div className={styles.page}>
      {header ?? (
        <Header links={links} viewer={viewer} viewerMenu={viewerMenu} />
      )}
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <span className={styles.wide}>{m.shell.footer.wide}</span>
        <span className={styles.narrow}>{m.shell.footer.narrow}</span>
        <span className={styles.end}>
          {/* The brand line stays as the wordmark says it, in any language. */}
          <span className={styles.wide} lang="en">
            zumpo. / play a little
          </span>
          <LanguageSwitch />
        </span>
      </footer>
    </div>
  );
}

/**
 * The viewer's avatar and the name menu it opens. `seatName` is the name a
 * room gave them, numbered when somebody else there has theirs, so the avatar
 * matches their row.
 */
export function useViewer({ seatName }: { seatName?: string } = {}): {
  viewer: Viewer;
  viewerMenu: ViewerMenu;
} {
  const m = useMessages();
  const session = useSession();
  const name = seatName ?? session.name;
  const viewerMenu = useViewerMenu();
  return {
    viewer: {
      initials: initialsOf(name),
      tone: toneOf(name),
      label: m.shell.name.viewer(name),
    },
    viewerMenu,
  };
}
