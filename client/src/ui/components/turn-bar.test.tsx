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

  it('shows its label on a short wide window, in the compact row', () => {
    onShortScreen();
    barWidth(784);
    const { container } = render(bar({ labelOnPhone: false }));
    expect(container.firstElementChild!.className).toMatch(/phone/);
    expect(section().className).not.toMatch(/unlabelled/);
  });
});
