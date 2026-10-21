import { Link } from 'react-router';
import { Tag, type TagProps } from '../ui';
import { useMessages } from '../i18n';
import { soloPath, type GameInfo } from './catalog';
import type { DailyToday } from './today';
import styles from './game-tags.module.css';

/**
 * Who can play a game, as paper tags: Solo when it has a game on your own,
 * then its player count. The card and the intro both carry them. A daily
 * game started today says where it stands in Solo's place: the guess it is
 * on, or done, with the streak where there is room (`streak`). On a card,
 * Solo is a link straight to the game on your own (`soloLink`). With an `id`,
 * the tags are `${id}-solo` and `${id}-players`, for a control that is
 * described by them.
 */
export function GameTags({
  game,
  id,
  today = null,
  soloLink = false,
  streak = false,
}: {
  game: GameInfo;
  id?: string;
  today?: DailyToday | null;
  soloLink?: boolean;
  streak?: boolean;
}) {
  const m = useMessages();
  const solo: Omit<TagProps, 'id'> =
    today?.state === 'playing'
      ? { tone: 'ink', children: m.games.today.guess(today.guess, today.of) }
      : today?.state === 'done'
        ? {
            tone: 'lime',
            icon: 'check',
            children:
              streak && today.streak > 1
                ? m.games.today.doneStreak(today.streak)
                : m.games.today.done,
          }
        : { tone: 'paper', children: m.games.solo };
  const soloId = id && `${id}-solo`;
  return (
    <span className={styles.tags}>
      {game.solo &&
        (soloLink ? (
          <Link
            to={soloPath(game.type)}
            className={styles.link}
            aria-describedby={id}
          >
            <Tag {...solo} id={soloId} />
          </Link>
        ) : (
          <Tag {...solo} id={soloId} />
        ))}
      <Tag tone="paper" id={id && `${id}-players`}>
        {m.games.of[game.type].facts}
      </Tag>
    </span>
  );
}

/** The ids `GameTags` gives its tags, in reading order. */
export function gameTagIds(game: GameInfo, id: string): string[] {
  return [...(game.solo ? [`${id}-solo`] : []), `${id}-players`];
}
