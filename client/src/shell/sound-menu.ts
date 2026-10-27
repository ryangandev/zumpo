import { useMemo } from 'react';
import { useSoundControls } from '../audio';
import type { SoundMenuProps } from '../ui';

/**
 * The sound effects' setting for the speaker before the viewer's avatar, or
 * nothing where the browser has no Web Audio: a control that could change
 * nothing is not shown, as no screen shows an action the player cannot take.
 */
export function useSoundMenu(): SoundMenuProps | undefined {
  const { available, settings, setVolume, setMuted } = useSoundControls();
  const { volume, muted } = settings.effects;
  return useMemo(
    () =>
      available
        ? {
            volume,
            muted,
            onVolumeChange: (next: number) => setVolume('effects', next),
            onMutedChange: (next: boolean) => setMuted('effects', next),
          }
        : undefined,
    [available, volume, muted, setVolume, setMuted],
  );
}
