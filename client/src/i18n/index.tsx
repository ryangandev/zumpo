import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readLocale, writeLocale } from '../net/storage';
import { en, type Messages } from './en';
import { detectLocale, LOCALE_TAGS, type Locale } from './locale';
import { zh } from './zh';

export type { Locale } from './locale';
export { detectLocale, isLocale, LOCALE_NAMES, LOCALES } from './locale';
export type { Messages } from './en';

/**
 * Every language's catalog, loaded with the app: two catalogs are small, and
 * switching is then instant. Past a few, load them with `lazy` here and
 * nowhere else changes.
 */
const MESSAGES: Readonly<Record<Locale, Messages>> = { en, zh };

interface LocaleState {
  locale: Locale;
  messages: Messages;
  /** Remembers the choice for this browser and switches every page at once. */
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleState | null>(null);

/**
 * Holds the language the player reads, above the session so that even the
 * first visit's random name is picked in it. The choice lives in
 * localStorage; without one, the browser's languages decide.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(
    () => readLocale() ?? detectLocale(navigator.languages ?? []),
  );

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[locale];
  }, [locale]);

  const value = useMemo<LocaleState>(
    () => ({
      locale,
      messages: MESSAGES[locale],
      setLocale: (next) => {
        writeLocale(next);
        setLocaleState(next);
      },
    }),
    [locale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

function useLocaleState(): LocaleState {
  const state = useContext(LocaleContext);
  if (!state) throw new Error('useLocale needs a LocaleProvider above it');
  return state;
}

/** The language the player reads, and the way to change it. */
export function useLocale(): Pick<LocaleState, 'locale' | 'setLocale'> {
  const { locale, setLocale } = useLocaleState();
  return { locale, setLocale };
}

/** The catalog in the player's language: `m.room.leave`, `m.chat.you(name)`. */
export function useMessages(): Messages {
  return useLocaleState().messages;
}
