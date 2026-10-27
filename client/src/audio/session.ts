import type { AudioEngine } from './engine';

/**
 * The events that grant user activation (HTML's "activation triggering input
 * event"): `pointerdown` only for a mouse, so a phone's tap is `pointerup` or
 * `touchend`; `keydown` except Escape.
 */
const GESTURES = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'touchend',
  'keydown',
] as const;

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
    if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') {
      return;
    }
    engine.unlock();
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
