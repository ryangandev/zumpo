import { useSyncExternalStore } from 'react';
import type {
  DoodleChainContent,
  DoodleChainEntry,
} from '../../../shared/wire-types';
import { ChainEntry, HeartButton, type HeartButtonProps } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { initialsOf, toneOf } from '../players/avatar';
import { Picture } from '../drawing/picture';
import { useRoomContext } from '../room/room-context';
import styles from './chain.module.css';

/** The finished drawings this page has been sent, by id. */
export function useDrawings() {
  const { drawings } = useRoomContext();
  return useSyncExternalStore(drawings.subscribe, () => drawings.snapshot());
}

/** A prompt's or a description's words; a suggestion in the viewer's language. */
export function textOf(content: DoodleChainContent, m: Messages): string {
  if (content.type === 'text') return content.text;
  if (content.type === 'suggestion') {
    return m.doodleChain.suggestions[content.suggestion] ?? '';
  }
  return '';
}

/** A drawing an entry holds, drawn from its strokes once they have come. */
export function EntryDrawing({
  drawing,
  label,
  className,
}: {
  drawing: string;
  label: string;
  className?: string;
}) {
  const strokes = useDrawings().get(drawing);
  return (
    <Picture strokes={strokes ?? []} label={label} className={className} />
  );
}

/** What the entry's author did: "drew it", or "ran out of time". */
function verbOf({ kind, content }: DoodleChainEntry, m: Messages): string {
  if (content.type !== 'empty') return m.doodleChain.verb[kind];
  return content.reason === 'left'
    ? m.doodleChain.leftTheGame
    : m.doodleChain.ranOutOfTime;
}

/**
 * A chain as a column of entries, first line first, each with its author:
 * the reveal's, as far as it has gone, and the album's.
 */
export function Chain({
  entries,
  heartOf,
  isFavourite,
  announce = false,
}: {
  entries: readonly DoodleChainEntry[];
  /** The entry's heart button or count; none for an empty entry. */
  heartOf: (entry: DoodleChainEntry) => HeartButtonProps;
  isFavourite?: (entry: DoodleChainEntry) => boolean;
  /** Reads out each entry as it is added, as the reveal shows it. */
  announce?: boolean;
}) {
  const m = useMessages();
  const last = entries.at(-1);
  return (
    <>
      {announce && (
        <p className={styles.announce} aria-live="polite">
          {last
            ? m.doodleChain.shown(
                last.author.username,
                verbOf(last, m),
                textOf(last.content, m),
              )
            : ''}
        </p>
      )}
      <ol className={styles.chain}>
        {entries.map((entry) => {
          const { author, content } = entry;
          const empty = content.type === 'empty';
          return (
            <li
              key={entry.step}
              data-play-current={announce && entry === last ? '' : undefined}
            >
              <ChainEntry
                kind={empty ? 'empty' : entry.kind}
                name={author.username}
                initials={initialsOf(author.username)}
                tone={toneOf(author.username)}
                verb={verbOf(entry, m)}
                text={textOf(content, m)}
                drawing={
                  content.type === 'drawing' ? (
                    <EntryDrawing
                      drawing={content.drawing}
                      label={m.doodleChain.drawingBy(author.username)}
                    />
                  ) : undefined
                }
                favourite={
                  isFavourite?.(entry) ? m.doodleChain.favourite : undefined
                }
                heart={empty ? undefined : <HeartButton {...heartOf(entry)} />}
              />
            </li>
          );
        })}
      </ol>
    </>
  );
}
