import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { SoundMenu } from './sound-menu';

/** The menu over a setting of its own, as the shell keeps one. */
function Speaker({
  volume: initialVolume = 0.7,
  muted: initialMuted = false,
  onVolumeChange,
}: {
  volume?: number;
  muted?: boolean;
  onVolumeChange?: (volume: number) => void;
}) {
  const [volume, setVolume] = useState(initialVolume);
  const [muted, setMuted] = useState(initialMuted);
  return (
    <SoundMenu
      volume={volume}
      muted={muted}
      onVolumeChange={(next) => {
        onVolumeChange?.(next);
        setVolume(next);
      }}
      onMutedChange={setMuted}
    />
  );
}

const renderSpeaker = (ui = <Speaker />) =>
  render(ui, { wrapper: LocaleProvider });

/**
 * The volume. An edge-aligned thumb stays hidden until Base UI has measured
 * the track, which jsdom, laying nothing out, never lets it do, and a hidden
 * element has no accessible name: its label is read off the attribute.
 */
const slider = () =>
  within(screen.getByRole('dialog')).getByRole('slider', { hidden: true });

afterEach(() => localStorage.removeItem('zumpo:locale'));

describe('SoundMenu', () => {
  it('names the speaker by whether sound is on, and opens the menu under it', async () => {
    const user = userEvent.setup();
    renderSpeaker();
    await user.click(screen.getByRole('button', { name: 'Sound on' }));
    const menu = screen.getByRole('dialog', { name: 'Sound' });
    expect(within(menu).getByText('Sound effects')).toBeInTheDocument();
    expect(within(menu).getByText('70%')).toBeInTheDocument();
    expect(slider()).toHaveAttribute('aria-label', 'Sound effects volume');
    expect(slider()).toHaveAttribute('aria-valuetext', '70%');
  });

  it('mutes with a toggle that says it is pressed, and the speaker says sound is off', async () => {
    const user = userEvent.setup();
    renderSpeaker();
    await user.click(screen.getByRole('button', { name: 'Sound on' }));
    const mute = screen.getByRole('button', { name: 'Mute sound effects' });
    expect(mute).toHaveAttribute('aria-pressed', 'false');
    await user.click(mute);
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(slider()).toHaveAttribute('aria-valuetext', '70%, muted');
    expect(
      screen.getByRole('button', { name: 'Sound off' }),
    ).toBeInTheDocument();
  });

  it('moves by 5 with the arrow keys, and turns muted sound back on', async () => {
    const user = userEvent.setup();
    const onVolumeChange = vi.fn<(volume: number) => void>();
    renderSpeaker(<Speaker muted onVolumeChange={onVolumeChange} />);
    await user.click(screen.getByRole('button', { name: 'Sound off' }));
    slider().focus();
    await user.keyboard('{ArrowRight}');
    expect(onVolumeChange).toHaveBeenLastCalledWith(0.75);
    expect(slider()).toHaveAttribute('aria-valuetext', '75%');
    expect(
      screen.getByRole('button', { name: 'Mute sound effects' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('{End}');
    expect(onVolumeChange).toHaveBeenLastCalledWith(1);
  });

  it('says sound is off at 0 too, the toggle still unpressed', async () => {
    const user = userEvent.setup();
    renderSpeaker(<Speaker volume={0.05} />);
    await user.click(screen.getByRole('button', { name: 'Sound on' }));
    slider().focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mute sound effects' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: 'Sound off' }),
    ).toBeInTheDocument();
  });

  it('groups the row under its visible label', async () => {
    const user = userEvent.setup();
    renderSpeaker();
    await user.click(screen.getByRole('button', { name: 'Sound on' }));
    const row = within(screen.getByRole('dialog')).getByRole('group', {
      name: 'Sound effects',
    });
    expect(
      within(row).getByRole('button', { name: 'Mute sound effects' }),
    ).toBeInTheDocument();
  });

  it('says it all in Chinese', async () => {
    localStorage.setItem('zumpo:locale', 'zh');
    const user = userEvent.setup();
    renderSpeaker(<Speaker muted />);
    await user.click(screen.getByRole('button', { name: '声音已关' }));
    const menu = screen.getByRole('dialog', { name: '声音' });
    expect(
      within(menu).getByRole('group', { name: '音效' }),
    ).toBeInTheDocument();
    expect(within(menu).getByText('关')).toBeInTheDocument();
    expect(
      within(menu).getByRole('button', { name: '音效静音' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(slider()).toHaveAttribute('aria-label', '音效音量');
    expect(slider()).toHaveAttribute('aria-valuetext', '70%，已静音');
  });
});
