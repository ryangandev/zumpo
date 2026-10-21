import { useLayoutEffect, type RefObject } from 'react';

/**
 * Keeps `--height-left` on an element: the window's height below the
 * element's top on the page, unscrolled, for a board or a sheet sized to be
 * all in sight at once. It is measured before the first paint, and again as
 * the window or the page changes.
 */
export function useHeightLeft(
  element: RefObject<HTMLElement | null>,
  on = true,
) {
  useLayoutEffect(() => {
    const target = element.current;
    if (!target || !on) return;
    const measure = () => {
      const top = target.getBoundingClientRect().top + window.scrollY;
      target.style.setProperty(
        '--height-left',
        `${Math.max(0, window.innerHeight - top)}px`,
      );
    };
    measure();
    window.addEventListener('resize', measure);
    // What is above it can change height, as a page does when it loads.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
      target.style.removeProperty('--height-left');
    };
  }, [element, on]);
}
