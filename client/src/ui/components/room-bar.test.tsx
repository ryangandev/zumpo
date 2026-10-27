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

describe('RoomBar with sound', () => {
  const sound = {
    volume: 0.7,
    muted: false,
    onVolumeChange: () => {},
    onMutedChange: () => {},
  };

  it('puts the speaker after the room’s own buttons, before the avatar', () => {
    render(
      <RoomBar
        layout="phone"
        game="Liar’s Dice"
        phase={{ tone: 'blue', label: 'Round 1' }}
        onHowToPlay={() => {}}
        onLeave={() => {}}
        viewer={{ initials: 'SA', tone: 'blue', label: 'You are Sam' }}
        sound={sound}
      />,
    );
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toEqual(['How to play', 'Leave room', 'Sound on']);
    const speaker = screen.getByRole('button', { name: 'Sound on' });
    expect(
      speaker.compareDocumentPosition(screen.getByLabelText('You are Sam')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows no speaker where there is no sound to set', () => {
    render(phone());
    expect(screen.queryByRole('button', { name: /^Sound/ })).toBeNull();
  });
});
