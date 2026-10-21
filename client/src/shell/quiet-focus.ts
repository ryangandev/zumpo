/** Marks a focus put somewhere by script, whose ring app.css hides. */
export const QUIET = 'data-quiet-focus';

/** Marks the heading a page's focus landed on (Page), for a game to take it from. */
export const LANDING = 'data-landing-focus';

/** How the viewer last acted: by a key, or by a touch or a click. */
let lastInput: 'key' | 'pointer' | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    () => {
      lastInput = 'key';
      clearAll();
    },
    true,
  );
  window.addEventListener(
    'pointerdown',
    () => {
      lastInput = 'pointer';
    },
    true,
  );
}

/**
 * Marks `element` so the focus a script hands it draws no ring until the
 * viewer's next key: a browser rings a focus moved by script after a key, or
 * before any click, which on a touch screen or after a mouse click is only a
 * heavy frame round something nobody chose. A screen reader still lands
 * there, and the first key, Tab most often, shows where the focus is. The
 * mark goes when the element loses the focus, or at that key; a touch or a
 * click leaves it, so tapping beside the element never brings the ring back.
 *
 * A control handed the focus after a key, as after Enter on Start game,
 * keeps its ring (WCAG 2.4.7): the viewer is at the keyboard and acts on it
 * next. A heading or a region, which only says where the viewer is, is
 * quiet either way.
 */
export function quiet<Element extends HTMLElement>(element: Element): Element {
  if (lastInput === 'key' && element.tabIndex >= 0) return element;
  element.setAttribute(QUIET, '');
  element.addEventListener('blur', () => element.removeAttribute(QUIET), {
    once: true,
  });
  return element;
}

/** Hands `element` the focus, with no ring until the next key (`quiet`). */
export function focusQuietly(element: HTMLElement) {
  quiet(element).focus({ preventScroll: true });
}

function clearAll() {
  for (const element of document.querySelectorAll(`[${QUIET}]`)) {
    element.removeAttribute(QUIET);
  }
}
