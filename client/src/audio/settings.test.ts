import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSound, watchSound, writeSound } from '../net/storage';
import {
  DEFAULT_SOUND_SETTINGS,
  parseSoundSettings,
  serializeSoundSettings,
  type SoundSettings,
} from './settings';

const changed = (key: string | null, newValue: string | null) =>
  window.dispatchEvent(new StorageEvent('storage', { key, newValue }));

afterEach(() => {
  localStorage.clear();
});

describe('parseSoundSettings', () => {
  it('reads what serializeSoundSettings wrote', () => {
    const settings = { effects: { volume: 0.25, muted: true } };
    expect(
      parseSoundSettings(JSON.parse(serializeSoundSettings(settings))),
    ).toEqual(settings);
    expect(serializeSoundSettings(settings)).toBe(
      '{"v":1,"effects":{"volume":0.25,"muted":true}}',
    );
  });

  it('turns down nothing usable, and another version', () => {
    expect(parseSoundSettings(null)).toBeNull();
    expect(parseSoundSettings('loud')).toBeNull();
    expect(
      parseSoundSettings({ effects: { volume: 1, muted: false } }),
    ).toBeNull();
    expect(
      parseSoundSettings({ v: 2, effects: { volume: 1, muted: false } }),
    ).toBeNull();
  });

  it('keeps volume within 0 to 1, and takes defaults for what is missing or wrong', () => {
    expect(parseSoundSettings({ v: 1, effects: { volume: 4 } })).toEqual({
      effects: { volume: 1, muted: false },
    });
    expect(
      parseSoundSettings({ v: 1, effects: { volume: 'max', muted: 1 } }),
    ).toEqual(DEFAULT_SOUND_SETTINGS);
    // A stored value from before a bus existed, or with one since removed.
    expect(parseSoundSettings({ v: 1, music: { volume: 0.2 } })).toEqual(
      DEFAULT_SOUND_SETTINGS,
    );
  });

  it('starts effects on at 70%', () => {
    expect(DEFAULT_SOUND_SETTINGS).toEqual({
      effects: { volume: 0.7, muted: false },
    });
  });
});

describe('sound in storage', () => {
  it('is remembered for this browser under zumpo:sound', () => {
    expect(readSound()).toBeNull();
    writeSound({ effects: { volume: 0.4, muted: true } });
    expect(localStorage.getItem('zumpo:sound')).toBe(
      '{"v":1,"effects":{"volume":0.4,"muted":true}}',
    );
    expect(readSound()).toEqual({ effects: { volume: 0.4, muted: true } });
  });

  it('keeps a bus a newer build added, which this one does not know', () => {
    localStorage.setItem(
      'zumpo:sound',
      '{"v":1,"effects":{"volume":0.7,"muted":false},"music":{"volume":0.2,"muted":true}}',
    );
    writeSound({ effects: { volume: 0.4, muted: false } });
    expect(JSON.parse(localStorage.getItem('zumpo:sound')!)).toEqual({
      v: 1,
      effects: { volume: 0.4, muted: false },
      music: { volume: 0.2, muted: true },
    });
    // Another version's value is not this build's to keep.
    localStorage.setItem('zumpo:sound', '{"v":2,"music":{"volume":0.2}}');
    writeSound({ effects: { volume: 0.4, muted: false } });
    expect(JSON.parse(localStorage.getItem('zumpo:sound')!)).toEqual({
      v: 1,
      effects: { volume: 0.4, muted: false },
    });
  });

  it('reads a malformed entry as nothing', () => {
    localStorage.setItem('zumpo:sound', '{oops');
    expect(readSound()).toBeNull();
  });

  it('survives storage that refuses to work', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(readSound()).toBeNull();
    expect(() => writeSound(DEFAULT_SOUND_SETTINGS)).not.toThrow();
  });

  it('hears another tab change it, or clear it', () => {
    const onChange = vi.fn<(settings: SoundSettings | null) => void>();
    const stop = watchSound(onChange);
    changed('zumpo:locale', 'zh');
    changed('zumpo:sound', '{"v":1,"effects":{"volume":0.1,"muted":false}}');
    changed(null, null);
    stop();
    changed('zumpo:sound', '{"v":1,"effects":{"volume":0.9,"muted":false}}');
    expect(onChange.mock.calls).toEqual([
      [{ effects: { volume: 0.1, muted: false } }],
      [null],
    ]);
  });
});
