import type { ReactNode } from 'react';
import { useMessages, type Messages } from '../i18n';
import { counts, WILD, type Bid as BidOf } from '../../../shared/liars-dice';
import type { LiarsDiceReveal } from '../../../shared/wire-types';
import {
  Bid,
  Cup,
  Die,
  type CupProps,
  type CupState,
  type DieFace,
  type DieProps,
} from '../ui';
import { initialsOf, toneOf } from '../players/avatar';
import { cx } from '../ui/cx';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { countDetail, diceWord, verdict, type Naming } from './words';
import styles from './table.module.css';

/** One player at the table, as a room's snapshot or a game on your own has them. */
export interface TableSeat {
  id: string;
  name: string;
  diceLeft: number;
  /** This round's dice when the viewer may see them; null when hidden. */
  dice: readonly number[] | null;
  outInRound: number | null;
}

export interface TableProps {
  /** Everybody, in turn order; the viewer among them. */
  seats: readonly TableSeat[];
  /** The round, whose start rolls everybody's dice; none for a last call kept under results. */
  round?: number;
  youId: string;
  dicePerPlayer: number;
  /** Whose turn it is, and whose comes next; null outside bidding. */
  turnId: string | null;
  nextId: string | null;
  /** This round's bids, first first. */
  bids: readonly (BidOf & { playerId: string })[];
  /** A call being shown, or the last one of a finished game. */
  reveal: LiarsDiceReveal | null;
  who: Naming;
  /** "The count", or "The last call" under a game's results. */
  countLabel?: string;
  /** Beside your cup: the bid picker, a note, Next round. */
  beside?: ReactNode;
}

/** How each of a cup's dice shows, with a slot for every die it started with. */
function diceOf(
  seat: TableSeat,
  dicePerPlayer: number,
  reveal: LiarsDiceReveal | null,
): Pick<DieProps, 'face' | 'state'>[] {
  const shown: Pick<DieProps, 'face' | 'state'>[] = seat.dice
    ? seat.dice.map((face) => ({
        face: face as DieFace,
        // While bidding, a one in your cup shows as wild, as it counts for
        // whatever face is bid.
        state: !reveal
          ? face === WILD
            ? 'wild'
            : 'default'
          : counts(face, reveal.bid.face)
            ? face === reveal.bid.face
              ? 'counted'
              : 'wild'
            : 'dim',
      }))
    : Array.from({ length: seat.diceLeft }, () => ({ face: 'hidden' }));
  const empty = Math.max(0, dicePerPlayer - shown.length);
  return [
    ...shown,
    ...Array.from({ length: empty }, () => ({ face: 'empty' as const })),
  ];
}

/** What a cup says under its name, and how it is marked. */
function cupLine(
  seat: TableSeat,
  props: TableProps,
  m: Messages,
): { detail: string; state: CupState } {
  const { reveal, turnId, nextId, youId } = props;
  const you = seat.id === youId;
  if (reveal) {
    if (seat.id === reveal.loserId) {
      return {
        detail: reveal.out ? m.liarsDice.out : m.liarsDice.lostDie,
        state: 'lost',
      };
    }
    if (seat.id === reveal.callerId) {
      return { detail: m.liarsDice.calledLiar, state: 'default' };
    }
    if (seat.id === reveal.bid.playerId) {
      return {
        detail: m.liarsDice.bidLabel(reveal.bid),
        state: 'default',
      };
    }
  }
  if (seat.diceLeft === 0) {
    return {
      detail:
        seat.outInRound === null
          ? m.liarsDice.out
          : m.liarsDice.outRound(seat.outInRound),
      state: 'default',
    };
  }
  if (seat.id === turnId) {
    return {
      detail: you ? m.liarsDice.yourTurn : m.liarsDice.deciding,
      state: 'turn',
    };
  }
  if (you && seat.id === nextId)
    return { detail: m.liarsDice.youNext, state: 'default' };
  return { detail: diceWord(seat.diceLeft, m), state: 'default' };
}

function cupProps(
  seat: TableSeat,
  props: TableProps,
  size: CupProps['size'],
  m: Messages,
): CupProps {
  const line = cupLine(seat, props, m);
  return {
    name: seat.name,
    initials: initialsOf(seat.name),
    tone: toneOf(seat.name),
    you: seat.id === props.youId,
    size,
    dice: diceOf(seat, props.dicePerPlayer, props.reveal),
    roll: props.round,
    ...line,
  };
}

/**
 * LD02-LD04, LD08-LD12: the table. Everybody else's cups, then this round's
 * bids or what a call found, then your own cup with what you can do beside it.
 * A player out of dice leaves the table, unless a call has just put them out.
 */
export function Table(props: TableProps) {
  const m = useMessages();
  const {
    seats,
    youId,
    bids,
    reveal,
    who,
    countLabel = m.liarsDice.count,
    beside,
  } = props;
  const others = seats.filter(
    (seat) =>
      seat.id !== youId && (seat.diceLeft > 0 || seat.id === reveal?.loserId),
  );
  const you = seats.find((seat) => seat.id === youId);
  const phone = useMediaQuery(PHONE);
  // A phone's row has room for a player and three dice whatever the cup
  // says, but not for five, so five-dice cups keep their dice underneath.
  const fiveDice = props.dicePerPlayer > 3;
  return (
    <div className={styles.table}>
      {others.length > 0 && (
        <div className={cx(styles.others, fiveDice && styles.fiveDice)}>
          {others.map((seat) => (
            <Cup
              key={seat.id}
              layout={phone && !fiveDice ? 'row' : 'stack'}
              {...cupProps(seat, props, 'compact', m)}
            />
          ))}
        </div>
      )}
      {reveal ? (
        <CountLine reveal={reveal} who={who} label={countLabel} />
      ) : (
        bids.length > 0 && (
          <section className={styles.bids} aria-labelledby="ld-bids">
            <h3 id="ld-bids" className={styles.label}>
              {m.liarsDice.bidsRound}
            </h3>
            <ol className={styles.bidList}>
              {bids.map((bid, index) => (
                <li key={index}>
                  <Bid
                    name={
                      who(bid.playerId).you
                        ? m.liarsDice.youLabel
                        : who(bid.playerId).name
                    }
                    count={bid.count}
                    face={bid.face as DieFace}
                    latest={index === bids.length - 1}
                  />
                </li>
              ))}
            </ol>
          </section>
        )
      )}
      {you && (
        <div className={styles.yours}>
          <Cup {...cupProps(you, props, 'regular', m)} />
          {beside}
        </div>
      )}
    </div>
  );
}

/** "5 × ⚄ incl. 2 wild ones · bid was five → Leo’s bid stands". */
export function CountLine({
  reveal,
  who,
  label,
}: {
  reveal: LiarsDiceReveal;
  who: Naming;
  label: string;
}) {
  const m = useMessages();
  return (
    <section className={styles.count} aria-labelledby="ld-count">
      <h3 id="ld-count" className={styles.label}>
        {label}
      </h3>
      <p className={styles.countLine}>
        <span className={styles.matched}>{reveal.matched} ×</span>
        <Die
          face={reveal.bid.face as DieFace}
          state="counted"
          label={m.liarsDice.face(reveal.bid.face)}
        />
        <span className={styles.detail}>{countDetail(reveal, m)}</span>
        <span className={styles.outcome}>
          <span className={styles.detail} aria-hidden="true">
            →
          </span>
          <span className={styles.verdict}>{verdict(reveal, who, m)}</span>
        </span>
      </p>
    </section>
  );
}
