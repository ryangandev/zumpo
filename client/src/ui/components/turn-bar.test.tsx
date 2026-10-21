import { render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { SHORT_SCREEN } from '../../shell/use-media-query';
import { TurnBar } from './turn-bar';

const render = (ui: ReactElement) => renderRaw(ui, { wrapper: LocaleProvider });

/** Every element measures this wide, as the bar does on a phone or a desk. */
const barWidth = (width: number) =>
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);

/** A short screen, such as a phone on its side: the compact row at any width. */
const onShortScreen = () => {
  const desktop = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    ...desktop(query),
    matches: query === SHORT_SCREEN,
  }));
};

const bar = (props: { labelOnPhone?: boolean; category?: string } = {}) => (
  <TurnBar
    label="Practice word"
    kind="status"
    main="Find the word"
    meta="Six guesses. Practice keeps no stats."
    {...props}
  />
);

const section = () => screen.getByRole('region', { name: 'Turn' });

/** The bar's meta line. */
const line = () => section().querySelector('[class*="meta"]');

describe('TurnBar', () => {
  it('shows its label on a phone unless the page already names it', () => {
    barWidth(328);
    const { rerender } = render(bar());
    expect(section().className).not.toMatch(/unlabelled/);

    // The meta then has the first line to itself, and a screen reader still
    // hears the label.
    rerender(bar({ labelOnPhone: false }));
    expect(section().className).toMatch(/unlabelled/);
    expect(section().className).toMatch(/untagged/);
    expect(screen.getByText('Practice word')).toBeInTheDocument();
  });

  it('leaves the label out beside a tag too', () => {
    barWidth(328);
    render(bar({ labelOnPhone: false, category: 'Animals' }));
    expect(section().className).toMatch(/unlabelled/);
    expect(section().className).not.toMatch(/untagged/);
    expect(screen.getByText('Animals')).toBeInTheDocument();
  });

  it('shows its label where the bar is wider than a phone', () => {
    barWidth(784);
    render(bar({ labelOnPhone: false }));
    expect(section().className).not.toMatch(/unlabelled/);
  });

  it('gives the meta a line of its own on a phone, kept while it is empty', () => {
    barWidth(328);
    const { container, rerender } = render(bar());
    expect(container.firstElementChild!.className).toMatch(/narrow/);
    expect(line()).toHaveTextContent('Six guesses. Practice keeps no stats.');

    // Without a meta the line stays, so the board under the bar keeps its place.
    rerender(
      <TurnBar label="Your turn" kind="status" main="Place a black stone" />,
    );
    expect(line()).toBeInTheDocument();
    expect(line()).toBeEmptyDOMElement();
  });

  it('scales a label a little too long to its line, and wraps one much too long', () => {
    barWidth(200);
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get');
    scroll.mockReturnValue(220);
    const { rerender } = render(bar());
    const label = screen.getByText('Practice word');
    expect(label.style.transform).toMatch(/^scale\(0\.9/);
    expect(label).not.toHaveAttribute('data-wrap');

    // Shrunk past reading, it wraps instead, and is never cut.
    scroll.mockReturnValue(400);
    rerender(
      <TurnBar
        label="Time ran out, so this one was picked for you"
        kind="word"
        main="Teemo"
      />,
    );
    const long = screen.getByText(/^Time ran out/);
    expect(long.style.transform).toBe('');
    expect(long).toHaveAttribute('data-wrap');
  });

  it('is where the focus waits while a game has nothing for the viewer to do', () => {
    barWidth(784);
    render(bar());
    expect(section()).toHaveAttribute('data-start-fallback');
    expect(section()).toHaveAttribute('tabindex', '-1');
  });

  it('shows its label on a short wide window, in the compact row', () => {
    onShortScreen();
    barWidth(784);
    const { container } = render(bar({ labelOnPhone: false }));
    expect(container.firstElementChild!.className).toMatch(/phone/);
    expect(section().className).not.toMatch(/unlabelled/);
  });

  it('keeps the compact row at a phone’s width where the game asks', () => {
    barWidth(328);
    const { container } = render(
      <TurnBar
        label="Your turn"
        kind="status"
        main="Place a black stone"
        stackOnPhone={false}
      />,
    );
    expect(container.firstElementChild!.className).toMatch(/phone/);
    expect(container.firstElementChild!.className).not.toMatch(/narrow/);
    expect(line()).not.toBeInTheDocument();
  });

  it('keeps one first line on a short screen, beside the board, however narrow', () => {
    onShortScreen();
    barWidth(328);
    const { container } = render(
      <TurnBar label="Your turn" kind="status" main="Place a black stone" />,
    );
    expect(container.firstElementChild!.className).toMatch(/phone/);
    expect(container.firstElementChild!.className).not.toMatch(/narrow/);
    // No meta, and no line kept for one: the height goes to the board.
    expect(line()).not.toBeInTheDocument();
  });
});
