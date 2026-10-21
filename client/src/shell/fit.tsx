import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx } from '../ui/cx';
import styles from './fit.module.css';

export interface FitProps {
  children: ReactNode;
  /** Centred in the width it is given, or at its start. */
  align?: 'center' | 'start';
  className?: string;
}

/**
 * A rigid piece, such as a board of fixed-size cards, scaled down to the
 * width it is given when it would be wider, every proportion kept. At the
 * widths Figma draws it is Figma's size; in between, where neither layout
 * fits, it shrinks rather than overflow. The piece is measured unscaled on
 * every resize, since scaled it always fits what it has.
 */
export function Fit({ children, align = 'center', className }: FitProps) {
  const box = useRef<HTMLDivElement>(null);
  const piece = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = piece.current;
    if (!outer || !inner) return;
    const fit = () => {
      inner.style.removeProperty('zoom');
      const given = outer.getBoundingClientRect().width;
      const needed = extentOf(inner);
      if (given > 0 && needed > given) {
        inner.style.setProperty('zoom', String(given / needed));
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className={cx(styles.box, className)}>
      <div
        ref={piece}
        className={cx(styles.piece, align === 'start' && styles.start)}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * How wide the piece's content is, from its leftmost edge to its rightmost:
 * content centred in a piece narrower than itself hangs over both sides, so
 * the piece's own scroll width would miss the left half.
 */
export function extentOf(piece: HTMLElement): number {
  let { left, right } = piece.getBoundingClientRect();
  for (const element of piece.querySelectorAll('*')) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0) continue;
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  }
  return right - left;
}
