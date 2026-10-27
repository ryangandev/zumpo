import type { AudioEngine } from './engine';

/**
 * The events that may grant user activation (HTML's "activation triggering
 * input event"), which `isActivation` narrows: `pointerdown` only for a
 * mouse and `pointerup` only for anything else, so a phone's tap counts at
 * `pointerup` or `touchend`; `keydown` except Escape.
 */
const GESTURES = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'touchend',
  'keydown',
] as const;

function isActivation(event: Event): boolean {
  switch (event.type) {
    case 'pointerdown':
      return (event as PointerEvent).pointerType === 'mouse';
    case 'pointerup':
      return (event as PointerEvent).pointerType !== 'mouse';
    case 'keydown':
      return (event as KeyboardEvent).key !== 'Escape';
    default:
      return true;
  }
}

/**
 * Only the player's own input counts, as only that lets a browser start
 * audio: a context made on a script's event stays suspended, with a console
 * warning. jsdom cannot make such input, so the unit tests take any event.
 */
function isUserInput(event: Event): boolean {
  return event.isTrusted || import.meta.env.MODE === 'test';
}

/**
 * Connects the engine to the page: the first gesture anywhere unlocks it,
 * and the listeners come back whenever the context stops running without
 * being asked to (an interruption: a call, Siri, another app's audio).
 * Hiding the page tells the engine, so only `hiddenTab` sounds play behind
 * another tab. Returns the way to disconnect.
 */
export function connectAudioSession(
  engine: AudioEngine,
  target: Window = window,
): () => void {
  const listening = { capture: true, passive: true } as const;
  let armed = false;

  const onGesture = (event: Event) => {
    if (isUserInput(event) && isActivation(event)) engine.unlock();
  };
  const arm = () => {
    if (armed) return;
    armed = true;
    for (const type of GESTURES) {
      target.addEventListener(type, onGesture, listening);
    }
  };
  const disarm = () => {
    if (!armed) return;
    armed = false;
    for (const type of GESTURES) {
      target.removeEventListener(type, onGesture, listening);
    }
  };
  const follow = () => {
    const { state } = engine;
    if (state === 'running' || state === 'unsupported') disarm();
    else arm();
  };

  const page = target.document;
  const onVisibility = () => engine.setHidden(page.hidden);

  follow();
  onVisibility();
  const unsubscribe = engine.subscribe(follow);
  page.addEventListener('visibilitychange', onVisibility);
  return () => {
    disarm();
    unsubscribe();
    page.removeEventListener('visibilitychange', onVisibility);
  };
}
