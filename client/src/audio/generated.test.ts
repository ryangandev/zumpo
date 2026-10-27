import { describe, expect, it } from 'vitest';
import { inlineLimit } from '../../vite.config';
import { SOUND_BANKS, SOUND_IDS } from './generated';
import { testSounds } from './generated/test';

describe('the generated sounds', () => {
  it('list every id, and a bank per group', async () => {
    expect(SOUND_IDS).toContain('test-blip');
    expect(await SOUND_BANKS.test()).toBe(testSounds);
  });

  it('point at their files, both formats, never at inlined data', () => {
    for (const sound of Object.values(testSounds)) {
      for (const variant of sound.variants) {
        expect(variant.m4a).toMatch(/\/files\/test-blip-\d\.m4a$/);
        expect(variant.webm).toMatch(/\/files\/test-blip-\d\.webm$/);
        expect(variant.duration).toBeGreaterThan(0);
      }
    }
  });

  it('are never inlined by the build, whose CSP would refuse a data: URL', () => {
    expect(inlineLimit('/src/audio/generated/files/test-blip-1.m4a')).toBe(
      false,
    );
    expect(inlineLimit('/src/audio/generated/files/test-blip-1.webm')).toBe(
      false,
    );
    expect(inlineLimit('/src/ui/glyph.svg')).toBeUndefined();
  });
});
