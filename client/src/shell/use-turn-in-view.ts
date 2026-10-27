import { useLayoutEffect, useRef, type RefObject } from 'react';
import { PHONE } from './use-media-query';

/**
 * On a phone too short for a drawing sheet's floor, the page runs past the
 * window (canvas.module.css): each new `key`, a turn's phase, scrolls it so
 * the turn bar `turn` stands at the top, the page's padding under the
 * window's edge, or as far down as the page goes. So the turn, from its bar
 * to what the player touches under the sheet, is in sight together, with
 * the room bar and the tabs a scroll above it.
 *
 * It does nothing where the page fits the window, nor while the viewer is
 * typing, whose keyboard the browser keeps the field above, or in a dialog.
 */
export function useTurnInView(
  turn: RefObject<HTMLElement | null>,
  key: unknown,
) {
  // The phase last brought into view; a page mounted afresh, as the Board
  // tab is again, brings its phase into view once more.
  const shown = useRef<{ key: unknown } | null>(null);
  useLayoutEffect(() => {
    if (shown.current && Object.is(shown.current.key, key)) return;
    shown.current = { key };
    const element = turn.current;
    if (!element || !window.matchMedia(PHONE).matches) return;
    const root = document.documentElement;
    const room = root.scrollHeight - window.innerHeight;
    if (room <= 0 || busy()) return;
    // The page's own padding over it, as over the room bar at the top.
    const page = element.closest('main')?.parentElement;
    const padding = page
      ? Number.parseFloat(getComputedStyle(page).paddingTop) || 0
      : 0;
    const top = element.getBoundingClientRect().top + window.scrollY - padding;
    window.scrollTo({
      top: Math.max(0, Math.min(top, room)),
      behavior: 'instant',
    });
  }, [turn, key]);
}

/** Whether the viewer is in a text field or a dialog. */
function busy(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement &&
      !['button', 'checkbox', 'radio', 'submit'].includes(active.type)) ||
    active?.closest('[role="dialog"]') != null
  );
}
