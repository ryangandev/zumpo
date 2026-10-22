import { useMessages } from '../i18n';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { HushDiscard, HushPlay } from '../../../shared/wire-types';
import { HushCard, Lives } from '../ui';
import { cx } from '../ui/cx';
import { Fit } from '../shell/fit';
import { useFitHeight } from '../shell/fit-height';
import { PlayBoard, playColumn } from '../shell/play-board';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import styles from './table.module.css';

/**
 * The paper panel a level is played on, and the last pile is left on. In
 * play, `fitHeight` keeps it inside a short window beside the side column,
 * such as a 1280 × 720 laptop's, so Play is in view without scrolling,
 * measured again when the turn bar right over it (its previous sibling)
 * takes a line for its hints.
 */
export function TablePanel({
  children,
  fitHeight = false,
}: {
  children: ReactNode;
  fitHeight?: boolean;
}) {
  const ref = useFitHeight<HTMLDivElement>(fitHeight && 'room');
  return (
    <div ref={ref} className={cx(styles.panel, playColumn)}>
      {children}
    </div>
  );
}

/**
 * "Level 3 · 3 cards each", or "The pile · 8 cards to go", and the lives. On
 * a phone the note is a line of its own and the hearts go without their
 * words, so the head is the same two lines in every phase.
 */
export function TableHead({
  title,
  note,
  lives,
}: {
  title: string;
  note?: string;
  lives: number;
}) {
  const phone = useMediaQuery(PHONE);
  return (
    <div className={styles.head}>
      <p className={styles.titleGroup}>
        <span className={styles.title}>{title}</span>
        {note && <span className={styles.note}>{note}</span>}
      </p>
      <Lives lives={lives} showLabel={!phone} />
    </div>
  );
}

/**
 * The pile: its top card large, and every card below it, played or
 * discarded, lowest first, beside it. Before the first play, a place for it.
 *
 * In play the pile is as tall as the top card whatever lies under it, so
 * nothing moves as it grows: the cards under the top one fold into the room
 * beside it, the newest in view, the older ones a scroll away. A phone gives
 * the pile the room left above your hand, scaled to fit.
 */
export function Pile({
  pile,
  discards,
  empty,
  inPlay = true,
}: {
  pile: readonly HushPlay[];
  discards: readonly HushDiscard[];
  /** What the empty place says. */
  empty: string;
  /** False for the last pile left under a game's results. */
  inPlay?: boolean;
}) {
  const m = useMessages();
  const trail = useRef<HTMLOListElement>(null);
  const top = pile.at(-1);
  const under = [
    ...pile.slice(0, -1).map(({ card }) => ({ card, discarded: false })),
    ...discards.map(({ card }) => ({ card, discarded: true })),
  ].toSorted((a, b) => a.card - b.card);

  // Folded, the trail shows its newest cards, the ones just under the top,
  // and while it scrolls a keyboard can reach it to scroll it.
  const count = under.length;
  const [folded, setFolded] = useState(false);
  useLayoutEffect(() => {
    const list = trail.current;
    if (!list || count === 0) return;
    list.scrollTop = list.scrollHeight;
    const measure = () => setFolded(list.scrollHeight > list.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [count]);

  const pileOf = (
    <section
      className={cx(styles.pile, inPlay && styles.live)}
      aria-label={m.hush.pile}
    >
      {top ? (
        <HushCard value={top.card} state="pile" size="large" />
      ) : (
        <p className={styles.empty}>
          <span className={styles.emptyText}>{empty}</span>
        </p>
      )}
      {count > 0 && (
        <ol
          ref={trail}
          className={styles.trail}
          aria-label={m.hush.underTop}
          tabIndex={inPlay && folded ? 0 : undefined}
        >
          {under.map(({ card, discarded }) => (
            <li key={card}>
              <HushCard
                value={card}
                state={discarded ? 'discarded' : 'played'}
                size="small"
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
  // The trail wraps across the width, so the pile is scaled to the height.
  return inPlay ? (
    <PlayBoard fitWidth={false} min={0.3} className={styles.board}>
      {pileOf}
    </PlayBoard>
  ) : (
    pileOf
  );
}

/**
 * The viewer's side of the table: their cards or a message, and what they
 * can do, or what happens next.
 *
 * The cards are one row, scaled down to the width when a level deals more
 * than fit, Small on a phone, and the cards or the message take the same
 * room in every phase, so the pile above keeps its place.
 */
export function HandRow({
  label,
  cards,
  dealt = cards?.length ?? 0,
  message,
  action,
  held = false,
  status,
}: {
  label: string;
  /** Lowest first; the first is the next to play. */
  cards?: readonly number[];
  /**
   * How many cards the level dealt: the row keeps the room of
   * those already played, so its scale holds for the whole level.
   */
  dealt?: number;
  message?: string;
  /** The one button, when there is something to do. */
  action?: ReactNode;
  /**
   * The button keeps its room out of sight while it cannot be pressed, so
   * it is where it was when it can again, and nothing around it moves.
   */
  held?: boolean;
  status?: string;
}) {
  const phone = useMediaQuery(PHONE);
  const played = Math.max(0, dealt - (cards?.length ?? 0));
  return (
    <div className={styles.handRow}>
      <section className={styles.hand} aria-label={label}>
        <h2 className={styles.label}>{label}</h2>
        <div className={styles.slot}>
          {cards && cards.length > 0 && (
            <Fit align="start">
              <ol className={styles.cards}>
                {cards.map((card, index) => (
                  <li key={card}>
                    <HushCard
                      value={card}
                      state={index === 0 ? 'next' : 'hand'}
                      size={phone ? 'small' : 'regular'}
                    />
                  </li>
                ))}
                {Array.from({ length: played }, (_, index) => (
                  <li key={`gone-${index}`} className={styles.gone} aria-hidden>
                    <HushCard value={0} size={phone ? 'small' : 'regular'} />
                  </li>
                ))}
              </ol>
            </Fit>
          )}
          {message && <p className={styles.message}>{message}</p>}
        </div>
      </section>
      {(action || status) && (
        <div className={styles.action}>
          {held ? (
            <div className={styles.held} aria-hidden>
              {action}
            </div>
          ) : (
            action
          )}
          {action ? (
            // Under a button the line keeps its room when it says nothing.
            <p
              className={cx(styles.smallStatus, !status && styles.held)}
              aria-hidden={!status || undefined}
            >
              {status ?? '\u00a0'}
            </p>
          ) : (
            <p className={styles.status}>{status}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Divider() {
  return <hr className={styles.divider} />;
}
