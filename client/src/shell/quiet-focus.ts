/** Marks a focus put somewhere by script, whose ring app.css hides. */
export const QUIET = 'data-quiet-focus';

/** Marks the heading a page's focus landed on (Page), for a game to take it from. */
export const LANDING = 'data-landing-focus';

let listening = false;

/**
 * Marks `element` so the focus a script hands it draws no ring until the
 * viewer's next key: a browser rings a focus moved by script after a key, or
 * before any click, which on a touch screen or after a mouse click is only a
 * heavy frame round something nobody chose. A screen reader still lands
 * there, and the first key, Tab most often, shows where the focus is. The
 * mark goes when the element loses the focus, or at that key; a touch or a
 * click leaves it, so tapping beside the element never brings the ring back.
 */
export function quiet<Element extends HTMLElement>(element: Element): Element {
  element.setAttribute(QUIET, '');
  element.addEventListener('blur', () => element.removeAttribute(QUIET), {
    once: true,
  });
  if (!listening) {
    listening = true;
    window.addEventListener('keydown', clearAll, true);
  }
  return element;
}

/** Hands `element` the focus, with no ring until the next key. */
export function focusQuietly(element: HTMLElement) {
  quiet(element).focus({ preventScroll: true });
}

function clearAll() {
  for (const element of document.querySelectorAll(`[${QUIET}]`)) {
    element.removeAttribute(QUIET);
  }
}
