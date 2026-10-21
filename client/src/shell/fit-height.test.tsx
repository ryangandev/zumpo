import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onPhone } from '../tests/phone';
import { useFitHeight } from './fit-height';

/** Where the board starts on the page, and the footer under it. */
const TOP = 100;
const BELOW = 40;

/** The board's height unscaled: 1000 px of rows and keys, as laid out. */
let natural = 1000;
/** The column of cards beside the board, when there is one. */
let side = 0;
let observed: ResizeObserverCallback[] = [];

const zoomOf = (element: HTMLElement) =>
  Number.parseFloat(element.style.zoom) || 1;

function setWindowHeight(height: number) {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
}

function Board({ layout }: { layout?: string }) {
  const ref = useFitHeight<HTMLDivElement>(true, layout);
  return <div ref={ref} data-testid="board" />;
}

/** The board in its column, and a column of cards beside it. */
function BesideCards() {
  return (
    <div
      data-testid="row"
      style={{ display: 'grid', gridTemplateColumns: '600px 344px' }}
    >
      <div data-testid="column">
        <Board />
      </div>
      <div data-testid="side" />
    </div>
  );
}

const board = () => screen.getByTestId('board');

beforeEach(() => {
  natural = 1000;
  side = 0;
  observed = [];
  setWindowHeight(720);
  // jsdom lays nothing out: the board is as tall as its zoom makes it, and
  // the page ends a footer below it.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const played = natural * zoomOf(board());
      const height = {
        board: played,
        column: played,
        side,
        row: Math.max(played, side),
      }[this.dataset.testid ?? ''];
      return new DOMRect(0, TOP, 600, height ?? 0);
    },
  );
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(
    () => TOP + Math.max(natural * zoomOf(board()), side) + BELOW,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observed.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The board's bottom and the footer, against the window. */
const endsInWindow = () =>
  TOP + natural * zoomOf(board()) + BELOW <= window.innerHeight;

describe('useFitHeight', () => {
  it('scales a board down until it and the page under it end in the window', () => {
    render(<Board />);
    const zoom = zoomOf(board());
    expect(endsInWindow()).toBe(true);
    // As large as fits, to the search's step: (720 - 100 - 40 - 1) / 1000.
    expect(zoom).toBeGreaterThan(0.575);
    expect(zoom).toBeLessThanOrEqual(0.579);
  });

  it('makes no room for a longer column of cards beside it, which scrolls', () => {
    render(<BesideCards />);
    const zoom = zoomOf(board());
    expect(zoom).toBeGreaterThan(0.575);

    // A finished game's result and stats, longer than the window.
    side = 1400;
    act(() => observed.forEach((callback) => callback([], {} as never)));
    expect(zoomOf(board())).toBe(zoom);
  });

  it('leaves a board that fits as it is', () => {
    setWindowHeight(1200);
    render(<Board />);
    expect(board().style.zoom).toBe('');
  });

  it('keeps its scale as the board gets shorter, so it never grows mid-game', () => {
    render(<Board />);
    const zoom = zoomOf(board());
    // The keys go at the end; the rows alone would fit at a larger scale.
    natural = 800;
    act(() => observed.forEach((callback) => callback([], {} as never)));
    expect(zoomOf(board())).toBe(zoom);
  });

  it('measures again when the window changes size', () => {
    render(<Board />);
    expect(zoomOf(board())).toBeLessThan(1);

    setWindowHeight(1400);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(board().style.zoom).toBe('');

    setWindowHeight(720);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(endsInWindow()).toBe(true);
    expect(zoomOf(board())).toBeGreaterThan(0.575);
  });

  it('measures again when its layout changes, after the resize that changed it', () => {
    const { rerender } = render(<Board layout="keys under" />);
    const stacked = zoomOf(board());
    expect(stacked).toBeLessThan(0.58);

    // The window widens: its resize comes first, with the keys still under
    // the board, and only the next render puts them beside it.
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    natural = 600;
    act(() => observed.forEach((callback) => callback([], {} as never)));
    expect(zoomOf(board())).toBe(stacked);

    rerender(<Board layout="keys beside" />);
    expect(endsInWindow()).toBe(true);
    // (720 - 100 - 40 - 1) / 600, to the search's step.
    expect(zoomOf(board())).toBeGreaterThan(0.95);
  });

  it('stops at half size, below which the page scrolls instead', () => {
    natural = 3000;
    render(<Board />);
    expect(zoomOf(board())).toBe(0.5);
  });

  it('leaves the board alone on one column, where the page scrolls', () => {
    onPhone();
    render(<Board />);
    expect(board().style.zoom).toBe('');
    // Nor marks it, so the page keeps its own spacing.
    expect(board()).not.toHaveAttribute('data-fit-height');
  });

  it('marks a board it may scale', () => {
    render(<Board />);
    expect(board()).toHaveAttribute('data-fit-height');
  });
});
