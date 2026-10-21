import { ButtonLink, Tag } from '../ui';
import { cx } from '../ui/cx';
import { useMessages } from '../i18n';
import { GameArtwork } from './artwork';
import { createRoomPath, soloPath, type GameInfo } from './catalog';
import { GameTags } from './game-tags';
import { useToday } from './today';
import styles from './game-intro.module.css';

/**
 * Zumpo/Game intro: the top of a game's page, what the game is and its ways
 * in. Play solo comes first where the game has it, because it starts at once;
 * Create a room follows, and the open rooms to join are listed under it. A
 * daily game started today says where it stands, and Play solo becomes
 * Continue or See today's result. Its artwork sits beside the copy, and above
 * it on a phone (Layout=Phone).
 */
export function GameIntro({
  game,
  titleId,
}: {
  game: GameInfo;
  /** The name's id, for the page section it names. */
  titleId?: string;
}) {
  const m = useMessages();
  const text = m.games.of[game.type];
  const today = useToday(game.type);
  return (
    <div className={styles.container}>
      <section
        className={cx(styles.intro, styles[game.tone])}
        aria-labelledby={titleId}
      >
        <GameArtwork type={game.type} size="tile" className={styles.art} />
        <div className={styles.copy}>
          <div className={styles.heading}>
            <Tag tone="paper" className={styles.kind}>
              {m.games.kinds[game.kind].name}
            </Tag>
            <h1 id={titleId} className={styles.name}>
              {text.name}
            </h1>
            <p className={styles.tagline}>{text.tagline}</p>
          </div>
          <GameTags game={game} today={today} streak />
          <div className={styles.actions}>
            {game.solo && (
              <ButtonLink to={soloPath(game.type)}>
                {today?.state === 'playing'
                  ? m.games.today.continue
                  : today?.state === 'done'
                    ? m.games.today.seeResult
                    : m.games.playSolo}
              </ButtonLink>
            )}
            <ButtonLink
              to={createRoomPath(game.type)}
              variant={game.solo ? 'secondary' : 'primary'}
            >
              {m.lobby.createRoom}
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
