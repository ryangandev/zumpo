import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AudioEngine,
  dbToGain,
  DEFAULT_MAX_VOICES,
  HIDDEN_TAB_LATE_MS,
  LATE_MS,
  MAX_VOICES,
  OTHER_DB,
  RELEASE_MS,
  volumeToGain,
} from './engine';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from './settings';
import { calls, settle, spec, useMockAudio } from './tests/mock-audio';

const audio = useMockAudio();

afterEach(() => {
  vi.useRealTimers();
});

const at = (volume: number, muted = false): SoundSettings => ({
  effects: { volume, muted },
});

/** Every file from now on takes `ms` to arrive. */
const late = (ms: number) => {
  audio.onFetch = () => {
    audio.clock += ms;
  };
};

/** An engine past its first gesture, its context running. */
async function unlocked(settings?: SoundSettings) {
  const engine = audio.engine(settings);
  engine.unlock();
  await settle();
  return engine;
}

describe('unlocking', () => {
  it('makes no context and plays nothing before a gesture, but fetches what is retained', async () => {
    const engine = audio.engine();
    engine.retain([spec()]);
    expect(engine.state).toBe('locked');
    expect(await engine.play(spec())).toBe(false);
    expect(audio.made).toBe(0);
    // Fetched ahead, so the first gesture only has to decode.
    expect(audio.fetched).toEqual(['tap-1.m4a']);
    engine.unlock();
    await settle();
    expect(await engine.play(spec())).toBe(true);
    expect(audio.fetched).toEqual(['tap-1.m4a']);
  });

  it('fetches Opus first where a media element cannot play AAC', async () => {
    const engine = audio.engine(undefined, {
      canPlayType: (type) => (type.startsWith('audio/webm') ? 'probably' : ''),
    });
    engine.retain([spec()]);
    expect(audio.fetched).toEqual(['tap-1.webm']);
  });

  it('fetches nothing without Web Audio', () => {
    // jsdom has no AudioContext of its own.
    const engine = audio.engine(undefined, { createContext: undefined });
    expect(engine.state).toBe('unsupported');
    engine.retain([spec()]);
    expect(audio.fetched).toEqual([]);
  });

  it('makes the context at the first gesture, resumes it, and plays after', async () => {
    const engine = audio.engine();
    const changes = vi.fn<() => void>();
    engine.subscribe(changes);
    engine.unlock();
    expect(audio.made).toBe(1);
    await settle();
    expect(engine.state).toBe('running');
    expect(changes).toHaveBeenCalled();
    expect(await engine.play(spec())).toBe(true);
    const [source] = audio.sources();
    expect(calls(source!.start)).toHaveLength(1);
    expect(audio.urlOf(source!)).toBe('tap-1.m4a');
  });

  it('plays a sound asked for while the first resume is still under way', async () => {
    const engine = audio.engine();
    engine.unlock();
    // No settle: the gesture that unlocked it also asked for the sound.
    expect(await engine.play(spec())).toBe(true);
  });

  it('makes one context however many gestures come', async () => {
    const engine = audio.engine();
    engine.unlock();
    engine.unlock();
    await settle();
    engine.unlock();
    expect(audio.made).toBe(1);
  });

  it('asks Safari for an ambient audio session before making the context', () => {
    const session = { type: 'auto' } as AudioSession;
    const engine = audio.engine(undefined, {
      navigator: { audioSession: session } as Navigator,
    });
    expect(session.type).toBe('auto');
    engine.unlock();
    expect(session.type).toBe('ambient');
  });

  it('carries on when the audio session refuses its type', async () => {
    const session = {} as AudioSession;
    Object.defineProperty(session, 'type', {
      set() {
        throw new Error('nope');
      },
    });
    const engine = audio.engine(undefined, {
      navigator: { audioSession: session } as Navigator,
    });
    engine.unlock();
    await settle();
    expect(engine.state).toBe('running');
  });

  it('resumes a context the system suspended, without a gesture, as it ran before', async () => {
    const engine = await unlocked();
    await audio.context!.suspend();
    expect(await engine.play(spec())).toBe(true);
    expect(engine.state).toBe('running');
  });

  it('lets the context go on close, and makes a new one at the next gesture', async () => {
    const engine = await unlocked();
    engine.close();
    expect(engine.state).toBe('locked');
    expect(await engine.play(spec())).toBe(false);
    engine.unlock();
    await settle();
    expect(audio.made).toBe(2);
    expect(await engine.play(spec())).toBe(true);
  });
});

describe('without Web Audio', () => {
  it('is unsupported, and every call is a quiet no-op', async () => {
    // jsdom has no AudioContext, like a browser without Web Audio.
    const engine = new AudioEngine();
    expect(engine.supported).toBe(false);
    expect(engine.state).toBe('unsupported');
    expect(() => engine.unlock()).not.toThrow();
    engine.retain([spec()])();
    engine.setHidden(true);
    engine.applySettings(at(0.2));
    expect(await engine.play(spec())).toBe(false);
    engine.close();
  });

  it('is unsupported when making a context throws', async () => {
    const engine = audio.engine(undefined, {
      createContext: () => {
        throw new Error('NotSupportedError');
      },
    });
    const changes = vi.fn<() => void>();
    engine.subscribe(changes);
    expect(() => engine.unlock()).not.toThrow();
    expect(engine.state).toBe('unsupported');
    expect(changes).toHaveBeenCalledOnce();
    expect(await engine.play(spec())).toBe(false);
  });
});

describe('the effects bus', () => {
  it('starts at the cube of the slider: 70% is about -9 dB', async () => {
    await unlocked(DEFAULT_SOUND_SETTINGS);
    expect(audio.effectsBus().gain.value).toBeCloseTo(0.343);
    expect(volumeToGain(0.7)).toBeCloseTo(0.343);
  });

  it('glides to a new volume, and to silence when muted', async () => {
    const engine = await unlocked();
    const bus = audio.effectsBus();
    engine.applySettings(at(0.5));
    audio.advance(1);
    expect(bus.gain.value).toBeCloseTo(0.125);
    engine.applySettings(at(0.5, true));
    audio.advance(1);
    expect(bus.gain.value).toBeCloseTo(0);
  });

  it('plays nothing while muted or at zero', async () => {
    const engine = await unlocked(at(0.8, true));
    expect(await engine.play(spec())).toBe(false);
    engine.applySettings(at(0));
    expect(await engine.play(spec())).toBe(false);
    expect(audio.sources()).toHaveLength(0);
    engine.applySettings(at(0.8));
    expect(await engine.play(spec())).toBe(true);
  });

  it("plays each sound at its own gain, and another player's 6 dB softer", async () => {
    const engine = await unlocked();
    await engine.play(spec({ id: 'mine', gainDb: -3 }));
    await engine.play(spec({ id: 'theirs', gainDb: -3 }), { other: true });
    const [mine, theirs] = audio.sources();
    expect(audio.voiceGain(mine!).gain.value).toBeCloseTo(dbToGain(-3));
    expect(audio.voiceGain(theirs!).gain.value).toBeCloseTo(
      dbToGain(-3 + OTHER_DB),
    );
    expect(audio.effectsBus()).toBe(
      calls(audio.voiceGain(theirs!).connect)[0]![0],
    );
  });
});

describe('variety', () => {
  const two = spec({
    minGapMs: 0,
    variants: [
      { m4a: 'a.m4a', webm: 'a.webm', duration: 0.1 },
      { m4a: 'b.m4a', webm: 'b.webm', duration: 0.1 },
      { m4a: 'c.m4a', webm: 'c.webm', duration: 0.1 },
    ],
  });

  it('picks a variant at random, never the same one twice in a row', async () => {
    const engine = await unlocked();
    audio.rolls = [0.5, 0.4, 0.9, 0];
    for (let i = 0; i < 4; i += 1) await engine.play(two);
    // 0.5 of three is b; then of the two others (a, c): 0.4 is a, 0.9 is c,
    // 0 is a.
    expect(audio.sources().map((s) => audio.urlOf(s))).toEqual([
      'b.m4a',
      'a.m4a',
      'c.m4a',
      'a.m4a',
    ]);
  });

  it('plays the variant asked for by number, from 1, rolling nothing', async () => {
    const engine = await unlocked();
    audio.rolls = [0.99];
    for (const variant of [1, 3, 3, 9, 0]) await engine.play(two, { variant });
    // A step may repeat, unlike a take; past the ends it plays the nearest.
    expect(audio.sources().map((s) => audio.urlOf(s))).toEqual([
      'a.m4a',
      'c.m4a',
      'c.m4a',
      'c.m4a',
      'a.m4a',
    ]);
    expect(audio.rolls).toEqual([0.99]);
  });

  it('detunes each play by up to its pitch spread, in semitones', async () => {
    const engine = await unlocked();
    const spread = spec({ pitchSpread: 2, minGapMs: 0 });
    audio.rolls = [1, 0, 0.5];
    for (let i = 0; i < 3; i += 1) await engine.play(spread);
    const rates = audio.sources().map((s) => s.playbackRate.value);
    expect(rates[0]).toBeCloseTo(2 ** (2 / 12));
    expect(rates[1]).toBeCloseTo(2 ** (-2 / 12));
    expect(rates[2]).toBeCloseTo(1);
  });

  it('plays at its own pitch without a spread, and rolls nothing for it', async () => {
    const engine = await unlocked();
    audio.rolls = [0.99];
    await engine.play(spec());
    expect(audio.sources()[0]!.playbackRate.value).toBe(1);
    expect(audio.rolls).toEqual([0.99]);
  });
});

describe('limits', () => {
  it('drops a repeat inside its minimum gap', async () => {
    const engine = await unlocked();
    const tick = spec({ minGapMs: 100 });
    expect(await engine.play(tick)).toBe(true);
    audio.clock = 99;
    expect(await engine.play(tick)).toBe(false);
    audio.clock = 100;
    expect(await engine.play(tick)).toBe(true);
    // Another sound is not held up by this one's gap.
    expect(await engine.play(spec({ id: 'other' }))).toBe(true);
  });

  it('holds a step only against itself: the next step plays in the same tick', async () => {
    const engine = await unlocked();
    const streak = spec({
      minGapMs: 100,
      steps: true,
      variants: [
        { m4a: 'a.m4a', webm: 'a.webm', duration: 0.1 },
        { m4a: 'b.m4a', webm: 'b.webm', duration: 0.1 },
      ],
    });
    expect(await engine.play(streak, { variant: 1 })).toBe(true);
    expect(await engine.play(streak, { variant: 2 })).toBe(true);
    expect(await engine.play(streak, { variant: 2 })).toBe(false);
    expect(audio.sources().map((s) => audio.urlOf(s))).toEqual([
      'a.m4a',
      'b.m4a',
    ]);
  });

  it('warns in development when a stepped sound plays without its step', async () => {
    const engine = await unlocked();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await engine.play(spec({ id: 'streak', steps: true }));
    expect(warn).toHaveBeenCalledWith(
      'Sound "streak" is stepped: say which step to play.',
    );
    warn.mockClear();
    await engine.play(spec({ id: 'streak', steps: true }), { variant: 1 });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops a repeat inside 40 ms without a gap of its own', async () => {
    const engine = await unlocked();
    expect(await engine.play(spec())).toBe(true);
    audio.clock = 39;
    expect(await engine.play(spec())).toBe(false);
  });

  it('stops the oldest copy past its voice cap', async () => {
    const engine = await unlocked();
    const tap = spec({ minGapMs: 0, maxVoices: 2 });
    for (let i = 0; i < 3; i += 1) await engine.play(tap);
    const [first, second, third] = audio.sources();
    expect(calls(first!.stop)).toHaveLength(1);
    expect(calls(second!.stop)).toHaveLength(0);
    expect(calls(third!.stop)).toHaveLength(0);
  });

  it(`keeps ${DEFAULT_MAX_VOICES} copies without a cap of its own`, async () => {
    const engine = await unlocked();
    const tap = spec({ minGapMs: 0 });
    for (let i = 0; i <= DEFAULT_MAX_VOICES; i += 1) await engine.play(tap);
    expect(calls(audio.sources()[0]!.stop)).toHaveLength(1);
  });

  it(`never plays more than ${MAX_VOICES} sounds at once`, async () => {
    const engine = await unlocked();
    for (let i = 0; i <= MAX_VOICES; i += 1) {
      await engine.play(spec({ id: `sound-${i}` }));
    }
    const stopped = audio.sources().filter((s) => calls(s.stop).length > 0);
    expect(stopped).toEqual([audio.sources()[0]]);
  });

  it('drops a sound that could not start in time, rather than play it late', async () => {
    const engine = await unlocked();
    audio.onFetch = () => {
      audio.clock += LATE_MS.ui + 1;
    };
    expect(await engine.play(spec())).toBe(false);
    expect(audio.sources()).toHaveLength(0);
  });

  it('waits longer for a louder class, and longest for "your turn"', async () => {
    const engine = await unlocked();
    late(LATE_MS.ui + 1);
    expect(await engine.play(spec({ id: 'move', loudness: 'event' }))).toBe(
      true,
    );
    late(LATE_MS.event + 1);
    expect(await engine.play(spec({ id: 'win', loudness: 'stinger' }))).toBe(
      true,
    );
    late(LATE_MS.event + 1);
    expect(await engine.play(spec({ id: 'turn', hiddenTab: true }))).toBe(true);
    late(HIDDEN_TAB_LATE_MS + 1);
    expect(await engine.play(spec({ id: 'turn-2', hiddenTab: true }))).toBe(
      false,
    );
  });

  it('holds no gap after a play that never started', async () => {
    const engine = await unlocked();
    const tick = spec({ minGapMs: 1000 });
    audio.undecodable = new Set(['tap-1.m4a', 'tap-1.webm']);
    expect(await engine.play(tick)).toBe(false);
    audio.undecodable.clear();
    expect(await engine.play(tick)).toBe(true);
    expect(await engine.play(tick)).toBe(false);
  });
});

describe('a hidden page', () => {
  it('plays only the sounds marked hiddenTab', async () => {
    const engine = await unlocked();
    engine.setHidden(true);
    expect(await engine.play(spec({ id: 'tap' }))).toBe(false);
    expect(await engine.play(spec({ id: 'turn', hiddenTab: true }))).toBe(true);
    engine.setHidden(false);
    expect(await engine.play(spec({ id: 'tap' }))).toBe(true);
  });

  it('resumes a suspended context on return', async () => {
    const engine = await unlocked();
    engine.setHidden(true);
    await audio.context!.suspend();
    engine.setHidden(false);
    await settle();
    expect(engine.state).toBe('running');
  });

  it('does not resume a context that never ran: only a gesture may', async () => {
    audio.refuseResume = true;
    const engine = audio.engine();
    engine.unlock();
    await settle();
    expect(engine.state).toBe('suspended');
    expect(calls(audio.context!.resume)).toHaveLength(1);
    engine.setHidden(true);
    engine.setHidden(false);
    expect(await engine.play(spec())).toBe(false);
    expect(calls(audio.context!.resume)).toHaveLength(1);
  });
});

describe('decoding', () => {
  it('decodes AAC, and Opus where AAC does not decode, then tries Opus first', async () => {
    const engine = await unlocked();
    audio.undecodable.add('tap-1.m4a');
    expect(await engine.play(spec())).toBe(true);
    expect(audio.urlOf(audio.sources()[0]!)).toBe('tap-1.webm');
    expect(await engine.play(spec({ id: 'drum' }))).toBe(true);
    expect(audio.fetched).toEqual(['tap-1.m4a', 'tap-1.webm', 'drum-1.webm']);
  });

  it('drops a sound neither format decodes, and tries again next time', async () => {
    const engine = await unlocked();
    audio.undecodable = new Set(['tap-1.m4a', 'tap-1.webm']);
    expect(await engine.play(spec({ minGapMs: 0 }))).toBe(false);
    audio.undecodable.clear();
    expect(await engine.play(spec({ minGapMs: 0 }))).toBe(true);
  });

  it('decodes a file once however often it plays', async () => {
    const engine = await unlocked();
    const tap = spec({ minGapMs: 0 });
    await Promise.all([engine.play(tap), engine.play(tap), engine.play(tap)]);
    expect(audio.fetched).toEqual(['tap-1.m4a']);
    expect(audio.sources()).toHaveLength(3);
  });

  it('decodes what is retained at the first gesture, and forgets it a while after release', async () => {
    const engine = audio.engine();
    const release = engine.retain([spec()]);
    const again = engine.retain([spec()]);
    await settle();
    expect(audio.fetched).toEqual(['tap-1.m4a']);
    engine.unlock();
    await settle();
    expect(audio.decoded).toEqual(['tap-1.m4a']);

    vi.useFakeTimers();
    release();
    release();
    again();
    // The last page let it go, and the next took it straight back.
    const next = engine.retain([spec()]);
    next();
    vi.advanceTimersByTime(RELEASE_MS - 1);
    expect(await engine.play(spec())).toBe(true);
    expect(audio.fetched).toEqual(['tap-1.m4a']);

    vi.advanceTimersByTime(1);
    audio.clock = 1000;
    expect(await engine.play(spec())).toBe(true);
    expect(audio.fetched).toEqual(['tap-1.m4a', 'tap-1.m4a']);
  });

  it('keeps a sound no page retained only as long as a released one', async () => {
    const engine = await unlocked();
    vi.useFakeTimers();
    expect(await engine.play(spec())).toBe(true);
    vi.advanceTimersByTime(RELEASE_MS - 1);
    audio.clock = 1000;
    expect(await engine.play(spec())).toBe(true);
    expect(audio.fetched).toEqual(['tap-1.m4a']);
    vi.advanceTimersByTime(1);
    audio.clock = 2000;
    expect(await engine.play(spec())).toBe(true);
    expect(audio.fetched).toEqual(['tap-1.m4a', 'tap-1.m4a']);
  });
});
