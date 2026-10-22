import { useLayoutEffect, type RefObject } from 'react';
import { playAreaBelow } from './fit-height';
import { ONE_COLUMN } from './use-media-query';

/**
 * Keeps `--height-left` on an element: the window's height below the
 * element's top on the page, unscrolled, for a board or a sheet sized to be
 * all in sight at once. It is measured before the first paint, and again as
 * the window or the page changes.
 *
 * With `toEnd`, less what follows the element to the end of the play area
 * (playAreaBelow), such as the Done under a sheet, and the page's foot, so
 * the play area ends inside the window. Beside a
 * side column it is marked `data-fit-height`, as a board fitted to the
 * window is (useFitHeight), so the page around it tightens on a short
 * window.
 */
export function useHeightLeft(
  element: RefObject<HTMLElement | null>,
  on = true,
  toEnd = false,
) {
  useLayoutEffect(() => {
    const target = element.current;
    if (!target || !on) return;
    const measure = () => {
      const oneColumn = window.matchMedia(ONE_COLUMN).matches;
      if (toEnd) target.toggleAttribute('data-fit-height', !oneColumn);
      const rect = target.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      // In one column the page scrolls to what follows, so only the window
      // below the top is left, as for a board on its own.
      const after = toEnd && !oneColumn ? playAreaBelow(target, rect) : 0;
      target.style.setProperty(
        '--height-left',
        `${Math.max(0, window.innerHeight - top - after)}px`,
      );
    };
    measure();
    window.addEventListener('resize', measure);
    // What is above it can change height, as a page does when it loads, and
    // what follows it, which a page shorter than the window does not show in
    // the body's size, only in the columns around the element.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    if (toEnd) {
      for (
        let parent = target.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        observer.observe(parent);
      }
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
      target.style.removeProperty('--height-left');
      if (toEnd) target.removeAttribute('data-fit-height');
    };
  }, [element, on, toEnd]);
}
