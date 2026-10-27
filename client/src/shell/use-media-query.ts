import { useCallback, useSyncExternalStore } from 'react';

/** Whether a media query matches, kept current as the window changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * A finger, not a mouse: a phone or a tablet, where sending a link means the
 * system share sheet, and a tap on a board has no hover before it.
 */
export const TOUCH = '(pointer: coarse)';

/** The phone layout's breakpoint, the same as the components' CSS. */
export const PHONE = '(max-width: 640px)';

/**
 * A phone shorter than three Regular word choices need with the rest of a
 * Draw & Guess turn (761 px), such as most iPhones with Safari's bars showing
 * (390 × 664): the choices take their Compact size, a row each, so choosing
 * is one screen (PH10).
 */
export const SHORT_PHONE = '(max-width: 640px) and (max-height: 760px)';

/**
 * Under this a room, or a game on your own, is one column: the side panels
 * under the stage, and the room bar in its Phone layout. Beside the 344 px
 * side column a narrower window leaves a board less than it needs. The same
 * width is in the layouts' CSS.
 */
export const ONE_COLUMN = '(max-width: 1023px)';

/**
 * A screen wider than a phone but too short for the desktop's pieces, such
 * as a phone on its side: the board and the sheet are capped to the height,
 * and the turn bar takes its compact phone row. The same query is in the
 * layouts' CSS.
 */
export const SHORT_SCREEN = '(min-width: 641px) and (max-height: 500px)';

/**
 * A window too short for a desktop's spacing, such as a 13-inch laptop's
 * browser (1280 × 720 to 1366 × 768): a game on your own tightens the room
 * around its board, and its turn bar takes the compact phone row. The same
 * query is in the layouts' CSS.
 */
export const SHORT_WINDOW = '(min-width: 641px) and (max-height: 800px)';

/**
 * A short window wide enough for a board and its keys side by side (a
 * regular Daily Word board, 24 px, and a keyboard in its Phone layout, beside
 * the 344 px side column): on your own, Daily Word's keyboard and Code
 * Breaker's pad go beside the board instead of under it, so neither shrinks
 * far.
 */
export const SHORT_WIDE = '(min-width: 1240px) and (max-height: 800px)';
