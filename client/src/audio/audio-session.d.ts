/*
 * The Audio Session API (https://w3c.github.io/audio-session/), which only
 * Safari ships (16.4 and later) and TypeScript's DOM library does not
 * declare yet. Only what the engine sets: the type.
 */

type AudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record';

interface AudioSession extends EventTarget {
  type: AudioSessionType;
}

interface Navigator {
  /** Missing outside Safari. */
  readonly audioSession?: AudioSession;
}
