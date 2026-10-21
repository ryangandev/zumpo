import { useMessages } from '../../i18n';
import { Fit } from '../../shell/fit';
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
  className?: string;
}

/**
 * Zumpo/Turn bar: sits above the canvas and carries the turn. It lays itself
 * out as the Phone variant when its container is narrow: one compact row of
 * fixed height, the tag, what to do and the meta over the main line, and the
 * clock's time beside them.
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
  className,
}: TurnBarProps) {
  const m = useMessages();
  return (
    <div className={cx(styles.container, className)}>
      <section
        className={cx(
          styles.bar,
          category == null && styles.untagged,
          category == null && !countdown && styles.topless,
        )}
        aria-label={m.ui.turn}
      >
        {category != null && <Tag className={styles.tag}>{category}</Tag>}
        <span className={styles.label}>{label}</span>
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
