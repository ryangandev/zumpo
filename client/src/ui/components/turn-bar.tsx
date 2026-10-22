import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from 'react';
import { useMessages } from '../../i18n';
import { Fit } from '../../shell/fit';
import { SHORT_SCREEN, useMediaQuery } from '../../shell/use-media-query';
import { cx } from '../cx';
import { Countdown, type CountdownProps } from './countdown';
import { Tag } from './tag';
import styles from './turn-bar.module.css';

export type TurnBarKind = 'word' | 'hint' | 'status';

export interface TurnBarProps {
  /** The game's category or board, as a tag; a game on your own has none. */
  category?: string;
  /** What to do: "Draw the word", "Guess the word". */
  label: string;
  /**
   * Word: the drawer sees the word. Hint: guessers see the server's hint
   * string as is. Status: anything else (choosing, the reveal).
   */
  kind: TurnBarKind;
  main: string;
  /** Beside the main line, such as the letter count. */
  meta?: string;
  /** Hidden while nothing is timed, such as everyone locked in before a reveal. */
  countdown?: CountdownProps;
  /**
   * False where the page already names what the label says, such as a game
   * on your own under its room bar: on a phone's width the Phone variant
   * says the label to a screen reader only, so the meta has the whole first
   * line. A short window wider than that has the room, and shows it.
   */
  labelOnPhone?: boolean;
  /**
   * False for a game whose words fit the phone's one first line, such as
   * Gomoku: at a phone's width the bar keeps the compact row rather than
   * give the meta a line of its own, and the board has that height.
   */
  stackOnPhone?: boolean;
  /** The bar's region, for a page that hands it the focus. */
  ref?: Ref<HTMLElement>;
  className?: string;
}

/**
 * Zumpo/Turn bar: sits above the canvas and carries the turn. It lays itself
 * out as the Phone variant when it is narrow, or the screen is short, as a
 * phone on its side is: a compact bar, what to do over the main line and the
 * clock's time beside them. On a short screen the tag, the label and the
 * meta share the first line, wrapping where they are too long for it
 * together; at a phone's width the tag and the meta have a line of their
 * own under the main line, where the meta wraps rather than being cut, since
 * it is often the only instruction on screen.
 *
 * The main line never wraps: a line longer than the bar is scaled down to
 * fit it, as a label a little too long for its phone line is, so the bar
 * keeps its height whatever it says, and the board under it never moves.
 */
export function TurnBar({
  category,
  label,
  kind,
  main,
  meta,
  countdown,
  labelOnPhone = true,
  stackOnPhone = true,
  ref,
  className,
}: TurnBarProps) {
  const m = useMessages();
  const box = useRef<HTMLDivElement>(null);
  const { phone, narrow, stacked: stackable } = usePhoneRow(box);
  const stacked = stackable && stackOnPhone;
  const labelled = labelOnPhone || !narrow;
  const labelRef = useRef<HTMLSpanElement>(null);
  useOneLine(labelRef, stacked && labelled, label);
  return (
    <div
      ref={box}
      className={cx(
        styles.container,
        phone && styles.phone,
        stacked && styles.narrow,
        stackable && !stackOnPhone && styles.oneRow,
        className,
      )}
    >
      <section
        ref={ref}
        className={cx(
          styles.bar,
          category == null && styles.untagged,
          category == null && !countdown && styles.topless,
          !labelled && styles.unlabelled,
        )}
        aria-label={m.ui.turn}
        // Where a game starts with no control for the viewer, the focus
        // waits here, on what is happening (useStartFocus).
        tabIndex={-1}
        data-start-fallback
      >
        {category != null && <Tag className={styles.tag}>{category}</Tag>}
        <span ref={labelRef} className={styles.label}>
          {label}
        </span>
        <div className={styles.answer} aria-live="polite">
          <Fit align="start" className={styles.mainBox}>
            <span className={cx(styles.main, styles[kind])}>{main}</span>
          </Fit>
          {/* At a phone's width the meta's line is kept while it is empty. */}
          {(meta || (stacked && labelled)) && (
            <span className={styles.meta}>{meta}</span>
          )}
        </div>
        {countdown && <Countdown {...countdown} className={styles.clock} />}
      </section>
    </div>
  );
}

/**
 * Below this, a label scaled to one line is too small to read, and it wraps
 * instead.
 */
const SMALLEST_LABEL = 0.8;

/**
 * Keeps what to do on one line at a phone's width, so the bar keeps its
 * height as the label changes: a label a little too long is scaled down to
 * the line, as the main line is; one much too long wraps rather than shrink
 * past reading, or be cut.
 */
function useOneLine(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  text: string,
) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reset = () => {
      element.style.removeProperty('transform');
      element.removeAttribute('data-wrap');
    };
    // Measured again for each new label; an empty one has nothing to fit.
    if (!enabled || !text) {
      reset();
      return;
    }
    let width = -1;
    const fit = () => {
      const given = element.clientWidth;
      // Wrapping changes the label's height, not its width: only a new width
      // asks again.
      if (given === width) return;
      width = given;
      reset();
      const needed = element.scrollWidth;
      if (given <= 0 || needed <= given) return;
      const scale = given / needed;
      if (scale >= SMALLEST_LABEL) {
        element.style.setProperty('transform', `scale(${scale})`);
      } else {
        element.setAttribute('data-wrap', '');
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    // The font may come after the first measure, and change what it needs.
    let live = true;
    void document.fonts?.ready.then(() => {
      if (!live) return;
      width = -1;
      fit();
    });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [ref, enabled, text]);
}

/**
 * True where the page asks every turn bar in it for the compact phone row,
 * as a game on your own does on a short window, to leave its board more of
 * the height.
 */
export const CompactTurnBar = createContext(false);

/** The widest a turn bar is in its Phone variant, as Figma draws it. */
const PHONE_WIDTH = 560;

/**
 * Whether the bar takes its phone row: 560 px wide or less, on a short
 * screen, or where the page asks for it. Measured before the first paint, so
 * it never shows the other. Stacked, with the meta on a line of its own, at
 * a phone's width where the height can spare it: not on a short screen, as
 * a phone on its side, where the bar sits beside the board.
 */
function usePhoneRow(box: RefObject<HTMLElement | null>): {
  phone: boolean;
  narrow: boolean;
  stacked: boolean;
} {
  const short = useMediaQuery(SHORT_SCREEN);
  const asked = useContext(CompactTurnBar);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      setNarrow(width > 0 && width <= PHONE_WIDTH);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box]);
  return {
    phone: short || asked || narrow,
    narrow,
    stacked: narrow && !short && !asked,
  };
}
