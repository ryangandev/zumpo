import { useMessages } from '../../i18n';
import type { CSSProperties } from 'react';
import { cx } from '../cx';
import styles from './die.module.css';

export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Default: a die as rolled. Wild is a one, which counts as any face bid: in
 * your own cup while bidding, and in a reveal. In a reveal, Counted matches
 * the bid and Dim does not count.
 */
export type DieState = 'default' | 'counted' | 'wild' | 'dim';

export interface DieProps {
  /** A face, a die in somebody else's cup (hidden), or one already lost (empty). */
  face: DieFace | 'hidden' | 'empty';
  state?: DieState;
  /** Regular is 56 px, Compact 32 px. */
  size?: 'regular' | 'compact';
  /** Overrides the accessible name; null makes the die decorative. */
  label?: string | null;
  className?: string;
}

/** Where each face's pips sit on a 3 × 3 grid: [column, row]. */
const PIPS: Record<DieFace, readonly (readonly [number, number])[]> = {
  1: [[1, 1]],
  2: [
    [2, 0],
    [0, 2],
  ],
  3: [
    [2, 0],
    [1, 1],
    [0, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 1],
    [0, 2],
    [2, 0],
    [2, 1],
    [2, 2],
  ],
};

/** Zumpo/Die: one die, its pips drawn on a 3 × 3 grid. */
export function Die({
  face,
  state = 'default',
  size = 'regular',
  label,
  className,
}: DieProps) {
  const m = useMessages();
  const pips = typeof face === 'number' ? PIPS[face] : [];
  const name =
    label === undefined
      ? face === 'hidden'
        ? m.ui.dice.hidden
        : face === 'empty'
          ? m.ui.dice.lost
          : state === 'wild'
            ? m.ui.dice.wild(face)
            : state === 'counted'
              ? m.ui.dice.counts(face)
              : String(face)
      : label;
  return (
    <span
      className={cx(
        styles.die,
        size === 'compact' && styles.compact,
        typeof face === 'number' ? styles[state] : styles[face],
        className,
      )}
      role={name === null ? undefined : 'img'}
      aria-label={name ?? undefined}
      aria-hidden={name === null ? true : undefined}
    >
      {pips.map(([column, row]) => (
        <span
          key={`${column}${row}`}
          className={styles.pip}
          style={{ '--column': column, '--row': row } as CSSProperties}
        />
      ))}
    </span>
  );
}
