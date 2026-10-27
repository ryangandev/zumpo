import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { readSound, watchSound, writeSound } from '../net/storage';
import { AudioEngine, type EngineState } from './engine';
import { connectAudioSession } from './session';
import {
  clampVolume,
  DEFAULT_SOUND_SETTINGS,
  type BusSettings,
  type SoundSettings,
} from './settings';
import type { Bus, PlaySound, SoundBank, SoundSpec } from './types';

interface SoundState {
  engine: AudioEngine;
  settings: SoundSettings;
  update: (bus: Bus, change: Partial<BusSettings>) => void;
}

const SoundContext = createContext<SoundState | null>(null);

/**
 * Holds the one sound engine and the player's sound settings, beside the
 * language and above the session. Nothing is fetched and no audio context
 * exists until a page asks for a bank and the player has interacted; the
 * settings live in localStorage and follow other tabs. `engine` is for tests.
 */
export function SoundProvider({
  children,
  engine: given,
}: {
  children: ReactNode;
  engine?: AudioEngine;
}) {
  const [settings, setSettings] = useState<SoundSettings>(
    () => readSound() ?? DEFAULT_SOUND_SETTINGS,
  );
  const [engine] = useState(() => given ?? new AudioEngine({}, settings));

  useEffect(() => {
    const disconnect = connectAudioSession(engine);
    return () => {
      disconnect();
      engine.close();
    };
  }, [engine]);

  useEffect(() => engine.applySettings(settings), [engine, settings]);

  // The settings as last set, for changes made before React re-renders.
  const latest = useRef(settings);

  useEffect(
    () =>
      watchSound((stored) => {
        latest.current = stored ?? DEFAULT_SOUND_SETTINGS;
        setSettings(latest.current);
      }),
    [],
  );

  const update = useCallback((bus: Bus, change: Partial<BusSettings>) => {
    const current = latest.current;
    const volume = change.volume ?? current[bus].volume;
    const next: SoundSettings = {
      ...current,
      [bus]: {
        volume: Number.isFinite(volume)
          ? clampVolume(volume)
          : current[bus].volume,
        muted: change.muted ?? current[bus].muted,
      },
    };
    latest.current = next;
    // Saved here, not in a state updater, which React may call twice.
    writeSound(next);
    setSettings(next);
  }, []);

  const value = useMemo<SoundState>(
    () => ({ engine, settings, update }),
    [engine, settings, update],
  );
  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}

function useSoundState(): SoundState {
  const state = useContext(SoundContext);
  if (!state) throw new Error('Sound hooks need a SoundProvider above them');
  return state;
}

/**
 * Keeps a bank's sounds decoded while the component is mounted, and returns
 * the function that plays them by id. Playing is a no-op before the first
 * gesture, while muted, without Web Audio, and while the page is hidden
 * (except a `hiddenTab` sound); it never throws.
 */
export function useSounds<Id extends string>(
  bank: SoundBank<Id>,
): PlaySound<Id> {
  const { engine } = useSoundState();
  useEffect(
    () => engine.retain(Object.values<SoundSpec>(bank)),
    [engine, bank],
  );
  return useCallback<PlaySound<Id>>(
    (id, options) => {
      const spec: SoundSpec | undefined = bank[id];
      if (spec) void engine.play(spec, options);
    },
    [engine, bank],
  );
}

/** What the sound controls show and change. */
export interface SoundControls {
  /** False where the browser has no Web Audio: the controls can hide. */
  available: boolean;
  /** `locked` until the first gesture, then the audio context's state. */
  state: EngineState;
  /** Volume 0 to 1 and mute, per bus. v1 has `effects`. */
  settings: SoundSettings;
  /** Remembers it for this browser; clamped to 0 to 1. */
  setVolume: (bus: Bus, volume: number) => void;
  setMuted: (bus: Bus, muted: boolean) => void;
}

export function useSoundControls(): SoundControls {
  const { engine, settings, update } = useSoundState();
  const subscribe = useCallback(
    (onChange: () => void) => engine.subscribe(onChange),
    [engine],
  );
  const state = useSyncExternalStore(subscribe, () => engine.state);
  return useMemo(
    () => ({
      available: state !== 'unsupported',
      state,
      settings,
      setVolume: (bus, volume) => update(bus, { volume }),
      setMuted: (bus, muted) => update(bus, { muted }),
    }),
    [state, settings, update],
  );
}
