import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AudioEngine } from './engine';
import { SoundProvider, useSoundControls, useSounds } from './provider';
import { calls, settle, spec, useMockAudio } from './tests/mock-audio';
import type { SoundBank } from './types';

const audio = useMockAudio();

const bank = {
  tap: spec({ id: 'tap' }),
  chime: spec({ id: 'chime' }),
} satisfies SoundBank;

function Page() {
  const play = useSounds(bank);
  const { available, state, settings, setVolume, setMuted } =
    useSoundControls();
  return (
    <>
      <p>
        {available ? state : 'none'}, {settings.effects.volume},{' '}
        {settings.effects.muted ? 'muted' : 'on'}
      </p>
      <button onClick={() => play('tap')}>Tap</button>
      <button onClick={() => play('chime', { other: true })}>Chime</button>
      <button onClick={() => setVolume('effects', 0.5)}>Half</button>
      <button onClick={() => setVolume('effects', 7)}>Too loud</button>
      <button onClick={() => setMuted('effects', true)}>Mute</button>
    </>
  );
}

function renderPage(engine: AudioEngine = audio.engine()) {
  return render(
    <StrictMode>
      <SoundProvider engine={engine}>
        <Page />
      </SoundProvider>
    </StrictMode>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe('SoundProvider', () => {
  it('starts with effects on at 70%, locked until the first gesture', () => {
    renderPage();
    expect(screen.getByText('locked, 0.7, on')).toBeInTheDocument();
  });

  it('starts with what this browser chose before', () => {
    localStorage.setItem(
      'zumpo:sound',
      '{"v":1,"effects":{"volume":0.3,"muted":true}}',
    );
    renderPage();
    expect(screen.getByText('locked, 0.3, muted')).toBeInTheDocument();
  });

  it('plays nothing before a gesture, and the sound after one', async () => {
    renderPage();
    // A click a script makes is no gesture: the engine stays locked.
    act(() => screen.getByRole('button', { name: 'Tap' }).click());
    await act(settle);
    expect(audio.made).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: 'Tap' }));
    await act(settle);
    expect(screen.getByText('running, 0.7, on')).toBeInTheDocument();
    const [source] = audio.sources();
    expect(calls(source!.start)).toHaveLength(1);
    expect(audio.urlOf(source!)).toBe('tap-1.m4a');
  });

  it("fetches the page's bank once at once, and decodes it at the first gesture", async () => {
    // StrictMode mounts twice; the second mount takes the bank straight back.
    renderPage();
    await act(settle);
    expect(audio.fetched.toSorted()).toEqual(['chime-1.m4a', 'tap-1.m4a']);
    expect(audio.decoded).toEqual([]);
    await userEvent.click(document.body);
    await act(settle);
    expect(audio.decoded.toSorted()).toEqual(['chime-1.m4a', 'tap-1.m4a']);
    expect(audio.fetched).toHaveLength(2);
  });

  it('remembers a new volume and mute, clamped, and applies them', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Half' }));
    expect(screen.getByText('running, 0.5, on')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('zumpo:sound')!)).toEqual({
      v: 1,
      effects: { volume: 0.5, muted: false },
    });
    audio.advance(1);
    expect(audio.effectsBus().gain.value).toBeCloseTo(0.125);

    await userEvent.click(screen.getByRole('button', { name: 'Too loud' }));
    expect(screen.getByText('running, 1, on')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(screen.getByText('running, 1, muted')).toBeInTheDocument();
    audio.clock = 1000;
    await userEvent.click(screen.getByRole('button', { name: 'Tap' }));
    await act(settle);
    expect(audio.sources()).toHaveLength(0);
  });

  it('follows a change made in another tab', () => {
    renderPage();
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'zumpo:sound',
          newValue: '{"v":1,"effects":{"volume":0.2,"muted":true}}',
        }),
      );
    });
    expect(screen.getByText('locked, 0.2, muted')).toBeInTheDocument();
  });

  it('says sound is unavailable without Web Audio, and plays without throwing', async () => {
    renderPage(new AudioEngine());
    expect(screen.getByText('none, 0.7, on')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tap' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chime' }));
  });

  it('lets the context go when it unmounts', async () => {
    const view = renderPage();
    await userEvent.click(document.body);
    await act(settle);
    view.unmount();
    expect(audio.context!.state).toBe('closed');
  });

  it('needs a provider above the hooks', () => {
    expect(() => render(<Page />)).toThrow(/SoundProvider/);
  });
});
