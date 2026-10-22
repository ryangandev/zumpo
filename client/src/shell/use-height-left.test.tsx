import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onPhone } from '../tests/phone';
import { useHeightLeft } from './use-height-left';

/**
 * A room's page, 900 px high and shorter than the window: a sheet whose top
 * is 300 px down, a Done row of 80 under it in the stage, the side column
 * beside them, and the main content stretched to the page's foot, 74 px of
 * gap, footer and padding.
 */
const WINDOW = 900;
const TOP = 300;
const SHEET = 400;
const DONE = 80;
const FOOT = 74;

function Sheet({ toEnd = true }: { toEnd?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useHeightLeft(ref, true, toEnd);
  return <div ref={ref} data-testid="sheet" />;
}

function RoomPage({
  toEnd,
  columns = '600px 344px',
}: {
  toEnd?: boolean;
  columns?: string;
}) {
  return (
    <main data-testid="main">
      <div style={{ display: 'grid', gridTemplateColumns: columns }}>
        <div data-testid="column">
          <Sheet toEnd={toEnd} />
          <div data-testid="done" />
        </div>
        <div data-testid="side" />
      </div>
    </main>
  );
}

const sheet = () => screen.getByTestId('sheet');
const heightLeft = () =>
  Number.parseFloat(sheet().style.getPropertyValue('--height-left'));

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: WINDOW,
  });
  const bottoms: Record<string, number> = {
    sheet: TOP + SHEET,
    column: TOP + SHEET + DONE,
    main: WINDOW - FOOT,
  };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const id = this.dataset.testid ?? '';
      const bottom = bottoms[id] ?? TOP;
      return new DOMRect(0, TOP, 600, bottom - TOP);
    },
  );
  // The page is no taller than the window, though its content ends higher.
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(
    WINDOW,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
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

describe('useHeightLeft', () => {
  it('leaves the window under the element', () => {
    render(<RoomPage toEnd={false} />);
    expect(heightLeft()).toBe(WINDOW - TOP);
    expect(sheet()).not.toHaveAttribute('data-fit-height');
  });

  it('to the end of the play area, less what follows in its column and the foot', () => {
    render(<RoomPage />);
    // Never the empty page under the content, which would shrink a sheet
    // sized by it each time it is measured.
    expect(heightLeft()).toBe(WINDOW - TOP - DONE - FOOT);
  });

  it('marks it so the page tightens on a short window, beside a side column', () => {
    render(<RoomPage />);
    expect(sheet()).toHaveAttribute('data-fit-height');
  });

  it('in one column, less only the foot, and leaves the page as it is', () => {
    // The side's cards follow the stage, and the page scrolls to them.
    onPhone();
    render(<RoomPage columns="600px" />);
    expect(heightLeft()).toBe(WINDOW - TOP - FOOT);
    expect(sheet()).not.toHaveAttribute('data-fit-height');
  });
});
