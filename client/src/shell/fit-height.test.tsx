import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onPhone } from '../tests/phone';
import {
  KeptScale,
  scaleKeeper,
  useFitHeight,
  type FitHeight,
} from './fit-height';

/** Where the board starts on the page, and the footer under it. */
let top = 100;
let below = 40;
/** What comes under the board in its column, such as a room's standings. */
let after = 0;

/** The board's height unscaled: 1000 px of rows and keys, as laid out. */
let natural = 1000;
/** The column of cards beside the board, when there is one. */
let side = 0;
let observed: ResizeObserverCallback[] = [];
/** What each observer watches, by its callback. */
let watched = new Map<ResizeObserverCallback, Element[]>();
/** Callbacks waiting for the next frame. */
let frames: FrameRequestCallback[] = [];

const zoomOf = (element: HTMLElement) =>
  Number.parseFloat(element.style.zoom) || 1;

function setWindowHeight(height: number) {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
}

function Board({ layout, fit = true }: { layout?: string; fit?: FitHeight }) {
  const ref = useFitHeight<HTMLDivElement>(fit, layout);
  return <div ref={ref} data-testid="board" />;
}

/**
 * A room's page: its turn bar, then its board, and whatever comes under the
 * board at the end, then the page's foot.
 */
function Room({ fit = 'room' }: { fit?: FitHeight }) {
  return (
    <main data-testid="main">
      <div data-testid="bar" />
      <Board fit={fit} />
    </main>
  );
}

/** A board on your own, a bar over it and a status row under it. */
function Solo() {
  return (
    <div>
      <div data-testid="bar" />
      <Board />
      <div data-testid="status" />
    </div>
  );
}

/** Reports a size change of `element` to whatever watches it. */
function resized(element: Element) {
  act(() => {
    for (const [callback, targets] of watched) {
      if (targets.includes(element)) callback([], {} as never);
    }
  });
}

/** Runs the callbacks waiting for the next frame. */
function nextFrame() {
  act(() => {
    const waiting = frames;
    frames = [];
    // forEach skips the frames cancelled since.
    waiting.forEach((callback) => callback(0));
  });
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
  top = 100;
  below = 40;
  after = 0;
  observed = [];
  watched = new Map();
  frames = [];
  setWindowHeight(720);
  // jsdom lays nothing out: the board is as tall as its zoom makes it, what
  // comes after it in its column follows, and the page ends a footer below.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const played = natural * zoomOf(board());
      const height = {
        board: played,
        column: played + after,
        main: played + after,
        side,
        row: Math.max(played + after, side),
      }[this.dataset.testid ?? ''];
      return new DOMRect(0, top, 600, height ?? 0);
    },
  );
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(
    () => top + Math.max(natural * zoomOf(board()) + after, side) + below,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {
        observed.push(callback);
        watched.set(callback, []);
      }
      observe(target: Element) {
        watched.get(this.callback)?.push(target);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    frames.push(callback),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    delete frames[id - 1];
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The board's bottom and the footer, against the window. */
const endsInWindow = () =>
  top + natural * zoomOf(board()) + below <= window.innerHeight;

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

  it('fits a room board as a board on your own, to the page foot', () => {
    render(<Room />);
    const zoom = zoomOf(board());
    expect(endsInWindow()).toBe(true);
    expect(zoom).toBeGreaterThan(0.575);
    expect(zoom).toBeLessThanOrEqual(0.579);
  });

  it('makes no room in a room for what comes under the board at the end', () => {
    // The standings under a finished board scroll with the page.
    after = 300;
    render(<Room />);
    expect(zoomOf(board())).toBeGreaterThan(0.575);
  });

  it('gives a room board drawn anew at the end the scale the game had', () => {
    const kept = scaleKeeper();
    const { unmount } = render(
      <KeptScale value={kept}>
        <Room />
      </KeptScale>,
    );
    const zoom = zoomOf(board());
    expect(zoom).toBeLessThan(1);
    unmount();

    // The finished board is shorter, without the strip that was under it,
    // and would fit at a larger scale.
    natural = 800;
    render(
      <KeptScale value={kept}>
        <Room fit="result" />
      </KeptScale>,
    );
    expect(zoomOf(board())).toBe(zoom);
    // It holds the scale as it is measured again, until the window changes.
    act(() => observed.forEach((callback) => callback([], {} as never)));
    expect(zoomOf(board())).toBe(zoom);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(zoomOf(board())).toBeGreaterThan(zoom);
    expect(endsInWindow()).toBe(true);
  });

  it('measures a finished room board afresh in another window, or with none kept', () => {
    const kept = scaleKeeper();
    const { unmount } = render(
      <KeptScale value={kept}>
        <Room />
      </KeptScale>,
    );
    unmount();
    setWindowHeight(1400);
    const { unmount: gone } = render(
      <KeptScale value={kept}>
        <Room fit="result" />
      </KeptScale>,
    );
    expect(board().style.zoom).toBe('');
    gone();

    // Somebody who came in to watch the results.
    setWindowHeight(720);
    render(
      <KeptScale value={scaleKeeper()}>
        <Room fit="result" />
      </KeptScale>,
    );
    expect(endsInWindow()).toBe(true);
    expect(zoomOf(board())).toBeGreaterThan(0.575);
  });

  it('measures a room board again a frame after the bar over it grows', () => {
    render(<Room />);
    const zoom = zoomOf(board());

    // The turn bar takes a second line for its hints and moves the board
    // down; the board's own size is as it was.
    top = 126;
    resized(screen.getByTestId('bar'));
    // Not in the observer's pass, so the new scale is not reported back in it.
    expect(zoomOf(board())).toBe(zoom);
    nextFrame();
    expect(endsInWindow()).toBe(true);
    expect(zoomOf(board())).toBeLessThan(zoom);
  });

  it('keeps a board on your own at its size when a row comes under it', () => {
    render(<Solo />);
    const zoom = zoomOf(board());

    // A status row comes under the board at the end, and the bar over it
    // grows: the page grows by both, the board's own size is as it was.
    below = 90;
    top = 126;
    resized(screen.getByTestId('status'));
    resized(screen.getByTestId('bar'));
    resized(document.body);
    nextFrame();
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
