import { useEffect, useRef, type RefObject } from 'react';

/** What the keyboard can reach; text fields are left out, see below. */
const CONTROLS = [
  'button',
  'a[href]',
  'select',
  'input',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Marks the start's own focus, whose ring app.css hides until a key. */
const QUIET = 'data-start-quiet';

/**
 * Hands the keyboard focus to a game as it starts: Start, Play again and the
 * like go away as they are pressed, which drops the focus to the page, so
 * the next Tab would begin again in the header. When `started` turns true,
 * or the game mounts started, and the focus has fallen to the page, it moves
 * to the first control in `scope`: the board's one tab stop, a card, or a
 * board typed into (`data-start-focus`), never its on-screen keys.
 * Until the viewer's first key or touch it keeps doing so, as a game deals
 * and its first controls come. Focus the game or the viewer has put
 * anywhere else stays there.
 *
 * A text field is never chosen, because on a phone focusing one opens the
 * keyboard over the game; a game that wants its field focused does so itself.
 *
 * The focus it hands over draws no ring until the viewer's first key
 * (`data-start-quiet`, app.css): a browser rings a focus put there by script
 * before any click, which on a touch screen is only a frame around the board.
 * A screen reader still lands there, and the first key shows where it is.
 */
export function useStartFocus(
  started: boolean,
  scope: RefObject<HTMLElement | null>,
) {
  // From the start until the viewer's first key or touch: a game whose first
  // move is the computer's has no control at first, and one may swap its
  // controls as it deals, so until then the focus follows the first control.
  const waiting = useRef(false);
  const was = useRef<boolean | null>(null);
  // The focus this hook put somewhere, to tell it from the viewer's own.
  const placed = useRef<Element | null>(null);

  useEffect(() => {
    const done = () => {
      waiting.current = false;
      placed.current?.removeAttribute(QUIET);
    };
    window.addEventListener('keydown', done, true);
    window.addEventListener('pointerdown', done, true);
    return () => {
      window.removeEventListener('keydown', done, true);
      window.removeEventListener('pointerdown', done, true);
    };
  }, []);

  // After every render, as the game's controls come and go with it.
  useEffect(() => {
    if (started !== was.current) {
      waiting.current = started;
      was.current = started;
    }
    if (!waiting.current) return;
    const active = document.activeElement;
    if (active && active !== document.body) {
      // The game put the focus somewhere of its own, such as a text field.
      if (active !== placed.current) waiting.current = false;
      return;
    }
    const control = firstControl(scope.current);
    if (control !== placed.current) placed.current?.removeAttribute(QUIET);
    control?.setAttribute(QUIET, '');
    control?.focus({ preventScroll: true });
    placed.current = control;
  });
}

function firstControl(scope: HTMLElement | null): HTMLElement | null {
  if (!scope) return null;
  // A board typed into takes the focus over its on-screen keys.
  const typed = scope.querySelector<HTMLElement>('[data-start-focus]');
  if (typed && isReachable(typed)) return typed;
  for (const element of scope.querySelectorAll<HTMLElement>(CONTROLS)) {
    if (isReachable(element)) return element;
  }
  return null;
}

/**
 * Inputs a player types into. Base UI's field renders an input with no type
 * at all, which is a text field too, so the type is read, not the attribute.
 */
const TYPED = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'number',
  'password',
]);

function isReachable(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'hidden' || TYPED.has(element.type)) return false;
  }
  if (element.matches(':disabled')) return false;
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ visibilityProperty: true })
    : true;
}
