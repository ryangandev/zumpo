import { render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { RoomBar } from './room-bar';

const render = (ui: ReactElement) =>
  renderRaw(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <LocaleProvider>{children}</LocaleProvider>
      </MemoryRouter>
    ),
  });

const phone = (room?: string) => (
  <RoomBar
    layout="phone"
    game="Draw & Guess"
    room={room}
    phase={{ tone: 'blue', label: 'Game over' }}
    onHowToPlay={() => {}}
    onLeave={() => {}}
  />
);

describe('RoomBar on a phone', () => {
  it('says the room and the phase under the game in one line', () => {
    render(phone('Friday night games with the family'));
    expect(screen.getByRole('banner').querySelector('p')).toHaveTextContent(
      'Friday night games with the family · Game over',
    );
  });

  it('keeps the phase, with its separator, apart from the room, so a long name gives way and the phase is never cut', () => {
    render(phone('Friday night games with the family'));
    const phase = screen.getByText(
      (_, el) => el?.textContent === ' · Game over',
    );
    expect(phase.tagName).toBe('SPAN');
    expect(phase.previousElementSibling).toHaveTextContent(
      'Friday night games with the family',
    );
  });

  it('says the phase alone, with no separator, where there is no room', () => {
    render(phone());
    expect(screen.getByRole('banner').querySelector('p')).toHaveTextContent(
      /^Game over$/,
    );
  });
});
