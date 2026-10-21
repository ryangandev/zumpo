import type { ReactNode } from 'react';
import { cx } from '../cx';
import { Avatar, type AvatarTone } from './avatar';
import { Tag } from './tag';
import styles from './chain-entry.module.css';

export type ChainEntryKind = 'prompt' | 'drawing' | 'description' | 'empty';

export interface ChainEntryProps {
  kind: ChainEntryKind;
  name: string;
  initials: string;
  tone: AvatarTone;
  /** What they did: "started the chain", "drew it", "ran out of time". */
  verb: string;
  /** The words of a prompt or a description. */
  text?: string;
  /** A drawing's picture, drawn into the white frame at the canvas's ratio. */
  drawing?: ReactNode;
  /** The Crowd favourite tag's words, on the entry with the most hearts. */
  favourite?: string;
  /** The heart button, or its count; an empty entry has none. */
  heart?: ReactNode;
  className?: string;
}

/**
 * Zumpo/Chain entry: one entry of a chain, its author's avatar beside it like
 * a line of a conversation. A prompt is a lime bubble, a description a paper
 * one, a drawing a white frame, and an empty entry only says why. It lays
 * itself out as the Phone variant when its container is narrow.
 */
export function ChainEntry({
  kind,
  name,
  initials,
  tone,
  verb,
  text,
  drawing,
  favourite,
  heart,
  className,
}: ChainEntryProps) {
  const empty = kind === 'empty';
  return (
    <div className={cx(styles.container, className)}>
      <div className={cx(styles.entry, empty && styles.empty)}>
        <Avatar initials={initials} tone={tone} />
        <div className={styles.body}>
          <div className={styles.head}>
            <p className={styles.who}>
              <span className={styles.name}>{name}</span>{' '}
              <span className={styles.verb}>{verb}</span>
              {favourite && (
                <Tag tone="peach" className={styles.favourite}>
                  {favourite}
                </Tag>
              )}
            </p>
            {!empty && heart}
          </div>
          {kind === 'drawing' ? (
            <div className={styles.drawing}>{drawing}</div>
          ) : kind === 'empty' ? null : (
            <p
              className={cx(
                styles.bubble,
                kind === 'description' && styles.description,
              )}
            >
              {text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
