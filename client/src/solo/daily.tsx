import type { CSSProperties } from 'react';
import { Button } from '../ui';
import { cx } from '../ui/cx';
import { SwapLabel } from '../shell/swap-label';
import { useCopy } from '../shell/use-copy';
import styles from './daily.module.css';

/**
 * The parts of a daily puzzle on your own that Daily Word and Code Breaker
 * share: the wait for the next one, the guesses it took, and a result to
 * copy.
 */

const two = (n: number) => String(n).padStart(2, '0');

/** "9:41:18": the time to the next puzzle. */
export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${two(minutes)}:${two(seconds % 60)}`;
}

/**
 * How many daily puzzles were solved in each number of guesses, one bar a
 * bucket, today's in green (DW04, DW05, CB06).
 */
export function Distribution({
  bars,
  today,
}: {
  bars: readonly {
    /** "6", or "1–4" for a bar of several. */
    guesses: string;
    count: number;
    /** "3 found in 6", for a screen reader. */
    label: string;
  }[];
  /** Today's bar, when it was solved; none is picked out otherwise. */
  today: number | null;
}) {
  const most = Math.max(1, ...bars.map((bar) => bar.count));
  return (
    <ol className={styles.list}>
      {bars.map((bar, index) => (
        <li key={index} className={styles.row}>
          <span className={styles.guesses} aria-hidden="true">
            {bar.guesses}
          </span>
          <span
            className={cx(styles.bar, today === index && styles.today)}
            style={{ '--share': bar.count / most } as CSSProperties}
            aria-label={bar.label}
          >
            <span aria-hidden="true">{bar.count}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Copies a result to paste anywhere, and says so for a moment. */
export function CopyButton({
  text,
  label,
  copiedLabel,
  icon,
  primary = false,
  className,
}: {
  text: string;
  label: string;
  /** "Copied", for a moment after. */
  copiedLabel: string;
  icon: 'copy' | 'link';
  primary?: boolean;
  className?: string;
}) {
  const { copied, copy } = useCopy(text);
  return (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      icon={copied ? 'check' : icon}
      onClick={copy}
      className={className}
    >
      <SwapLabel second={copied} labels={[label, copiedLabel]} />
    </Button>
  );
}
