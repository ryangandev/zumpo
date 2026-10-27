import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from './settings';
import type {
  Bus,
  Loudness,
  PlayOptions,
  SoundSpec,
  SoundVariant,
} from './types';

/*
 * Zumpo's sound engine: the raw Web Audio API, no library, no React.
 *
 *   voice (source -> gain) -> effects bus -> master -> limiter -> speakers
 *
 * The context is made at the player's first gesture, never before, so
 * nothing plays and nothing warns before then; until it runs, every play is
 * dropped rather than queued, because a sound that arrives late accompanies
 * the wrong moment. The files a page retains are fetched as soon as it does,
 * gesture or not, so the first gesture only has to decode them. Sounds are
 * decoded into buffers, never streamed through a media element, whose volume
 * iOS does not let a page set.
 */

/** Before the first gesture there is no context: the engine is locked. */
export type EngineState = 'locked' | 'unsupported' | AudioContextState;

type Format = 'm4a' | 'webm';

export interface EngineOptions {
  /** Makes the context; the browser's `AudioContext` by default. */
  createContext?: () => AudioContext;
  /** Fetches a sound's file; `fetch` by default. */
  fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  /** Milliseconds; `performance.now` by default. */
  now?: () => number;
  /** 0 to 1; `Math.random` by default. Picks variants and detunes. */
  random?: () => number;
  /** Where the audio session lives; the page's `navigator` by default. */
  navigator?: Navigator;
  /** A media element's `canPlayType`, which picks the format to fetch first. */
  canPlayType?: (type: string) => string;
}

/** Other players' events are this much softer than the viewer's own. */
export const OTHER_DB = -6;
/**
 * A sound that cannot start this soon after it was asked for is dropped: a
 * tap's click must be on the tap, a game's end may come a moment after it.
 */
export const LATE_MS: Readonly<Record<Loudness, number>> = {
  ui: 200,
  event: 500,
  stinger: 1000,
};
/** "Your turn" is worth hearing late rather than not at all. */
export const HIDDEN_TAB_LATE_MS = 1000;
/** A bank no page holds is forgotten this long after, unless one takes it again. */
export const RELEASE_MS = 5000;
/** Without its own `minGapMs`, a sound repeated sooner than this is dropped. */
export const DEFAULT_MIN_GAP_MS = 40;
/** Without its own `maxVoices`, this many copies of a sound play at once. */
export const DEFAULT_MAX_VOICES = 4;
/** However many sounds ask, no more than this many play at once. */
export const MAX_VOICES = 16;

const dropped: Promise<boolean> = Promise.resolve(false);

/** Bus changes glide over about this long (a time constant), so they never click. */
const RAMP_S = 0.015;
/** A voice stopped to make room fades out over this long. */
const FADE_S = 0.01;

/** A slider's 0 to 1 as gain: its cube is close to how loudness feels. */
export function volumeToGain(volume: number): number {
  return Math.min(1, Math.max(0, volume)) ** 3;
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** How long after it was asked for `spec` may still start. */
export function lateMs(spec: SoundSpec): number {
  return spec.hiddenTab
    ? Math.max(HIDDEN_TAB_LATE_MS, LATE_MS[spec.loudness])
    : LATE_MS[spec.loudness];
}

function canPlayType(type: string): string {
  try {
    return document.createElement('audio').canPlayType(type);
  } catch {
    return '';
  }
}

/** Resolves when `promise` settles or after `ms`, whichever is first. */
function within(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    void promise.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.arrayBuffer();
}

interface Voice {
  readonly id: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

export class AudioEngine {
  private readonly createContext: (() => AudioContext) | null;
  private readonly fetchBytes: (url: string) => Promise<ArrayBuffer>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly navigator: Navigator | undefined;
  private readonly canPlayType: (type: string) => string;

  private ctx: AudioContext | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  /** Making a context threw: this browser has no working Web Audio. */
  private failed = false;
  /** The context has run at least once, so it may resume without a gesture. */
  private everRan = false;
  private resuming: Promise<void> | null = null;
  private settings: SoundSettings;
  private hidden = false;
  /** The format that decoded, once one has; until then, `canPlayType`'s pick. */
  private format: Format | null = null;
  private guessed: Format | null = null;
  /** Fetched files not yet decoded, by address; decoding takes them. */
  private readonly bytes = new Map<string, Promise<ArrayBuffer>>();
  /** Decoded or decoding buffers, by the variant's AAC address. */
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly retained = new Map<
    string,
    {
      spec: SoundSpec;
      count: number;
      release: ReturnType<typeof setTimeout> | null;
    }
  >();
  private readonly lastPlayed = new Map<string, number>();
  private readonly lastVariant = new Map<string, number>();
  private voices: Voice[] = [];
  private readonly listeners = new Set<() => void>();
  private lastState: EngineState;

  constructor(
    options: EngineOptions = {},
    settings: SoundSettings = DEFAULT_SOUND_SETTINGS,
  ) {
    this.createContext =
      options.createContext ??
      (typeof AudioContext === 'function'
        ? () => new AudioContext({ latencyHint: 'interactive' })
        : null);
    this.fetchBytes = options.fetchBytes ?? fetchBytes;
    this.now = options.now ?? (() => performance.now());
    this.random = options.random ?? Math.random;
    this.navigator =
      options.navigator ??
      (typeof navigator === 'undefined' ? undefined : navigator);
    this.canPlayType = options.canPlayType ?? canPlayType;
    this.settings = settings;
    this.lastState = this.state;
  }

  /** Whether this browser can play sound at all. */
  get supported(): boolean {
    return this.createContext !== null && !this.failed;
  }

  get state(): EngineState {
    if (!this.supported) return 'unsupported';
    return this.ctx?.state ?? 'locked';
  }

  /** Calls `listener` whenever `state` changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * From an event that grants user activation: makes the context the first
   * time, and resumes it whenever it is not running.
   */
  unlock(): void {
    if (!this.supported) return;
    if (!this.ctx) this.build();
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    void this.resume(ctx);
  }

  applySettings(next: SoundSettings): void {
    this.settings = next;
    if (!this.ctx || !this.buses) return;
    const at = this.ctx.currentTime;
    for (const [bus, node] of Object.entries(this.buses) as [Bus, GainNode][]) {
      node.gain.cancelScheduledValues(at);
      node.gain.setTargetAtTime(this.busGain(bus), at, RAMP_S);
    }
  }

  /**
   * A hidden page plays only the sounds marked `hiddenTab`; on return the
   * context is resumed, in case the browser suspended it meanwhile.
   */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!hidden && ctx && this.everRan && ctx.state !== 'running') {
      void this.resume(ctx);
    }
  }

  /**
   * Keeps these sounds ready: fetched at once, decoded from the first gesture
   * on. Calling the returned function as many times as they were retained
   * lets them go, after `RELEASE_MS`, so a bank the next page takes again (a
   * route change, React's development double mount) is neither fetched nor
   * decoded twice.
   */
  retain(specs: readonly SoundSpec[]): () => void {
    for (const spec of specs) {
      const entry = this.retained.get(spec.id) ?? {
        spec,
        count: 0,
        release: null,
      };
      entry.count += 1;
      if (entry.release !== null) clearTimeout(entry.release);
      entry.release = null;
      this.retained.set(spec.id, entry);
    }
    this.prepare(specs);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const spec of specs) {
        const entry = this.retained.get(spec.id);
        if (!entry) continue;
        entry.count -= 1;
        if (entry.count > 0 || entry.release !== null) continue;
        entry.release = setTimeout(() => this.forget(spec.id), RELEASE_MS);
      }
    };
  }

  /**
   * Plays one variant of `spec` on the effects bus. Resolves with whether it
   * started; it is dropped while locked, muted, hidden (unless `hiddenTab`),
   * inside its minimum gap, or when it could not start in time.
   */
  play(spec: SoundSpec, options: PlayOptions = {}): Promise<boolean> {
    const ctx = this.ctx;
    if (!ctx || !this.buses || ctx.state === 'closed') return dropped;
    if (this.busGain('effects') === 0) return dropped;
    if (this.hidden && !spec.hiddenTab) return dropped;
    if (spec.variants.length === 0) return dropped;
    const at = this.now();
    const last = this.lastPlayed.get(spec.id);
    if (
      last !== undefined &&
      at - last < (spec.minGapMs ?? DEFAULT_MIN_GAP_MS)
    ) {
      return dropped;
    }
    // A sound no page retained is kept only as long as a released one.
    if (!this.retained.has(spec.id)) this.retain([spec])();
    this.lastPlayed.set(spec.id, at);
    return this.start(
      ctx,
      spec,
      this.pickVariant(spec, options.variant),
      options,
      at,
    ).then((started) => {
      // A play that never started holds no gap against the next one.
      if (!started && this.lastPlayed.get(spec.id) === at) {
        if (last === undefined) this.lastPlayed.delete(spec.id);
        else this.lastPlayed.set(spec.id, last);
      }
      return started;
    });
  }

  /** Lets the context go; the next gesture makes a new one. */
  close(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.ctx = null;
    this.buses = null;
    for (const [id, entry] of this.retained) {
      if (entry.release === null) continue;
      clearTimeout(entry.release);
      this.retained.delete(id);
    }
    this.bytes.clear();
    this.buffers.clear();
    this.voices = [];
    this.resuming = null;
    this.everRan = false;
    void ctx.close().catch(() => {});
    this.notify();
  }

  private build(): void {
    // Safari: mix with the player's music and calls, and follow the silent
    // switch, as native casual games do. Set before the context exists.
    try {
      if (this.navigator?.audioSession) {
        this.navigator.audioSession.type = 'ambient';
      }
    } catch {
      // An audio session that refuses its type plays as it would have.
    }
    let ctx: AudioContext;
    try {
      ctx = this.createContext!();
    } catch {
      this.failed = true;
      this.notify();
      return;
    }
    // A limiter, so a burst of overlapping sounds cannot clip. Its threshold
    // sits at the files' own true-peak ceiling, so one sound never reaches it.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);
    const master = ctx.createGain();
    master.connect(limiter);
    const effects = ctx.createGain();
    effects.gain.value = this.busGain('effects');
    effects.connect(master);
    this.ctx = ctx;
    this.buses = { effects };
    ctx.addEventListener('statechange', () => this.notify());
    this.notify();
    this.prepare([...this.retained.values()].map(({ spec }) => spec));
  }

  private resume(ctx: AudioContext): Promise<void> {
    const attempt = ctx.resume().then(
      () => this.notify(),
      () => this.notify(),
    );
    this.resuming = attempt;
    void attempt.then(() => {
      if (this.resuming === attempt) this.resuming = null;
    });
    return attempt;
  }

  private notify(): void {
    const state = this.state;
    if (state === 'running') this.everRan = true;
    if (state === this.lastState) return;
    this.lastState = state;
    for (const listener of this.listeners) listener();
  }

  private busGain(bus: Bus): number {
    const { volume, muted } = this.settings[bus];
    return muted ? 0 : volumeToGain(volume);
  }

  /** Decodes `specs` once there is a context, and fetches them until then. */
  private prepare(specs: readonly SoundSpec[]): void {
    if (!this.supported) return;
    const ctx = this.ctx;
    for (const spec of specs) {
      for (const variant of spec.variants) {
        if (ctx) this.load(ctx, variant).catch(() => {});
        else this.fetchOnce(variant[this.preferred()]).catch(() => {});
      }
    }
  }

  private forget(id: string): void {
    const entry = this.retained.get(id);
    if (!entry || entry.count > 0) return;
    this.retained.delete(id);
    for (const variant of entry.spec.variants) {
      this.buffers.delete(variant.m4a);
      this.bytes.delete(variant.m4a);
      this.bytes.delete(variant.webm);
    }
  }

  /**
   * The format to fetch before anything has decoded: AAC wherever a media
   * element says it may play it, which is every browser but some Linux
   * builds; decoding still has the last word.
   */
  private preferred(): Format {
    if (this.format) return this.format;
    this.guessed ??=
      this.canPlayType('audio/mp4; codecs="mp4a.40.2"') === '' &&
      this.canPlayType('audio/webm; codecs="opus"') !== ''
        ? 'webm'
        : 'm4a';
    return this.guessed;
  }

  private fetchOnce(url: string): Promise<ArrayBuffer> {
    let pending = this.bytes.get(url);
    if (!pending) {
      const fetching = this.fetchBytes(url);
      pending = fetching;
      this.bytes.set(url, fetching);
      // A failure is forgotten, so a later play fetches again.
      fetching.catch(() => {
        if (this.bytes.get(url) === fetching) this.bytes.delete(url);
      });
    }
    return pending;
  }

  private load(ctx: AudioContext, variant: SoundVariant): Promise<AudioBuffer> {
    const key = variant.m4a;
    let pending = this.buffers.get(key);
    if (!pending) {
      const loading = this.decode(ctx, variant);
      pending = loading;
      this.buffers.set(key, loading);
      // A failure is forgotten, so a later play tries again.
      loading.catch(() => {
        if (this.buffers.get(key) === loading) this.buffers.delete(key);
      });
    }
    return pending;
  }

  /**
   * Decodes the format that worked before, or the preferred one, and the
   * other one when that fails: what a browser can decode is found by
   * decoding, since `canPlayType` does not say what `decodeAudioData` takes.
   */
  private async decode(
    ctx: AudioContext,
    variant: SoundVariant,
  ): Promise<AudioBuffer> {
    const order: Format[] =
      this.preferred() === 'webm' ? ['webm', 'm4a'] : ['m4a', 'webm'];
    let failure: unknown = new Error('No format decoded');
    for (const format of order) {
      const url = variant[format];
      // A failed fetch is not the format's fault, so it is not retried as one.
      const bytes = await this.fetchOnce(url);
      // Decoding detaches the bytes, so they are kept only until it runs.
      this.bytes.delete(url);
      try {
        const buffer = await ctx.decodeAudioData(bytes);
        this.format ??= format;
        return buffer;
      } catch (error) {
        failure = error;
      }
    }
    throw failure;
  }

  private pickVariant(spec: SoundSpec, chosen?: number): SoundVariant {
    const count = spec.variants.length;
    const last = this.lastVariant.get(spec.id);
    let index = 0;
    if (chosen !== undefined && Number.isFinite(chosen)) {
      // A step asked for by number, from 1; nothing random is rolled for it.
      index = Math.min(count, Math.max(1, Math.floor(chosen))) - 1;
    } else if (count > 1) {
      // Any but the last one, evenly.
      const others = last === undefined ? count : count - 1;
      index = Math.min(others - 1, Math.floor(this.random() * others));
      if (last !== undefined && index >= last) index += 1;
    }
    this.lastVariant.set(spec.id, index);
    return spec.variants[index]!;
  }

  private async start(
    ctx: AudioContext,
    spec: SoundSpec,
    variant: SoundVariant,
    options: PlayOptions,
    at: number,
  ): Promise<boolean> {
    let buffer: AudioBuffer;
    try {
      if (ctx.state !== 'running') {
        // Resuming without a gesture works only for a context that ran
        // before; a first resume is the gesture's, already under way.
        const resuming =
          this.resuming ?? (this.everRan ? this.resume(ctx) : null);
        if (!resuming) return false;
        await within(resuming, lateMs(spec) - (this.now() - at));
      }
      buffer = await this.load(ctx, variant);
    } catch {
      return false;
    }
    if (this.now() - at > lateMs(spec)) return false;
    const effects = this.buses?.effects;
    if (this.ctx !== ctx || !effects || ctx.state !== 'running') return false;
    if (this.hidden && !spec.hiddenTab) return false;
    if (this.busGain('effects') === 0) return false;

    this.makeRoom(spec);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const spread = spec.pitchSpread ?? 0;
    if (spread > 0) {
      const semitones = (this.random() * 2 - 1) * spread;
      source.playbackRate.value = 2 ** (semitones / 12);
    }
    const gain = ctx.createGain();
    gain.gain.value = dbToGain(spec.gainDb + (options.other ? OTHER_DB : 0));
    source.connect(gain);
    gain.connect(effects);
    const voice: Voice = { id: spec.id, source, gain };
    this.voices.push(voice);
    source.addEventListener('ended', () => {
      this.voices = this.voices.filter((v) => v !== voice);
      source.disconnect();
      gain.disconnect();
    });
    source.start();
    return true;
  }

  /** Stops the oldest copy past the sound's cap, and the oldest of all past the engine's. */
  private makeRoom(spec: SoundSpec): void {
    const max = Math.max(1, spec.maxVoices ?? DEFAULT_MAX_VOICES);
    const own = this.voices.filter((voice) => voice.id === spec.id);
    if (own.length >= max) this.stopVoice(own[0]!);
    if (this.voices.length >= MAX_VOICES) this.stopVoice(this.voices[0]!);
  }

  private stopVoice(voice: Voice): void {
    this.voices = this.voices.filter((v) => v !== voice);
    const at = this.ctx?.currentTime ?? 0;
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setTargetAtTime(0, at, FADE_S / 3);
    voice.source.stop(at + FADE_S);
  }
}
