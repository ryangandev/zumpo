import { useId } from 'react';
import { HEART } from '../generated/heart';
import { useMessages } from '../../i18n';
import { cx } from '../cx';
import styles from './heart-button.module.css';

export interface HeartButtonProps {
  /** The hearts the entry has. */
  count: number;
  /**
   * Off and On are the viewer's own heart, not given or given here; Count is
   * the count alone, on an entry the viewer may not heart.
   */
  state: 'off' | 'on' | 'count';
  /** Gives the heart, or takes it back. */
  onPress?: () => void;
}

/** Zumpo/Heart button: a heart for an entry, and how many it has. */
export function HeartButton({ count, state, onPress }: HeartButtonProps) {
  const m = useMessages();
  if (state === 'count') {
    return (
      <span
        className={styles.count}
        role="img"
        aria-label={m.ui.chain.hearts(count)}
      >
        <Heart filled />
        <span aria-hidden="true">{count}</span>
      </span>
    );
  }
  const on = state === 'on';
  return (
    <button
      type="button"
      className={cx(styles.button, on && styles.on)}
      aria-pressed={on}
      aria-label={m.ui.chain.heart(count)}
      onClick={onPress}
    >
      <Heart filled={on} />
      <span className={styles.label} aria-hidden="true">
        {count}
      </span>
    </button>
  );
}

/** The heart: filled coral, or a muted outline drawn inside its edge. */
function Heart({ filled }: { filled: boolean }) {
  const clip = useId();
  return (
    <svg
      className={cx(styles.heart, filled && styles.filled)}
      width={HEART.width}
      height={HEART.height}
      viewBox={`0 0 ${HEART.width} ${HEART.height}`}
      aria-hidden="true"
    >
      {filled ? (
        <path d={HEART.d} />
      ) : (
        <>
          <clipPath id={clip}>
            <path d={HEART.d} />
          </clipPath>
          {/* Twice the stroke, half of it clipped: Figma's inside stroke. */}
          <path
            d={HEART.d}
            fill="none"
            strokeWidth={3}
            strokeLinejoin="round"
            clipPath={`url(#${clip})`}
          />
        </>
      )}
    </svg>
  );
}
