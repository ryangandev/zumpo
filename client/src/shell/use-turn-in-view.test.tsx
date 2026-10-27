import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onPhone } from '../tests/phone';
import { useTurnInView } from './use-turn-in-view';

/**
 * A phone 548 px tall whose page is `PAGE` px, its padding 12, and the turn
 * bar 162 px down it, under the room bar, the tabs and the standings.
 */
const WINDOW = 548;
const TURN = 162;
const PADDING = 12;

function Room({ phase, field = false }: { phase: string; field?: boolean }) {
  const turn = useRef<HTMLElement>(null);
  useTurnInView(turn, phase);
  return (
    <div style={{ paddingTop: PADDING }}>
      <main>
        <section ref={turn} data-testid="turn" />
        {field && <input aria-label="Guess" />}
      </main>
    </div>
  );
}

let page = WINDOW;
const scrollTo = vi.fn<(options: ScrollToOptions) => void>();

beforeEach(() => {
  page = WINDOW;
  scrollTo.mockClear();
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: WINDOW,
  });
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(
    () => page,
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, TURN, 335, 110),
  );
  vi.stubGlobal('scrollTo', scrollTo);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useTurnInView', () => {
  it('scrolls a phone page past the window to the turn bar, the padding over it', () => {
    onPhone();
    page = 900;
    render(<Room phase="1.1.drawing" />);
    expect(scrollTo).toHaveBeenCalledWith({
      top: TURN - PADDING,
      behavior: 'instant',
    });
  });

  it('no further than the page goes', () => {
    onPhone();
    page = 620;
    render(<Room phase="1.1.drawing" />);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 620 - WINDOW,
      behavior: 'instant',
    });
  });

  it('again as each phase starts', () => {
    onPhone();
    page = 900;
    const { rerender } = render(<Room phase="1.1.choosing" />);
    rerender(<Room phase="1.1.choosing" />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    rerender(<Room phase="1.1.drawing" />);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('not where the page fits the window', () => {
    onPhone();
    render(<Room phase="1.1.drawing" />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('not off a phone', () => {
    page = 900;
    render(<Room phase="1.1.drawing" />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('not while the viewer is typing', () => {
    onPhone();
    page = 900;
    const { rerender, getByLabelText } = render(
      <Room phase="1.1.choosing" field />,
    );
    scrollTo.mockClear();
    getByLabelText('Guess').focus();
    rerender(<Room phase="1.1.drawing" field />);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
