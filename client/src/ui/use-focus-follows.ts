import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keeps the keyboard focus through a swap, such as Done turning into Keep
 * editing: when `on` flips, the focus moves to `whenOn` or `whenOff`. It
 * moves only when the swap took it away (it fell to the page) or it is still
 * inside `scope`; focus the viewer has taken elsewhere stays there.
 */
export function useFocusFollows(
  on: boolean,
  scope: RefObject<HTMLElement | null>,
  whenOn: RefObject<HTMLElement | null>,
  whenOff: RefObject<HTMLElement | null>,
) {
  const last = useRef(on);
  // After every render, as the refs are only read then; it acts on a flip.
  useEffect(() => {
    if (last.current === on) return;
    last.current = on;
    const active = document.activeElement;
    const lost = !active || active === document.body;
    if (!lost && !scope.current?.contains(active)) return;
    (on ? whenOn : whenOff).current?.focus();
  });
}
