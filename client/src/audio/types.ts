/*
 * The shapes the generated sound banks and the engine share. A bank is
 * written by `npm run audio:build` into `generated/`, one module per group,
 * from `audio/sounds.json`; nothing here is typed by hand per sound.
 */

/**
 * A mixer bus with its own volume and mute. v1 has effects only; music is
 * added here, in the settings and in the engine, without changing either
 * shape for effects.
 */
export type Bus = 'effects';

/** One recording of a sound, in both formats the build makes. */
export interface SoundVariant {
  /** AAC-LC in MP4, tried first. */
  readonly m4a: string;
  /** Opus in WebM, for a browser that cannot decode the AAC. */
  readonly webm: string;
  /** Seconds. */
  readonly duration: number;
}

/**
 * How loud the build made a sound, and so what it is: `ui` taps and toggles,
 * `event` a move or a score, `stinger` a game's start or end.
 */
export type Loudness = 'ui' | 'event' | 'stinger';

/** A declared sound, as `audio/sounds.json` describes it after the build. */
export interface SoundSpec {
  readonly id: string;
  readonly group: string;
  /** Its loudness class, which also sets how late it may still start. */
  readonly loudness: Loudness;
  /** The relative mix in dB, on top of the loudness the build normalised to. */
  readonly gainDb: number;
  /** One is picked at random each time, never the same one twice in a row. */
  readonly variants: readonly SoundVariant[];
  /** Each play is detuned by up to this many semitones either way. */
  readonly pitchSpread?: number;
  /** A repeat sooner than this is dropped. */
  readonly minGapMs?: number;
  /** Copies at once; one more stops the oldest. */
  readonly maxVoices?: number;
  /** Plays while the page is hidden. Only "your turn" should. */
  readonly hiddenTab?: boolean;
}

/** One group's sounds by id, as a generated module exports them. */
export type SoundBank<Id extends string = string> = Readonly<
  Record<Id, SoundSpec>
>;

export interface PlayOptions {
  /** Another player's doing: plays about 6 dB softer than the viewer's own. */
  other?: boolean;
}

/** Plays one of a bank's sounds, if sound is on and unlocked; never throws. */
export type PlaySound<Id extends string> = (
  id: Id,
  options?: PlayOptions,
) => void;
