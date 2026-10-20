import { itemAt } from '../../../../shared/list';
import { useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../cx';
import styles from './pick-marker.module.css';

const DASH = 4;
const GAP = 3;

/**
 * The Auto ring's four sides, as Figma dashes a rounded rectangle: each side
 * runs from the middle of one corner to the middle of the next, with a dash
 * centred on it, so the dashes sit symmetrically whatever the cell's size.
 */
export function dashedSides(
  width: number,
  height: number,
  stroke: number,
  radius: number,
) {
  const a = stroke / 2;
  const [left, top, right, bottom] = [a, a, width - a, height - a];
  const r = radius;
  const k = r * (1 - Math.SQRT1_2);
  const arc = `A ${r} ${r} 0 0 1`;
  const sides = [
    `M ${left + k} ${top + k} ${arc} ${left + r} ${top} L ${right - r} ${top} ${arc} ${right - k} ${top + k}`,
    `M ${right - k} ${top + k} ${arc} ${right} ${top + r} L ${right} ${bottom - r} ${arc} ${right - k} ${bottom - k}`,
    `M ${right - k} ${bottom - k} ${arc} ${right - r} ${bottom} L ${left + r} ${bottom} ${arc} ${left + k} ${bottom - k}`,
    `M ${left + k} ${bottom - k} ${arc} ${left} ${bottom - r} L ${left} ${top + r} ${arc} ${left + k} ${top + k}`,
  ];
  const quarter = (Math.PI * r) / 2;
  const lengths = [right - left, bottom - top, right - left, bottom - top].map(
    (side) => side - 2 * r + quarter,
  );
  const period = DASH + GAP;
  return sides.map((d, index) => ({
    d,
    offset:
      ((((DASH - itemAt(lengths, index)) / 2) % period) + period) % period,
  }));
}

export type PickOutcome = 'safe' | 'mine' | 'auto';

export interface PickMarkerProps {
  /**
   * Safe, Mine, or Auto: the clock ran out and the server picked the safest
   * cell.
   */
  outcome: PickOutcome;
  /** One player's initials, or "×2" when several shared the cell. */
  initials: string;
  size?: 'regular' | 'compact';
}

/** Zumpo/Pick marker: laid over a Mine cell during the reveal. */
export function PickMarker({
  outcome,
  initials,
  size = 'regular',
}: PickMarkerProps) {
  const stroke = size === 'compact' ? 2 : 3;
  const radius = size === 'compact' ? 6 - stroke / 2 : 8 - stroke / 2;
  const marker = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(
    null,
  );

  // The Auto ring's dashes depend on the cell's size, which CSS sets.
  useLayoutEffect(() => {
    const element = marker.current;
    if (outcome !== 'auto' || !element) return;
    const measure = () =>
      setBox({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [outcome]);

  return (
    <span
      ref={marker}
      className={cx(
        styles.marker,
        outcome !== 'safe' && styles[outcome],
        size === 'compact' && styles.compact,
      )}
      aria-hidden="true"
    >
      <svg
        className={styles.ring}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
      >
        {outcome !== 'auto' ? (
          <rect rx={radius} />
        ) : (
          box &&
          dashedSides(box.width, box.height, stroke, radius).map((side) => (
            <path
              key={side.d}
              d={side.d}
              strokeDasharray={`${DASH} ${GAP}`}
              strokeDashoffset={side.offset}
            />
          ))
        )}
      </svg>
      <span className={styles.badge}>
        <span className={styles.initials}>{initials}</span>
      </span>
    </span>
  );
}
