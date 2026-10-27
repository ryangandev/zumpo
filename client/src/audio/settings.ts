import type { Bus } from './types';

/** What the player set for one bus. */
export interface BusSettings {
  /** 0 to 1, as a slider shows it; the gain is its cube. */
  volume: number;
  muted: boolean;
}

/** What the player set for sound, remembered for this browser. */
export type SoundSettings = Readonly<Record<Bus, BusSettings>>;

/** Effects on at about 70%, as decided for v1. */
export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  effects: { volume: 0.7, muted: false },
};

/** The stored shape's version; a new bus is a new key, not a new version. */
const VERSION = 1;

const BUSES: readonly Bus[] = ['effects'];

export function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume));
}

function parseBus(stored: unknown, fallback: BusSettings): BusSettings {
  if (!stored || typeof stored !== 'object') return fallback;
  const { volume, muted } = stored as Record<string, unknown>;
  return {
    volume:
      typeof volume === 'number' && Number.isFinite(volume)
        ? clampVolume(volume)
        : fallback.volume,
    muted: typeof muted === 'boolean' ? muted : fallback.muted,
  };
}

/**
 * Settings from what storage held, or null when it held nothing usable. A bus
 * the stored value does not mention, such as one added after it was saved,
 * takes its default, so adding music never resets the effects.
 */
export function parseSoundSettings(stored: unknown): SoundSettings | null {
  if (!stored || typeof stored !== 'object') return null;
  const value = stored as Record<string, unknown>;
  if (value.v !== VERSION) return null;
  return Object.fromEntries(
    BUSES.map((bus) => [
      bus,
      parseBus(value[bus], DEFAULT_SOUND_SETTINGS[bus]),
    ]),
  ) as Record<Bus, BusSettings>;
}

/** The stored form: `{ v: 1, effects: { volume, muted } }`. */
export function serializeSoundSettings(settings: SoundSettings): string {
  return JSON.stringify({ v: VERSION, ...settings });
}
