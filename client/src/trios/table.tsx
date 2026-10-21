import type { ReactNode } from 'react';
import { useMessages } from '../i18n';
import {
  TriosCard,
  TurnBar,
  type TriosCardState,
  type TurnBarProps,
} from '../ui';
import { cx } from '../ui/cx';
import { Fit } from '../shell/fit';
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
}

/**
 * The twelve cards: four columns of three on a desktop, three columns of four
 * compact cards on a phone, in the same order, so nothing moves while you
 * look. Where neither fits, the table scales down to the width it has.
 */
export function TriosTable({ cards, places = {}, onPick }: TriosTableProps) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  return (
    <Fit>
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
    </Fit>
  );
}

/**
 * The turn bar over the table. On a narrow screen it stacks its lines, so one
 * that wraps would push the table down, and a tap meant for one card would
 * land on another. It keeps room for `lines` lines of what it says, the most
 * any phase needs, and a clock in every phase keeps its top row.
 */
export function TriosTurnBar({
  lines,
  ...props
}: TurnBarProps & { lines: 1 | 2 }) {
  return (
    <TurnBar
      {...props}
      className={cx(styles.turnBar, lines === 2 && styles.twoLines)}
    />
  );
}

/** The paper panel the table sits on; bare on a phone. */
export function TablePanel({ children }: { children: ReactNode }) {
  return <div className={styles.panel}>{children}</div>;
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

/** TS05-TS09: the latest trio taken, so a player who looked away sees it. */
export function LastTrio({
  finder,
  cards,
}: {
  finder: string;
  cards: readonly number[];
}) {
  const m = useMessages();
  return (
    <div className={styles.lastTrio}>
      <span className={styles.lastLabel}>{m.trios.lastTrio(finder)}</span>
      <MiniTrio cards={cards} />
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
      className={cx(styles.tools, hidden && styles.hiddenTools)}
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      {children}
    </div>
  );
}
