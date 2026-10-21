import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx } from '../ui/cx';
import { extentOf } from './fit';
import styles from './play-board.module.css';

export interface PlayBoardProps {
  children: ReactNode;
  /**
   * The least it is scaled to fit the height it is given. Below it the board
   * keeps that scale and scrolls instead, keeping the element marked
   * `data-play-current` in view: a list, or a board too tall to shrink to a
   * readable size, such as Code Breaker's ten rows on a small phone. 1 never
   * scales for the height.
   */
  min?: number;
  /**
   * False for a board that pans sideways in a scroller of its own, such as
   * a Minesweeper board wider than a phone: it is never scaled to the width.
   */
  fitWidth?: boolean;
  /** Changes when the element to keep in view may have moved. */
  current?: unknown;
  /**
   * False once the game is over: the board stays where it is, mounted, but
   * no longer takes the height left, and is only scaled to the width, as
   * `Fit` does, so a finished board and what follows it scroll as a page.
   */
  inPlay?: boolean;
  className?: string;
}

/**
 * The board of a game in play, and the one part of a phone's play screen
 * that gives.
 *
 * A phone plays on one screen (`Page`): the room bar, the turn bar and the
 * controls under the board keep their sizes, and the board takes the height
 * left between them, scaled down, every proportion kept, so the controls
 * are always on screen and never move during a game. Whatever sits between
 * the stage and the board passes the height on as a `playColumn`.
 *
 * On a wider screen the page scrolls as before, and the board is only scaled
 * down to the width it is given, as `Fit` does.
 */
export function PlayBoard({
  children,
  min = 0.5,
  fitWidth = true,
  current,
  inPlay = true,
  className,
}: PlayBoardProps) {
  const box = useRef<HTMLDivElement>(null);
  const piece = useRef<HTMLDivElement>(null);
  const following = current !== undefined;

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = piece.current;
    if (!outer || !inner) return;
    const fit = () => {
      inner.style.removeProperty('zoom');
      const width = outer.clientWidth;
      const height = outer.clientHeight;
      const neededWidth = fitWidth ? extentOf(inner) : width;
      const neededHeight = inner.getBoundingClientRect().height;
      if (!width || !neededWidth || !neededHeight) return;
      const byWidth = width / neededWidth;
      const byHeight = inPlay ? height / neededHeight : 1;
      const scale = Math.min(1, byWidth, Math.max(byHeight, min));
      if (scale < 1) inner.style.setProperty('zoom', String(scale));
      const scrolls = byHeight < min;
      const began = scrolls && !outer.hasAttribute('data-scroll');
      outer.toggleAttribute('data-scroll', scrolls);
      // The row that made it scroll arrived before the board knew it would:
      // bring it into view now.
      if (began && following) keepInView(outer);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [min, fitWidth, inPlay, following]);

  // A board that scrolls keeps the row being played in view.
  useLayoutEffect(() => {
    const outer = box.current;
    if (current === undefined || !outer?.hasAttribute('data-scroll')) return;
    keepInView(outer);
  }, [current]);

  return (
    <div
      ref={box}
      className={cx(styles.box, className)}
      data-play-board={inPlay ? '' : undefined}
    >
      <div ref={piece} className={cx(styles.piece, !fitWidth && styles.wide)}>
        {children}
      </div>
    </div>
  );
}

/** Scrolls a board just enough to show its `data-play-current` whole. */
function keepInView(outer: HTMLElement): void {
  const target = outer.querySelector<HTMLElement>('[data-play-current]');
  if (!target) return;
  const room = outer.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  if (rect.top < room.top) outer.scrollTop -= room.top - rect.top;
  else if (rect.bottom > room.bottom)
    outer.scrollTop += rect.bottom - room.bottom;
}

/** Between a play screen's stage and its board: passes the height left on. */
export const playColumn = styles.column;
