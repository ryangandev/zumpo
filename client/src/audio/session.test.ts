import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectAudioSession } from './session';
import { settle, spec, useMockAudio } from './tests/mock-audio';

const audio = useMockAudio();

function hide(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  hide(false);
});

describe('connectAudioSession', () => {
  it.each([
    [
      'a mouse press',
      () => new PointerEvent('pointerdown', { pointerType: 'mouse' }),
    ],
    ['a tap', () => new PointerEvent('pointerup', { pointerType: 'touch' })],
    ['an older touch', () => new Event('touchend')],
    ['a key', () => new KeyboardEvent('keydown', { key: 'a' })],
  ])('unlocks at %s anywhere on the page', async (_, gesture) => {
    const engine = audio.engine();
    const disconnect = connectAudioSession(engine);
    expect(engine.state).toBe('locked');
    document.body.dispatchEvent(gesture());
    await settle();
    expect(engine.state).toBe('running');
    disconnect();
  });

  it("takes no script's event for a gesture outside the tests", () => {
    vi.stubEnv('MODE', 'production');
    const engine = audio.engine();
    const disconnect = connectAudioSession(engine);
    window.dispatchEvent(
      new PointerEvent('pointerdown', { pointerType: 'mouse' }),
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(engine.state).toBe('locked');
    expect(audio.made).toBe(0);
    disconnect();
    vi.unstubAllEnvs();
  });

  it('takes a finger at its lift and a mouse at its press, as browsers do', () => {
    const engine = audio.engine();
    const disconnect = connectAudioSession(engine);
    // A touch's press may begin a scroll; a mouse's release follows its press.
    window.dispatchEvent(
      new PointerEvent('pointerdown', { pointerType: 'touch' }),
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', { pointerType: 'mouse' }),
    );
    expect(audio.made).toBe(0);
    disconnect();
  });

  it('does not take Escape as a gesture, as browsers do not', () => {
    const engine = audio.engine();
    const disconnect = connectAudioSession(engine);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(engine.state).toBe('locked');
    disconnect();
  });

  it('stops listening once running, and listens again after an interruption', async () => {
    const engine = audio.engine();
    const unlock = vi.spyOn(engine, 'unlock');
    const disconnect = connectAudioSession(engine);
    window.dispatchEvent(new PointerEvent('pointerup'));
    await settle();
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(unlock).toHaveBeenCalledOnce();

    // A call or Siri takes the audio: the context leaves running.
    await audio.context!.suspend();
    audio.context!.dispatchEvent(new Event('statechange'));
    window.dispatchEvent(new PointerEvent('pointerup'));
    await settle();
    expect(unlock).toHaveBeenCalledTimes(2);
    expect(engine.state).toBe('running');
    disconnect();
  });

  it('tells the engine when the page is hidden and shown', async () => {
    const engine = audio.engine();
    const disconnect = connectAudioSession(engine);
    window.dispatchEvent(new PointerEvent('pointerup'));
    await settle();
    hide(true);
    expect(await engine.play(spec())).toBe(false);
    hide(false);
    expect(await engine.play(spec())).toBe(true);
    disconnect();
  });

  it('starts hidden when the page loads in a background tab', async () => {
    hide(true);
    const engine = audio.engine();
    const disconnect = connectAudioSession(engine);
    window.dispatchEvent(new PointerEvent('pointerup'));
    await settle();
    expect(await engine.play(spec())).toBe(false);
    disconnect();
  });

  it('listens to nothing once disconnected', () => {
    const engine = audio.engine();
    const unlock = vi.spyOn(engine, 'unlock');
    const setHidden = vi.spyOn(engine, 'setHidden');
    connectAudioSession(engine)();
    window.dispatchEvent(new PointerEvent('pointerup'));
    hide(true);
    expect(unlock).not.toHaveBeenCalled();
    expect(setHidden).toHaveBeenCalledOnce();
  });
});
