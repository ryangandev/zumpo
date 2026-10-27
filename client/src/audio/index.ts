// Zumpo's sound: import from here, not from the files behind it.
// How it works and why: docs/architecture.md#sound.

export { SoundProvider, useSoundControls, useSounds } from './provider';
export type { SoundControls } from './provider';
export type { EngineState } from './engine';
export { DEFAULT_SOUND_SETTINGS } from './settings';
export type { BusSettings, SoundSettings } from './settings';
export { createReplayGuard, useStateSounds } from './replay-guard';
export type {
  DeriveSounds,
  IsNewGame,
  ReplayGuard,
  ReplayGuardOptions,
  SoundEvent,
} from './replay-guard';
export type {
  Bus,
  Loudness,
  PlayOptions,
  PlaySound,
  SoundBank,
  SoundSpec,
  SoundVariant,
  SteppedId,
} from './types';
export type { SoundGroup, SoundId } from './generated';
