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
 * system share sheet.
 */
export const TOUCH = '(pointer: coarse)';

/** The phone layout's breakpoint, the same as the components' CSS. */
export const PHONE = '(max-width: 640px)';

/**
 * Under this a room, or a game on your own, is one column: the side panels
 * under the stage, and the room bar in its Phone layout. Beside the 344 px
 * side column a narrower window leaves a board less than it needs. The same
 * width is in the layouts' CSS.
 */
export const ONE_COLUMN = '(max-width: 1023px)';
