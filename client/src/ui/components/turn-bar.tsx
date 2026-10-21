import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
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
   * leaves the label out, so the meta has the whole first line. A short
   * window wider than that has the room, and keeps it.
   */
  labelOnPhone?: boolean;
  className?: string;
}

/**
 * Zumpo/Turn bar: sits above the canvas and carries the turn. It lays itself
 * out as the Phone variant when it is narrow, or the screen is short, as a
 * phone on its side is: one compact row of fixed height, the tag, what to do
 * and the meta over the main line, and the clock's time beside them.
 *
 * The main line never wraps: a line longer than the bar is scaled down to
 * fit it, so the bar keeps its height whatever it says, and the board under
 * it never moves.
 */
export function TurnBar({
  category,
  label,
  kind,
  main,
  meta,
  countdown,
  labelOnPhone = true,
  className,
}: TurnBarProps) {
  const m = useMessages();
  const box = useRef<HTMLDivElement>(null);
  const { phone, narrow } = usePhoneRow(box);
  const labelled = labelOnPhone || !narrow;
  return (
    <div
      ref={box}
      className={cx(styles.container, phone && styles.phone, className)}
    >
      <section
        className={cx(
          styles.bar,
          category == null && styles.untagged,
          category == null && !countdown && styles.topless,
          !labelled && styles.unlabelled,
        )}
        aria-label={m.ui.turn}
      >
        {category != null && <Tag className={styles.tag}>{category}</Tag>}
        {labelled && <span className={styles.label}>{label}</span>}
        <div className={styles.answer} aria-live="polite">
          <Fit align="start" className={styles.mainBox}>
            <span className={cx(styles.main, styles[kind])}>{main}</span>
          </Fit>
          {meta && <span className={styles.meta}>{meta}</span>}
        </div>
        {countdown && <Countdown {...countdown} className={styles.clock} />}
      </section>
    </div>
  );
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
 * it never shows the other.
 */
function usePhoneRow(box: RefObject<HTMLElement | null>): {
  phone: boolean;
  narrow: boolean;
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
  return { phone: short || asked || narrow, narrow };
}
