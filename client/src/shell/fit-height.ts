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
 * How far the unscaled element must shrink for the page to end inside the
 * window, when what is above it and what follows it keep their size.
 */
function heightScale(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0) return 1;
  const top = rect.top + window.scrollY;
  const below =
    document.documentElement.scrollHeight - (rect.bottom + window.scrollY);
  // A pixel spare, so rounding never leaves the page a pixel too tall.
  const room = window.innerHeight - top - below - 1;
  if (room >= rect.height) return 1;
  return Math.max(MIN_SCALE, room / rect.height);
}
