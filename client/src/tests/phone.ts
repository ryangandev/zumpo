import { vi } from 'vitest';
import { ONE_COLUMN, PHONE } from '../shell/use-media-query';

/** Lays the app out as on a phone until the mocks are restored. */
export function onPhone() {
  const desktop = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    ...desktop(query),
    matches: query === PHONE || query === ONE_COLUMN,
  }));
}

/**
 * Starts the app on a desktop and returns how to turn it into a phone, as a
 * window narrowed past the breakpoint does, until the mocks are restored.
 */
export function narrowable(): { narrow: () => void } {
  const desktop = window.matchMedia;
  const listeners = new Set<EventListener>();
  let phone = false;
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    ...desktop(query),
    matches: phone && (query === PHONE || query === ONE_COLUMN),
    addEventListener: (_type: string, listener: EventListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: EventListener) => {
      listeners.delete(listener);
    },
  }));
  return {
    narrow: () => {
      phone = true;
      for (const listener of listeners) listener(new Event('change'));
    },
  };
}
