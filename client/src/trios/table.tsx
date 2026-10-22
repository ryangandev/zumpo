import type { ReactNode } from 'react';
import { useMessages } from '../i18n';
import { TriosCard, type TriosCardState } from '../ui';
import { cx } from '../ui/cx';
import { useFitHeight, type FitHeight } from '../shell/fit-height';
import { PlayBoard, playColumn } from '../shell/play-board';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import styles from './table.module.css';

/** What one place on the table shows, beyond its card. */
export interface PlaceView {
  state?: TriosCardState;
  /** "Hint", or the initials of who found it. */
  badge?: string;
  /** The badge's meaning, for the card's accessible name. */
  badgeLabel?: string;
}

export interface TriosTableProps {
  /** The twelve cards in their places, row by row. */
  cards: readonly number[];
  /** Each place's state and badge, by place. */
  places?: Readonly<Record<number, PlaceView>>;
  /** Set while cards may be picked: picks or puts back the card at a place. */
  onPick?: (place: number) => void;
  /**
   * The table being played, which a phone fits into its one screen with the
   * turn bar; false for a finished table under its results.
   */
  inPlay?: boolean;
}

/**
 * The twelve cards: four columns of three on a desktop, three columns of four
 * compact cards on a phone, in the same order, so nothing moves while you
 * look. Where neither fits, the table scales down to the width it has.
 */
export function TriosTable({
  cards,
  places = {},
  onPick,
  inPlay = true,
}: TriosTableProps) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  return (
    <PlayBoard inPlay={inPlay}>
      <div className={styles.table} role="group" aria-label={m.trios.table}>
        {cards.map((card, place) => (
          <TriosCard
            key={place}
            card={card}
            size={phone ? 'compact' : 'regular'}
            {...places[place]}
            onPick={onPick ? () => onPick(place) : undefined}
          />
        ))}
      </div>
    </PlayBoard>
  );
}

/**
 * The paper panel the table sits on; bare on a phone. `fitHeight` keeps the
 * table inside the window, on your own or in a room (useFitHeight).
 */
export function TablePanel({
  children,
  fitHeight = false,
}: {
  children: ReactNode;
  fitHeight?: FitHeight;
}) {
  const ref = useFitHeight<HTMLDivElement>(fitHeight);
  return (
    <div ref={ref} className={cx(styles.panel, playColumn)}>
      {children}
    </div>
  );
}

/** A trio in a line of mini cards: the last one taken, or one of a run. */
export function MiniTrio({ cards }: { cards: readonly number[] }) {
  return (
    <span className={styles.mini}>
      {cards.map((card) => (
        <TriosCard key={card} card={card} size="mini" />
      ))}
    </span>
  );
}

/**
 * TS05-TS09: the latest trio taken, so a player who looked away sees it.
 * Before the first, its line is kept empty, so the table never moves.
 */
export function LastTrio({
  trio,
}: {
  trio: { finder: string; cards: readonly number[] } | null;
}) {
  const m = useMessages();
  return (
    <div
      className={cx(styles.lastTrio, !trio && styles.held)}
      aria-hidden={trio ? undefined : true}
    >
      <span className={styles.lastLabel}>
        {m.trios.lastTrio(trio?.finder ?? '')}
      </span>
      <MiniTrio cards={trio?.cards ?? [0, 1, 2]} />
    </div>
  );
}

/**
 * The row under the table, for Hint. Hidden, it keeps its height, so the
 * table panel does not change size when Hint is no longer offered.
 */
export function TableTools({
  hidden = false,
  children,
}: {
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(styles.tools, hidden && styles.held)}
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      {children}
    </div>
  );
}
