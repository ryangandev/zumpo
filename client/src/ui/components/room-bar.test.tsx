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

  it('keeps the phase apart, and the separator with the room, so a long name gives way and the phase is never cut', () => {
    render(phone('Friday night games with the family'));
    const phase = screen.getByText('Game over', { exact: true });
    expect(phase.previousElementSibling).toHaveTextContent(
      /^Friday night games with the family ·$/,
    );
  });

  it('says a lead before the phase, which gives way on its own', () => {
    render(
      <RoomBar
        layout="phone"
        game="Snap"
        room="Maya’s room"
        phase={{ tone: 'blue', label: '24 of 52 cards', lead: 'Watching' }}
        onHowToPlay={() => {}}
      />,
    );
    expect(screen.getByRole('banner').querySelector('p')).toHaveTextContent(
      'Maya’s room · Watching · 24 of 52 cards',
    );
    expect(
      screen.getByText('24 of 52 cards').previousElementSibling,
    ).toHaveTextContent(/^Watching ·$/);
  });

  it('says a lead in the phase’s tag on a desktop', () => {
    render(
      <RoomBar
        game="Snap"
        phase={{ tone: 'blue', label: '24 of 52 cards', lead: 'Watching' }}
        onHowToPlay={() => {}}
      />,
    );
    expect(screen.getByText('Watching · 24 of 52 cards')).toBeInTheDocument();
  });

  it('says the phase alone, with no separator, where there is no room', () => {
    render(phone());
    expect(screen.getByRole('banner').querySelector('p')).toHaveTextContent(
      /^Game over$/,
    );
  });
});
