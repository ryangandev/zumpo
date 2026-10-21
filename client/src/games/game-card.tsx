import { Link } from 'react-router';
import { Icon } from '../ui';
import { cx } from '../ui/cx';
import { useMessages } from '../i18n';
import { GameArtwork } from './artwork';
import { gamePath, type GameInfo } from './catalog';
import { GameTags, gameTagIds } from './game-tags';
import { useToday } from './today';
import styles from './game-card.module.css';

/**
 * Zumpo/Game card: a game on the home page, what it is and who can play it,
 * the whole card a link to the game's page, where you pick how to play it,
 * but for Solo, a link of its own straight to the game on your own. A tile
 * sits four across on a desktop; a row lists it on a phone, with the game's
 * signature piece as its icon.
 */
export function GameCard({
  game,
  layout,
}: {
  game: GameInfo;
  layout: 'tile' | 'row';
}) {
  const text = useMessages().games.of[game.type];
  const today = useToday(game.type);
  const id = `game-${game.type}`;
  const facts = <GameTags game={game} id={id} today={today} soloLink />;
  const copy = (
    <div className={styles.copy}>
      <h3 className={styles.name}>
        {/* The name is the card's link, stretched over the whole card; the
            tagline and tags describe it, so a screen reader does not read
            the whole card as one name. */}
        <Link
          to={gamePath(game.type)}
          id={id}
          className={styles.link}
          aria-describedby={[`${id}-tagline`, ...gameTagIds(game, id)].join(
            ' ',
          )}
        >
          {text.name}
        </Link>
      </h3>
      <p id={`${id}-tagline`} className={styles.tagline}>
        {(layout === 'row' && text.rowTagline) || text.tagline}
      </p>
      {layout === 'row' && facts}
    </div>
  );
  return (
    <div className={cx(styles.card, styles[layout], styles[game.tone])}>
      {layout === 'tile' ? (
        <>
          <GameArtwork type={game.type} size="tile" />
          {copy}
          <div className={styles.footer}>
            {facts}
            <span className={styles.go} aria-hidden="true">
              <Icon glyph="forward" size={20} />
            </span>
          </div>
        </>
      ) : (
        <div className={styles.top}>
          <GameArtwork type={game.type} size="icon" />
          {copy}
          <span className={styles.arrow} aria-hidden="true">
            <Icon glyph="forward" size={20} />
          </span>
        </div>
      )}
    </div>
  );
}
