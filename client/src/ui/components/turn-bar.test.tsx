import { render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { TurnBar } from './turn-bar';

const render = (ui: ReactElement) => renderRaw(ui, { wrapper: LocaleProvider });

/** Every element measures this wide, as the bar does on a phone or a desk. */
const barWidth = (width: number) =>
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);

const bar = (labelOnPhone?: boolean) => (
  <TurnBar
    label="Practice word"
    kind="status"
    main="Find the word"
    meta="Six guesses. Practice keeps no stats."
    labelOnPhone={labelOnPhone}
  />
);

describe('TurnBar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps its label on a phone unless the page already names it', () => {
    barWidth(328);
    const { rerender } = render(bar());
    expect(screen.getByText('Practice word')).toBeInTheDocument();

    // The meta then has the first line to itself.
    rerender(bar(false));
    expect(screen.queryByText('Practice word')).toBeNull();
    expect(
      screen.getByText('Six guesses. Practice keeps no stats.'),
    ).toBeInTheDocument();
  });

  it('keeps its label where the bar is wider than a phone', () => {
    barWidth(784);
    render(bar(false));
    expect(screen.getByText('Practice word')).toBeInTheDocument();
  });
});
