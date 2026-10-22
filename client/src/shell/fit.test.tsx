import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Fit } from './fit';

/** The box Fit is given. */
const GIVEN = 300;
/** The room around Fit's box, which hugs its words up to it. */
let room = GIVEN;
/** The words beside the box in its room, which take their width from it. */
const beside = () =>
  (document.querySelector('[data-testid="beside"]')?.textContent?.length ?? 0) *
  CHAR;
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

/** Every ResizeObserver's callback with what it watches. */
let observers: { callback: () => void; watched: Element[] }[] = [];

beforeEach(() => {
  rounding = 0;
  room = GIVEN;
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      watched: Element[] = [];
      constructor(callback: () => void) {
        observers.push({ callback, watched: this.watched });
      }
      observe(target: Element) {
        this.watched.push(target);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const held = this.querySelector<HTMLElement>('[data-testid="words"]');
      // The words; the piece and the box, as wide as the words up to what
      // the room leaves beside the words next to them; the room.
      const width =
        this.dataset.testid === 'words'
          ? wordsWidth(this)
          : held && this.dataset.testid !== 'room'
            ? Math.min(wordsWidth(held), room - beside())
            : room;
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it('leaves the room around a box it is given unwatched', () => {
    render(<div data-testid="room">{line('x'.repeat(40))}</div>);
    const parent = screen.getByTestId('room');
    expect(observers.some(({ watched }) => watched.includes(parent))).toBe(
      false,
    );
  });

  it('scales its words up again when the words beside a hugging box shrink', async () => {
    const row = (next: string) => (
      <div data-testid="room">
        <Fit align="start" hugs>
          <span data-testid="words">{'x'.repeat(25)}</span>
        </Fit>
        <span data-testid="beside">{next}</span>
      </div>
    );
    const { rerender } = render(row('y'.repeat(10)));
    expect(zoom()).toBeCloseTo(200 / 250);
    // The words and the room stay as they were: only what is beside shrinks.
    await act(async () => rerender(row('y'.repeat(2))));
    expect(zoom()).toBe(1);
  });

  it('scales its words up again when the room around a hugging box grows', () => {
    render(
      <div data-testid="room">
        <Fit align="start" hugs>
          <span data-testid="words">{'x'.repeat(40)}</span>
        </Fit>
      </div>,
    );
    expect(zoom()).toBeCloseTo(0.75);
    // The box hugs the scaled words, so only the room around it changes.
    room = 600;
    const grown = screen.getByTestId('room');
    act(() => {
      for (const { callback, watched } of observers) {
        if (watched.includes(grown)) callback();
      }
    });
    expect(zoom()).toBe(1);
  });
});
