import { GameList } from '../games/game-list';
import { HeroArt } from '../games/hero-art';
import { useMessages } from '../i18n';
import { Page } from '../shell/page';
import { PageHeading } from '../shell/page-heading';
import { PHONE, SHORT_SCREEN, useMediaQuery } from '../shell/use-media-query';
import styles from './home.module.css';

/**
 * P01 and MO01: the front door, and the one page that lists every game, so a
 * game is one click from arriving.
 */
export default function HomePage() {
  const m = useMessages();
  // A phone keeps shorter copy, so the games show sooner, and so does a
  // phone on its side.
  const phone = useMediaQuery(PHONE);
  const short = useMediaQuery(SHORT_SCREEN);
  const compact = phone || short;
  return (
    <Page>
      <div className={styles.hero}>
        <PageHeading
          eyebrow={compact ? m.home.eyebrowPhone : m.home.eyebrow}
          title={m.home.title}
          subtitle={compact ? m.home.subtitlePhone : m.home.subtitle}
          hero
        />
        {!phone && <HeroArt className={styles.art} />}
      </div>
      <GameList />
    </Page>
  );
}
