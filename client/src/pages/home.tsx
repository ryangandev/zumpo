import { GameList } from '../games/game-list';
import { HeroArt } from '../games/hero-art';
import { useMessages } from '../i18n';
import { Page } from '../shell/page';
import { PageHeading } from '../shell/page-heading';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import styles from './home.module.css';

/**
 * P01 and MO01: the front door, and the one page that lists every game, so a
 * game is one click from arriving.
 */
export default function HomePage() {
  const m = useMessages();
  // A phone keeps shorter copy, so the games show sooner.
  const phone = useMediaQuery(PHONE);
  return (
    <Page>
      <div className={styles.hero}>
        <PageHeading
          eyebrow={phone ? m.home.eyebrowPhone : m.home.eyebrow}
          title={m.home.title}
          subtitle={phone ? m.home.subtitlePhone : m.home.subtitle}
          hero
        />
        {!phone && <HeroArt className={styles.art} />}
      </div>
      <GameList />
    </Page>
  );
}
