import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx } from '../ui/cx';
import styles from './fit.module.css';

export interface FitProps {
  children: ReactNode;
  /** Centred in the width it is given, or at its start. */
  align?: 'center' | 'start';
  className?: string;
  /**
   * The box is sized by its piece, as a flex item beside others is, rather
   * than given a width: its own size then says nothing when the room around
   * it grows or what is beside it shrinks, so Fit watches its parent, the
   * parent's width and the words in it. The parent's size must never follow
   * the piece's scale, or watching it would loop.
   */
  hugs?: boolean;
}

/**
 * A rigid piece, such as a board of fixed-size cards, scaled down to the
 * width it is given when it would be wider, every proportion kept. At the
 * widths Figma draws it is Figma's size; in between, where neither layout
 * fits, it shrinks rather than overflow. The piece is measured unscaled on
 * every resize, since scaled it always fits what it has.
 */
export function Fit({
  children,
  align = 'center',
  className,
  hugs = false,
}: FitProps) {
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
        inner.style.setProperty(
          'zoom',
          String(fittingZoom(inner, given, needed)),
        );
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    observer.observe(inner);
    // The piece never grows past its box, so content that changes while too
    // wide, as words in another language or in a font that has just come,
    // leaves its size as it was: those are watched for themselves. A hugging
    // box's room is its parent, words beside it included.
    const room = hugs ? outer.parentElement : null;
    if (room) observer.observe(room);
    const content = new MutationObserver(fit);
    content.observe(room ?? inner, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      observer.disconnect();
      content.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
    };
  }, [hugs]);

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

/** Tries at a scale before the piece is left at the last, smallest one. */
const FIT_TRIES = 8;

/**
 * The smallest scale: past it nothing in a piece can be read or touched, and
 * a scale of 0 or less would be read as no scale at all, the piece at full
 * size. A piece too wide even at it overflows.
 */
export const SMALLEST_ZOOM = 0.25;

/**
 * The scale at which the piece, `needed` wide unscaled, is no wider than
 * `given`. Text does not scale in proportion: at a scaled font size its
 * glyphs are laid out again, and where a platform rounds their advances to
 * whole pixels, as Chromium on Linux does, the line comes out a few pixels
 * wider than the scale says. So the scale is measured as applied and brought
 * down until the piece fits, by at least half a percent a try, and never
 * past `SMALLEST_ZOOM`. Leaves the scale applied.
 */
export function fittingZoom(
  piece: HTMLElement,
  given: number,
  needed: number,
): number {
  let zoom = Math.max(given / needed, SMALLEST_ZOOM);
  for (let tries = 0; tries < FIT_TRIES; tries++) {
    piece.style.setProperty('zoom', String(zoom));
    const scaled = extentOf(piece);
    if (scaled <= given || zoom === SMALLEST_ZOOM) return zoom;
    zoom = Math.max(
      Math.min(zoom * (given / scaled), zoom - 0.005),
      SMALLEST_ZOOM,
    );
  }
  piece.style.setProperty('zoom', String(zoom));
  return zoom;
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
