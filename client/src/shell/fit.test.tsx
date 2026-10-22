import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Fit } from './fit';

/** The box Fit is given. */
const GIVEN = 300;
/** Each character's width unscaled. */
const CHAR = 10;
/**
 * Pixels a scaled line comes out wider than its scale says, as where a
 * platform rounds glyph advances at the scaled size (Chromium on Linux).
 */
let rounding = 0;

const words = () => screen.getByTestId('words');
/** Fit's piece, the words' parent, which takes the zoom. */
const zoom = () => Number.parseFloat(words().parentElement!.style.zoom) || 1;

/** The words' width: their characters, scaled, and what a scale rounds on. */
function wordsWidth(element: HTMLElement) {
  const scale = Number.parseFloat(element.parentElement?.style.zoom ?? '') || 1;
  const natural = (element.textContent ?? '').length * CHAR;
  return natural * scale + (scale < 1 ? rounding : 0);
}

beforeEach(() => {
  rounding = 0;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const inside = this.firstElementChild as HTMLElement | null;
      // The words; the piece, never wider than its box; the box.
      const width =
        this.dataset.testid === 'words'
          ? wordsWidth(this)
          : inside?.dataset.testid === 'words'
            ? Math.min(wordsWidth(inside), GIVEN)
            : GIVEN;
      return {
        left: 0,
        right: width,
        width,
        top: 0,
        bottom: 20,
        height: 20,
      } as DOMRect;
    },
  );
});

afterEach(() => vi.restoreAllMocks());

const line = (text: string) => (
  <Fit align="start">
    <span data-testid="words">{text}</span>
  </Fit>
);

describe('Fit', () => {
  it('scales a line too wide for its box down to it', () => {
    render(line('x'.repeat(40)));
    expect(zoom()).toBeCloseTo(0.75);
    expect(wordsWidth(words())).toBeLessThanOrEqual(GIVEN);
  });

  it('brings the scale down further where scaled text comes out wider', () => {
    rounding = 3;
    render(line('x'.repeat(40)));
    expect(zoom()).toBeLessThan(0.75);
    expect(wordsWidth(words())).toBeLessThanOrEqual(GIVEN);
  });

  it('scales its words again when they change while too wide', async () => {
    const { rerender } = render(line('x'.repeat(40)));
    // Still too wide, the piece keeps its box's width, so no resize says so.
    await act(async () => rerender(line('x'.repeat(60))));
    expect(zoom()).toBeCloseTo(0.5);
    expect(wordsWidth(words())).toBeLessThanOrEqual(GIVEN);
  });
});
