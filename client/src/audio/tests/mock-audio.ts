import {
  AudioBuffer as MockBuffer,
  AudioContext as MockContext,
  registrar,
  resetMockingImplementation,
  setMockingImplementation,
} from 'standardized-audio-context-mock';
import { afterEach, beforeEach, vi } from 'vitest';
import { AudioEngine, type EngineOptions } from '../engine';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from '../settings';
import type { SoundSpec } from '../types';

/*
 * An engine on standardized-audio-context-mock: the Web Audio graph without
 * audio. Its functions are a Proxy over vi.fn() without a `has` trap, so
 * Vitest's spy matchers do not see them; read `calls(fn)` instead.
 */

export const calls = (fn: unknown): unknown[][] =>
  (fn as { mock: { calls: unknown[][] } }).mock.calls;

type MockNode = {
  connect: unknown;
  gain: AudioParam;
};

export interface MockAudio {
  /** The context the engine made, once it has. */
  readonly context: MockContext | null;
  /** How many contexts the engine made. */
  readonly made: number;
  /** The address of each file fetched, in order. */
  readonly fetched: string[];
  /** Milliseconds the engine reads as now. */
  clock: number;
  /** What `random()` returns next, in order; 0 once they run out. */
  rolls: number[];
  /** Addresses whose bytes do not decode. */
  undecodable: Set<string>;
  /** Run while a file is fetched, before it returns: a slow network. */
  onFetch: ((url: string) => void) | null;
  /** Resuming never settles, as without user activation. */
  refuseResume: boolean;
  engine(settings?: SoundSettings, options?: EngineOptions): AudioEngine;
  sources(): AudioBufferSourceNode[];
  /** The address a source's buffer was decoded from. */
  urlOf(source: AudioBufferSourceNode): string | undefined;
  /** The gain node a source plays through. */
  voiceGain(source: AudioBufferSourceNode): GainNode;
  /** The effects bus: the gain every voice connects to. */
  effectsBus(): GainNode;
  /** Moves the context's clock on, so scheduled ramps take effect. */
  advance(seconds: number): void;
}

export function useMockAudio(): MockAudio {
  const audio = {
    context: null as MockContext | null,
    made: 0,
    fetched: [] as string[],
    clock: 0,
    rolls: [] as number[],
    undecodable: new Set<string>(),
    onFetch: null as ((url: string) => void) | null,
    refuseResume: false,
    bytes: new WeakMap<ArrayBuffer, string>(),
    buffers: new WeakMap<object, string>(),
    engine(
      settings: SoundSettings = DEFAULT_SOUND_SETTINGS,
      options: EngineOptions = {},
    ) {
      return new AudioEngine(
        {
          createContext: () => {
            const context = new MockContext();
            audio.context = context;
            audio.made += 1;
            if (audio.refuseResume) {
              context.resume = vi.fn<() => Promise<void>>(
                () => new Promise<void>(() => {}),
              );
            }
            context.decodeAudioData = ((bytes: ArrayBuffer) => {
              const url = audio.bytes.get(bytes) ?? '';
              if (audio.undecodable.has(url)) {
                return Promise.reject(new DOMException('bad', 'EncodingError'));
              }
              const buffer = new MockBuffer({
                length: 4800,
                sampleRate: 48000,
              });
              audio.buffers.set(buffer, url);
              return Promise.resolve(buffer);
            }) as never;
            return context as unknown as AudioContext;
          },
          fetchBytes: async (url) => {
            audio.fetched.push(url);
            audio.onFetch?.(url);
            const bytes = new ArrayBuffer(8);
            audio.bytes.set(bytes, url);
            return bytes;
          },
          now: () => audio.clock,
          random: () => audio.rolls.shift() ?? 0,
          navigator: {} as Navigator,
          ...options,
        },
        settings,
      );
    },
    sources() {
      if (!audio.context) return [];
      return registrar.getAudioNodes(
        audio.context as never,
        'AudioBufferSourceNode',
      ) as unknown as AudioBufferSourceNode[];
    },
    urlOf(source: AudioBufferSourceNode) {
      return source.buffer ? audio.buffers.get(source.buffer) : undefined;
    },
    voiceGain(source: AudioBufferSourceNode) {
      return calls((source as unknown as MockNode).connect)[0]![0] as GainNode;
    },
    effectsBus() {
      const [source] = audio.sources();
      if (source) {
        const gain = audio.voiceGain(source) as unknown as MockNode;
        return calls(gain.connect)[0]![0] as GainNode;
      }
      // Made in build(): master, then the effects bus.
      const gains = registrar.getAudioNodes(audio.context as never, 'GainNode');
      return gains[1] as unknown as GainNode;
    },
    advance(seconds: number) {
      // oxlint-disable-next-line typescript/no-explicit-any -- the mock's clock has no types
      (registrar.getDeLorean(audio.context as never) as any).travel(seconds);
    },
  };

  beforeEach(() => {
    audio.context = null;
    audio.made = 0;
    audio.fetched = [];
    audio.clock = 0;
    audio.rolls = [];
    audio.undecodable = new Set();
    audio.onFetch = null;
    audio.refuseResume = false;
    setMockingImplementation((impl) => vi.fn<typeof impl>(impl));
  });
  afterEach(() => {
    if (audio.context) registrar.reset(audio.context as never);
    resetMockingImplementation();
  });

  return audio;
}

/** A sound with one variant unless given more. */
export function spec(over: Partial<SoundSpec> = {}): SoundSpec {
  const id = over.id ?? 'tap';
  return {
    id,
    group: 'test',
    gainDb: 0,
    variants: [{ m4a: `${id}-1.m4a`, webm: `${id}-1.webm`, duration: 0.1 }],
    ...over,
  };
}

/** Lets the promises in flight settle. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
