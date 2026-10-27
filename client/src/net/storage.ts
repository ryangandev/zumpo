import type { PlayerIdentity } from '../../../shared/wire-types';
import {
  parseSoundSettings,
  serializeSoundSettings,
  type SoundSettings,
} from '../audio/settings';
import { isLocale, type Locale } from '../i18n/locale';

/*
 * The identity lives in sessionStorage: per tab, and surviving a reload, which
 * is exactly the lifetime of a seat at a table. localStorage would hand two
 * tabs one identity, and they would fight over one seat.
 *
 * The name lives in localStorage: it is what this browser calls its player,
 * so a new tab or a visit next week starts with it. Two tabs are still two
 * players; they just begin with the same name, and a room numbers the second.
 */

const IDENTITY_KEY = 'zumpo:identity';
const NAME_KEY = 'zumpo:name';
const LOCALE_KEY = 'zumpo:locale';
const SOUND_KEY = 'zumpo:sound';

type Store = 'sessionStorage' | 'localStorage';

function read(store: Store, key: string): string | null {
  try {
    return window[store].getItem(key);
  } catch {
    // Storage can be blocked; the player is then simply new on every load.
    return null;
  }
}

function write(store: Store, key: string, value: string): void {
  try {
    window[store].setItem(key, value);
  } catch {
    // Nothing to do: the value still lives in memory for this page.
  }
}

export function readIdentity(): PlayerIdentity | null {
  try {
    const parsed = JSON.parse(
      read('sessionStorage', IDENTITY_KEY) ?? 'null',
    ) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'playerId' in parsed &&
      'token' in parsed &&
      typeof parsed.playerId === 'string' &&
      typeof parsed.token === 'string'
    ) {
      return { playerId: parsed.playerId, token: parsed.token };
    }
  } catch {
    // A malformed entry just means we identify as new.
  }
  return null;
}

export function writeIdentity({ playerId, token }: PlayerIdentity): void {
  write('sessionStorage', IDENTITY_KEY, JSON.stringify({ playerId, token }));
}

/**
 * The player's name, and whether it is still the one picked for them on their
 * first visit rather than one they chose.
 */
export interface StoredName {
  name: string;
  picked: boolean;
}

export function readName(): StoredName | null {
  try {
    const parsed = JSON.parse(
      read('localStorage', NAME_KEY) ?? 'null',
    ) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'name' in parsed &&
      'picked' in parsed &&
      typeof parsed.name === 'string' &&
      parsed.name.trim() !== '' &&
      typeof parsed.picked === 'boolean'
    ) {
      return { name: parsed.name, picked: parsed.picked };
    }
  } catch {
    // A malformed entry just means a new name is picked.
  }
  return null;
}

export function writeName({ name, picked }: StoredName): void {
  write('localStorage', NAME_KEY, JSON.stringify({ name, picked }));
}

/** The language the player chose from the switch, if they ever did. */
export function readLocale(): Locale | null {
  const stored = read('localStorage', LOCALE_KEY);
  return isLocale(stored) ? stored : null;
}

export function writeLocale(locale: Locale): void {
  write('localStorage', LOCALE_KEY, locale);
}

function parseJson(value: string | null): unknown {
  try {
    return JSON.parse(value ?? 'null') as unknown;
  } catch {
    // A malformed entry just means the defaults.
    return null;
  }
}

/**
 * Sound volume and mute: the browser's, like the language, so every tab and
 * the next visit start with them.
 */
export function readSound(): SoundSettings | null {
  return parseSoundSettings(parseJson(read('localStorage', SOUND_KEY)));
}

export function writeSound(settings: SoundSettings): void {
  const previous = parseJson(read('localStorage', SOUND_KEY));
  write('localStorage', SOUND_KEY, serializeSoundSettings(settings, previous));
}

/**
 * Calls `onChange` when another tab of this browser changes the sound, with
 * null when it was cleared.
 */
export function watchSound(
  onChange: (settings: SoundSettings | null) => void,
): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key === SOUND_KEY || event.key === null) {
      onChange(parseSoundSettings(parseJson(event.newValue)));
    }
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
