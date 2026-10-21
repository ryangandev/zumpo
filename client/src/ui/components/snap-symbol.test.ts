import { describe, expect, it } from 'vitest';
import { SYMBOLS } from '../../../../shared/snap';
import { snapSymbols } from '../generated/snap-symbols';

describe('the Snap symbols drawn from Figma', () => {
  it('are the symbols the rules name, in the same order', () => {
    expect(snapSymbols.map((symbol) => symbol.name.toLowerCase())).toEqual([
      ...SYMBOLS,
    ]);
  });
});
