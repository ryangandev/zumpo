import { useEffect, useRef, useState, type RefObject } from 'react';

/** What the keyboard can reach; text fields are left out, see below. */
const CONTROLS = [
  'button',
  'a[href]',
  'select',
  'input:not([type="hidden"]):not([type="text"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Hands the keyboard focus to a game as it starts: Start, Play again and the
 * like go away as they are pressed, which drops the focus to the page, so
 * the next Tab would begin again in the header. When `started` turns true,
 * or the game mounts started, and the focus has fallen to the page, it moves
 * to the first control in `scope`: the board's one tab stop, a card, a key.
 * Until the viewer's first key or touch it keeps doing so, as a game deals
 * and its first controls come. Focus the game or the viewer has put
 * anywhere else stays there.
 *
 * A text field is never chosen, because on a phone focusing one opens the
 * keyboard over the game; a game that wants its field focused does so itself.
 */
export function useStartFocus(
  started: boolean,
  scope: RefObject<HTMLElement | null>,
) {
  // From the start until the viewer's first key or touch: a game whose first
  // move is the computer's has no control at first, and one may swap its
  // controls as it deals, so until then the focus follows the first control.
  const [waiting, setWaiting] = useState(false);
  const [was, setWas] = useState<boolean | null>(null);
  if (started !== was) {
    setWas(started);
    setWaiting(started);
  }
  // The focus this hook put somewhere, to tell it from the viewer's own.
  const placed = useRef<Element | null>(null);

  useEffect(() => {
    if (!waiting) return;
    const done = () => setWaiting(false);
    window.addEventListener('keydown', done, true);
    window.addEventListener('pointerdown', done, true);
    return () => {
      window.removeEventListener('keydown', done, true);
      window.removeEventListener('pointerdown', done, true);
    };
  }, [waiting]);

  // After every render, as the game's controls come and go with it.
  useEffect(() => {
    if (!waiting) return;
    const active = document.activeElement;
    if (active && active !== document.body) {
      // The game put the focus somewhere of its own, such as a text field.
      if (active !== placed.current) setWaiting(false);
      return;
    }
    const control = firstControl(scope.current);
    control?.focus({ preventScroll: true });
    placed.current = control;
  });
}

function firstControl(scope: HTMLElement | null): HTMLElement | null {
  if (!scope) return null;
  for (const element of scope.querySelectorAll<HTMLElement>(CONTROLS)) {
    if (isReachable(element)) return element;
  }
  return null;
}

function isReachable(element: HTMLElement): boolean {
  if (element.matches(':disabled')) return false;
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ visibilityProperty: true })
    : true;
}
