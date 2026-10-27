import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useLocation } from 'react-router';
import {
  Header,
  type SoundMenuProps,
  type Viewer,
  type ViewerMenu,
} from '../ui';
import { useMessages } from '../i18n';
import { useSession } from '../net/session';
import { initialsOf, toneOf } from '../players/avatar';
import { LanguageSwitch } from './language-switch';
import { useViewerMenu } from './name-menu';
import { focusQuietly, LANDING } from './quiet-focus';
import { useSoundMenu } from './sound-menu';
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
  const { pathname, key } = useLocation();
  const { viewer, viewerMenu, sound } = useViewer();
  const box = useRef<HTMLDivElement>(null);
  // The page the browser loaded is the browser's to focus; the router keys
  // it 'default'.
  useLandingFocus(box, key !== 'default');

  const links = LINKS.map(({ label, to, section }) => ({
    label: m.shell.nav[label],
    to,
    current:
      pathname === to ||
      pathname === section ||
      pathname.startsWith(`${section}/`),
  }));

  return (
    <div ref={box} className={styles.page}>
      {header ?? (
        <Header
          links={links}
          viewer={viewer}
          viewerMenu={viewerMenu}
          sound={sound}
        />
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

/** How long a page may take to bring its heading, as a room connects. */
const LANDING_MS = 5000;

/** Where a page's focus lands: what it is about, before the frame's own. */
const HEADINGS = ['main h1', 'main h2', 'h1'];

/**
 * Lands the focus on a page the viewer went to inside the app, as a page the
 * browser loads would: a link or button pressed on the last page has gone
 * with it, which drops the focus to the document, so the next Tab began
 * again in the header and a screen reader said nothing. The page's first
 * heading takes it, with no ring until a key, once the page has one, as a
 * room has once it has connected. Focus a page puts somewhere itself, such
 * as a game's board or a password field, stays there, and a game starting
 * takes the focus from the heading (`LANDING`, useStartFocus).
 */
function useLandingFocus(page: RefObject<HTMLElement | null>, goneTo: boolean) {
  useEffect(() => {
    const element = page.current;
    if (!goneTo || !element) return;
    const land = () => {
      const active = document.activeElement;
      if (active && active !== document.body) return true;
      for (const selector of HEADINGS) {
        const heading = element.querySelector<HTMLElement>(selector);
        if (!heading) continue;
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        heading.setAttribute(LANDING, '');
        heading.addEventListener(
          'blur',
          () => heading.removeAttribute(LANDING),
          {
            once: true,
          },
        );
        focusQuietly(heading);
        return true;
      }
      return false;
    };
    if (land()) return;
    const observer = new MutationObserver(() => {
      if (land()) stop();
    });
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener('keydown', stop, true);
      window.removeEventListener('pointerdown', stop, true);
    };
    const timer = window.setTimeout(stop, LANDING_MS);
    observer.observe(element, { childList: true, subtree: true });
    window.addEventListener('keydown', stop, true);
    window.addEventListener('pointerdown', stop, true);
    return stop;
  }, [page, goneTo]);
}

/**
 * The viewer's avatar and the name menu it opens, and the speaker before it
 * (undefined without Web Audio). `seatName` is the name a
 * room gave them, numbered when somebody else there has theirs, so the avatar
 * matches their row.
 */
export function useViewer({ seatName }: { seatName?: string } = {}): {
  viewer: Viewer;
  viewerMenu: ViewerMenu;
  sound: SoundMenuProps | undefined;
} {
  const m = useMessages();
  const session = useSession();
  const name = seatName ?? session.name;
  const viewerMenu = useViewerMenu();
  const sound = useSoundMenu();
  return {
    viewer: {
      initials: initialsOf(name),
      tone: toneOf(name),
      label: m.shell.name.viewer(name),
    },
    viewerMenu,
    sound,
  };
}
