import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AudioEngine } from '../audio/engine';
import { useMockAudio } from '../audio/tests/mock-audio';
import { minesweeperState } from '../tests/fixtures';
import { renderApp } from '../tests/render-app';
import { renderSeated } from '../tests/seated';

const audio = useMockAudio();

const speaker = (name: RegExp | string = /^Sound (on|off)$/) =>
  screen.getByRole('button', { name });

afterEach(() => localStorage.removeItem('zumpo:sound'));

describe('the speaker', () => {
  it('sits before the avatar on a page, and opens the sound menu', async () => {
    const user = userEvent.setup();
    await renderApp('/', { engine: audio.engine() });
    const avatar = screen.getByRole('button', { name: /: your name$/ });
    expect(speaker('Sound on').compareDocumentPosition(avatar)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await user.click(speaker());
    expect(screen.getByRole('dialog', { name: 'Sound' })).toBeInTheDocument();
  });

  it('mutes and sets the volume for this browser, kept when the page opens again', async () => {
    const user = userEvent.setup();
    const first = await renderApp('/', { engine: audio.engine() });
    await user.click(speaker());
    const menu = screen.getByRole('dialog', { name: 'Sound' });
    await user.click(
      within(menu).getByRole('button', { name: 'Mute sound effects' }),
    );
    expect(speaker('Sound off')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('zumpo:sound')!)).toEqual({
      v: 1,
      effects: { volume: 0.7, muted: true },
    });
    // The thumb is hidden in jsdom, which lays nothing out (sound-menu.test).
    within(menu).getByRole('slider', { hidden: true }).focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(JSON.parse(localStorage.getItem('zumpo:sound')!)).toEqual({
      v: 1,
      effects: { volume: 0.6, muted: false },
    });
    first.unmount();

    await renderApp('/', { engine: audio.engine() });
    await user.click(speaker('Sound on'));
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('is in a seated room’s bar, before the avatar', async () => {
    await renderSeated(minesweeperState(), { engine: audio.engine() });
    const bar = screen.getByRole('banner');
    expect(
      within(bar).getByRole('button', { name: 'Sound on' }),
    ).toBeInTheDocument();
  });

  it('stays, with the focus on it, when the engine fails at the first gesture', async () => {
    const user = userEvent.setup();
    const engine = audio.engine(undefined, {
      createContext: () => {
        throw new DOMException('No audio device', 'NotSupportedError');
      },
    });
    await renderApp('/', { engine });
    await user.click(speaker('Sound on'));
    expect(engine.state).toBe('unsupported');
    expect(speaker('Sound on')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Sound' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(speaker('Sound on')).toHaveFocus();
  });

  it('is not shown where the browser has no Web Audio', async () => {
    await renderApp('/', { engine: new AudioEngine() });
    expect(screen.queryByRole('button', { name: /^Sound/ })).toBeNull();
  });
});
