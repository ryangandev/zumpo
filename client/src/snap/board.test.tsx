import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../../../shared/snap';
import { LocaleProvider } from '../i18n';
import { SnapBoard } from './board';

const FIRST: Card = [0, 1, 2, 3, 4, 5];
const SECOND: Card = [0, 6, 7, 8, 9, 10];
const THIRD: Card = [1, 6, 11, 12, 13, 14];

/** Where each card stands on screen: the middle card 400 px left of yours. */
const ON_SCREEN = {
  'Middle card': new DOMRect(100, 50, 200, 200),
  'Your card': new DOMRect(500, 50, 200, 200),
};

afterEach(() => {
  vi.restoreAllMocks();
  // jsdom has no Web Animations; the test lends the cards one.
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});

/** The board, zoomed by `zoom` as a board fitted to its room is. */
function Board({
  zoom,
  middle,
  mine,
}: {
  zoom: number;
  middle: Card;
  mine: Card;
}) {
  return (
    <LocaleProvider>
      <div style={{ zoom }}>
        <SnapBoard
          middle={{ symbols: middle, label: 'Middle card' }}
          mine={{ symbols: mine, label: 'Your card' }}
        />
      </div>
    </LocaleProvider>
  );
}

describe('SnapBoard', () => {
  it('slides a won card over by its distance on screen, in a zoomed board too', () => {
    const animate =
      vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => void>();
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as never,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const label = this.parentElement?.querySelector('h2')?.textContent;
        return (
          ON_SCREEN[label as keyof typeof ON_SCREEN] ?? new DOMRect(0, 0, 0, 0)
        );
      },
    );

    const { rerender } = render(
      <Board zoom={0.5} middle={SECOND} mine={FIRST} />,
    );
    // Yours wins the middle card: it slides in from where the middle card was.
    rerender(<Board zoom={0.5} middle={THIRD} mine={SECOND} />);

    const starts = animate.mock.calls.map(([frames]) => frames[0]?.transform);
    // 400 px on screen is 800 px inside a board at half size.
    expect(starts).toContain('translate(-800px, 0px) scale(1)');
  });
});
