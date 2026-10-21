import { useLayoutEffect, useRef } from 'react';
import { ONE_COLUMN } from './use-media-query';

/**
 * The least a board is scaled to fit the window's height, which takes a
 * Medium minefield's cells to 22 px on a 720 px window: smaller than this
 * a board is hard to aim at, so the page scrolls instead.
 */
const MIN_SCALE = 0.5;

/**
 * A board played on its own page, with its keys (a word, a code, a
 * minefield), scaled down with every proportion kept when the page would
 * otherwise end below the window, so the last row and Enter are in view
 * without scrolling. Only beside a side column, where the board's column is
 * the page's tallest; on one column the page scrolls as it is. The element
 * is measured unscaled each time the window or the element changes size.
 * Scaled, it lays its content out wider by as much, so a board that pans or
 * a keyboard that narrows keeps its desktop layout.
 */
export function useFitHeight<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    // The board keeps its size as the game goes on, such as when its
    // controls go at the end; only a change of window lets it grow back.
    let most = 1;
    const fit = () => {
      element.style.removeProperty('zoom');
      if (window.matchMedia(ONE_COLUMN).matches) return;
      most = Math.min(most, heightScale(element));
      if (most < 1) element.style.setProperty('zoom', String(most));
    };
    const refit = () => {
      most = 1;
      fit();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    window.addEventListener('resize', refit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', refit);
      element.style.removeProperty('zoom');
    };
  }, [enabled]);

  return ref;
}

/**
 * How much of the page follows the element in its own column: what comes
 * after it there, and the page's foot. A column beside it, such as a side
 * column of cards longer than the board (a finished game's result, its
 * stats), is not the element's to make room for: the page scrolls for it.
 */
function belowOf(element: HTMLElement, rect: DOMRect): number {
  const pageBottom = document.documentElement.scrollHeight - window.scrollY;
  let column: HTMLElement = element;
  for (
    let parent = element.parentElement;
    parent;
    column = parent, parent = parent.parentElement
  ) {
    const tracks = getComputedStyle(parent).gridTemplateColumns;
    if (tracks && tracks !== 'none' && tracks.trim().split(/\s+/).length > 1) {
      const after = column.getBoundingClientRect().bottom - rect.bottom;
      return after + pageBottom - parent.getBoundingClientRect().bottom;
    }
  }
  return pageBottom - rect.bottom;
}

/**
 * The largest scale, at most 1, at which the element and what follows it end
 * inside the window, found by trying scales: scaled, the element lays its
 * content out wider, which can make it shorter still (a Gomoku table puts
 * its seats back beside the board). Called with the element unscaled.
 */
function heightScale(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0) return 1;
  const top = rect.top + window.scrollY;
  const below = belowOf(element, rect);
  if (top + rect.height + below <= window.innerHeight) return 1;
  // A pixel spare, so rounding never leaves the page a pixel too tall.
  const room = window.innerHeight - top - below - 1;
  const fits = (scale: number) => {
    element.style.setProperty('zoom', String(scale));
    return element.getBoundingClientRect().height <= room;
  };
  let low = MIN_SCALE;
  let high = 1;
  if (!fits(low)) return low;
  for (let step = 0; step < 8; step++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  element.style.removeProperty('zoom');
  return low;
}
