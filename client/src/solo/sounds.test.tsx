import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createReplayGuard, SoundProvider, type DeriveSounds } from '../audio';
import { AudioEngine } from '../audio/engine';
import { uiSounds } from '../audio/generated/ui';
import {
  deriveSoloSounds,
  endAlone,
  finishEnd,
  SOLO_BANK,
  useSoloSounds,
  type SoloEnd,
  type SoloSoundView,
} from './sounds';

/** A game on your own of taps: each one counted. */
interface Taps {
  taps: number;
}

const BANK = { ...SOLO_BANK, 'ui-tap': uiSounds['ui-tap'] };

const tapped: DeriveSounds<Taps, 'ui-tap'> = (prev, next) =>
  next.taps > prev.taps ? [{ sound: 'ui-tap', key: `tap:${next.taps}` }] : [];

const view = (taps: number, end: SoloEnd | null = null) => ({
  game: { taps },
  end,
});

const guard = () =>
  createReplayGuard(deriveSoloSounds(tapped), {
    isNewGame: () => false,
    select: endAlone,
  });

const sounds = (events: { sound: string }[]) => events.map((e) => e.sound);

describe('a game on your own, heard', () => {
  it('plays nothing for its first state, then each move once', () => {
    const game = guard();
    expect(game.observe(view(3))).toEqual([]);
    expect(game.observe(view(4))).toEqual([
      { sound: 'ui-tap', key: 'game:tap:4' },
    ]);
    expect(game.observe(view(4))).toEqual([]);
  });

  it('hears the move that ends it as its end alone, once', () => {
    const game = guard();
    game.observe(view(3));
    expect(game.observe(view(4, 'best'))).toEqual([
      { sound: 'stinger-new-best', key: 'end' },
    ]);
    // A render after the end, with the end still there, is silent.
    expect(game.observe(view(4, 'best'))).toEqual([]);
  });

  it('plays nothing for a game restored already over', () => {
    const game = guard();
    expect(game.observe(view(9, 'loss'))).toEqual([]);
    expect(game.observe(view(9, 'loss'))).toEqual([]);
  });

  it('plays each end its own stinger', () => {
    const ends: Record<SoloEnd, string> = {
      complete: 'stinger-solo-complete',
      best: 'stinger-new-best',
      loss: 'stinger-solo-loss',
    };
    for (const [end, stinger] of Object.entries(ends)) {
      const game = guard();
      game.observe(view(0));
      expect(sounds(game.observe(view(0, end as SoloEnd)))).toEqual([stinger]);
    }
  });

  it('calls a finish a new best only when it beat one kept before', () => {
    expect(finishEnd({ previous: 120_000, isBest: true })).toBe('best');
    expect(finishEnd({ previous: null, isBest: true })).toBe('complete');
    expect(finishEnd({ previous: 60_000, isBest: false })).toBe('complete');
  });
});

function Game({ state }: { state: SoloSoundView<Taps> }) {
  useSoloSounds(state.game, state.end, { bank: BANK, derive: tapped });
  return null;
}

describe('useSoloSounds', () => {
  it('plays a page’s moves and its end through the engine, from its first state on', () => {
    const engine = new AudioEngine({});
    const play = vi
      .spyOn(engine, 'play')
      .mockImplementation(() => Promise.resolve(true));
    const page = (state: SoloSoundView<Taps>) => (
      <StrictMode>
        <SoundProvider engine={engine}>
          <Game state={state} />
        </SoundProvider>
      </StrictMode>
    );
    const played = () => play.mock.calls.map(([spec]) => spec.id);
    const app = render(page(view(2)));
    expect(played()).toEqual([]);
    app.rerender(page(view(3)));
    app.rerender(page(view(4, 'complete')));
    app.rerender(page(view(4, 'complete')));
    expect(played()).toEqual(['ui-tap', 'stinger-solo-complete']);

    // A refresh on the finished game: a new page, a new first state.
    app.unmount();
    play.mockClear();
    render(page(view(4, 'complete')));
    expect(played()).toEqual([]);
  });
});
